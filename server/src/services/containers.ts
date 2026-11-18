import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { DB, Tx } from '../db/index.js';
import { containerMovements, containers, expenseCategories, expenses } from '../db/schema.js';
import { AppError, notFound, parse } from '../lib/errors.js';
import { today } from '../lib/time.js';
import { id, isoDate, money, name, note, patchOf, positiveQty, qty } from '../lib/validators.js';

/**
 * Containers: the bottles (kraft, transparent) and cups drinks are served in.
 * Stock goes down automatically when a drinks sheet is saved (usage), and up when containers
 * are received. A count shows whether the stock matches what the sheets say was used.
 */

export const CONTAINER_EXPENSE_CATEGORY = 'Stakan va qopqoqlar';

export async function listContainers(db: DB, opts: { includeInactive?: boolean } = {}) {
  return db
    .select()
    .from(containers)
    .where(opts.includeInactive ? undefined : eq(containers.active, true))
    .orderBy(asc(containers.sortOrder), asc(containers.id));
}

async function getContainer(db: DB | Tx, containerId: number) {
  const [c] = await db.select().from(containers).where(eq(containers.id, containerId));
  if (!c) throw notFound('Idish');
  return c;
}

const containerInput = z.object({
  name,
  lowStockLevel: qty.default(0),
  sortOrder: z.number().int().default(0),
  active: z.boolean().default(true),
});

export async function createContainer(db: DB, raw: unknown) {
  const input = parse(containerInput, raw);
  try {
    const [c] = await db.insert(containers).values(input).returning();
    return c!;
  } catch (e) {
    if ((e as { code?: string }).code === '23505') throw new AppError(409, `“${input.name}” allaqachon bor`);
    throw e;
  }
}

export async function updateContainer(db: DB, containerId: number, raw: unknown) {
  const input = parse(patchOf(containerInput), raw);
  await getContainer(db, containerId);
  if (Object.keys(input).length === 0) return getContainer(db, containerId);
  try {
    const [c] = await db.update(containers).set(input).where(eq(containers.id, containerId)).returning();
    return c!;
  } catch (e) {
    if ((e as { code?: string }).code === '23505') throw new AppError(409, 'Bunday nomli idish allaqachon bor');
    throw e;
  }
}

async function lockContainer(tx: Tx, containerId: number) {
  const [c] = await tx.select().from(containers).where(eq(containers.id, containerId)).for('update');
  if (!c) throw notFound('Idish');
  return c;
}

async function expenseCategoryId(tx: Tx) {
  const [existing] = await tx
    .select({ id: expenseCategories.id })
    .from(expenseCategories)
    .where(eq(expenseCategories.name, CONTAINER_EXPENSE_CATEGORY));
  if (existing) return existing.id;
  await tx.insert(expenseCategories).values({ name: CONTAINER_EXPENSE_CATEGORY, sortOrder: 50 }).onConflictDoNothing();
  const [c] = await tx
    .select({ id: expenseCategories.id })
    .from(expenseCategories)
    .where(eq(expenseCategories.name, CONTAINER_EXPENSE_CATEGORY));
  return c!.id;
}

// ─── Receive / count / write off ──────────────────────────────────────────────

export const receiveInput = z.object({
  containerId: id,
  qty: positiveQty,
  /** Optional: what was paid. Creates an expense. */
  total: money.optional().nullable(),
  paidFromCash: z.boolean().default(true),
  date: isoDate.optional(),
  note,
});

export async function receiveContainers(db: DB, raw: unknown) {
  const input = parse(receiveInput, raw);
  return db.transaction(async (tx) => {
    const c = await lockContainer(tx, input.containerId);
    let expenseId: number | null = null;
    if (input.total) {
      const [e] = await tx
        .insert(expenses)
        .values({
          date: input.date ?? today(),
          categoryId: await expenseCategoryId(tx),
          amount: input.total,
          paidFromCash: input.paidFromCash,
          note: `${c.name} × ${input.qty}${input.note ? ` — ${input.note}` : ''}`,
        })
        .returning({ id: expenses.id });
      expenseId = e!.id;
    }
    await tx.update(containers).set({ stockQty: c.stockQty + input.qty }).where(eq(containers.id, c.id));
    const [m] = await tx
      .insert(containerMovements)
      .values({ containerId: c.id, kind: 'purchase', delta: input.qty, expenseId, note: input.note })
      .returning();
    return m!;
  });
}

export const countInput = z.object({ containerId: id, counted: qty, note });

/** Enter how many are actually in stock. The difference to the expected stock is recorded. */
export async function countContainers(db: DB, raw: unknown) {
  const input = parse(countInput, raw);
  return db.transaction(async (tx) => {
    const c = await lockContainer(tx, input.containerId);
    const difference = input.counted - c.stockQty;
    await tx.update(containers).set({ stockQty: input.counted }).where(eq(containers.id, c.id));
    await tx.insert(containerMovements).values({ containerId: c.id, kind: 'count', delta: difference, note: input.note });
    return { expected: c.stockQty, counted: input.counted, difference };
  });
}

export const containerWriteOffInput = z.object({ containerId: id, qty: positiveQty, note });

export async function writeOffContainers(db: DB, raw: unknown) {
  const input = parse(containerWriteOffInput, raw);
  return db.transaction(async (tx) => {
    const c = await lockContainer(tx, input.containerId);
    await tx.update(containers).set({ stockQty: c.stockQty - input.qty }).where(eq(containers.id, c.id));
    await tx.insert(containerMovements).values({ containerId: c.id, kind: 'writeoff', delta: -input.qty, note: input.note });
    return { ok: true };
  });
}

/** Undo a receive / count / write-off. Usage is undone by editing the drinks sheet. */
export async function deleteContainerMovement(db: DB, movementId: number) {
  return db.transaction(async (tx) => {
    const [m] = await tx.select().from(containerMovements).where(eq(containerMovements.id, movementId));
    if (!m) throw notFound('Yozuv');
    if (m.kind === 'usage') throw new AppError(409, 'Bu yozuv ichimliklar varagʻidan. Uni varaqni tahrirlab oʻzgartiring.');
    if (m.expenseId) {
      const [e] = await tx.select().from(expenses).where(eq(expenses.id, m.expenseId));
      if (e?.cashCloseId) throw new AppError(409, 'Bu xarid kassa yopilgandan keyin oʻchirib boʻlmaydi');
      if (e) await tx.delete(expenses).where(eq(expenses.id, e.id));
    }
    const c = await lockContainer(tx, m.containerId);
    await tx.update(containers).set({ stockQty: c.stockQty - m.delta }).where(eq(containers.id, c.id));
    await tx.delete(containerMovements).where(eq(containerMovements.id, movementId));
  });
}

export const containerMovementsQuery = z.object({
  containerId: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export async function listContainerMovements(db: DB, raw: unknown) {
  const q = parse(containerMovementsQuery, raw);
  return db
    .select({
      id: containerMovements.id,
      containerId: containerMovements.containerId,
      containerName: containers.name,
      kind: containerMovements.kind,
      delta: containerMovements.delta,
      sheetDate: sql<string | null>`(select to_char(s.date, 'YYYY-MM-DD') from drink_sheets s where s.id = ${containerMovements.sheetId})`,
      hasExpense: sql<boolean>`${containerMovements.expenseId} is not null`,
      note: containerMovements.note,
      createdAt: containerMovements.createdAt,
    })
    .from(containerMovements)
    .innerJoin(containers, eq(containers.id, containerMovements.containerId))
    .where(q.containerId ? eq(containerMovements.containerId, q.containerId) : undefined)
    .orderBy(desc(containerMovements.id))
    .limit(q.limit);
}

// ─── Usage from drinks sheets ─────────────────────────────────────────────────

export async function cupContainerId(db: DB | Tx): Promise<number | null> {
  const [c] = await db
    .select({ id: containers.id })
    .from(containers)
    .where(eq(containers.isCup, true))
    .orderBy(asc(containers.id))
    .limit(1);
  return c?.id ?? null;
}

/**
 * How many containers a set of sheet lines uses: each drink uses its bottle, except the
 * pieces served in a cup.
 */
export function computeUsage(
  lines: { soldQty: number; giftQty: number; cupQty: number; containerId: number | null }[],
  cupId: number | null,
) {
  const usage = new Map<number, number>();
  const add = (cid: number | null, n: number) => {
    if (cid === null || n <= 0) return;
    usage.set(cid, (usage.get(cid) ?? 0) + n);
  };
  for (const l of lines) {
    add(l.containerId, l.soldQty + l.giftQty - l.cupQty);
    add(cupId, l.cupQty);
  }
  return usage;
}

/** Remove a sheet's usage from stock (before re-saving or deleting it). */
export async function removeSheetUsage(tx: Tx, sheetId: number) {
  const old = await tx
    .select({ containerId: containerMovements.containerId, delta: containerMovements.delta })
    .from(containerMovements)
    .where(and(eq(containerMovements.sheetId, sheetId), eq(containerMovements.kind, 'usage')));
  for (const m of old) {
    await tx
      .update(containers)
      .set({ stockQty: sql`${containers.stockQty} - ${m.delta}` })
      .where(eq(containers.id, m.containerId));
  }
  await tx
    .delete(containerMovements)
    .where(and(eq(containerMovements.sheetId, sheetId), eq(containerMovements.kind, 'usage')));
}

export async function applySheetUsage(tx: Tx, sheetId: number, date: string, usage: Map<number, number>) {
  for (const [containerId, n] of usage) {
    await tx
      .update(containers)
      .set({ stockQty: sql`${containers.stockQty} - ${n}` })
      .where(eq(containers.id, containerId));
    await tx.insert(containerMovements).values({
      containerId,
      kind: 'usage',
      delta: -n,
      sheetId,
      note: `Varaq: ${date}`,
    });
  }
}
