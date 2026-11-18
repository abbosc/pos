import { and, asc, desc, eq, isNull, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { DB } from '../db/index.js';
import { containers, drinkSheetContainerCounts, drinkSheetLines, drinkSheets, drinks } from '../db/schema.js';
import { AppError, notFound, parse } from '../lib/errors.js';
import { id, isoDate, money, name, note, patchOf, qty } from '../lib/validators.js';
import { applySheetUsage, computeUsage, cupContainerId, removeSheetUsage } from './containers.js';

export const drinkInput = z.object({
  name,
  groupName: z.string().trim().max(60).default(''),
  price: money,
  costPerCup: money.nullable().default(null),
  containerId: id.nullable().default(null),
  allowCup: z.boolean().default(false),
  sortOrder: z.number().int().default(0),
  active: z.boolean().default(true),
});

export async function listDrinks(db: DB, opts: { includeInactive?: boolean } = {}) {
  return db
    .select()
    .from(drinks)
    .where(opts.includeInactive ? undefined : eq(drinks.active, true))
    .orderBy(asc(drinks.sortOrder), asc(drinks.id));
}

export async function getDrink(db: DB, drinkId: number) {
  const [d] = await db.select().from(drinks).where(eq(drinks.id, drinkId));
  if (!d) throw notFound('Ichimlik');
  return d;
}

async function assertNameFree(db: DB, value: string, exceptId?: number) {
  const [dup] = await db
    .select({ id: drinks.id })
    .from(drinks)
    .where(and(sql`lower(${drinks.name}) = lower(${value})`, exceptId ? ne(drinks.id, exceptId) : undefined));
  if (dup) throw new AppError(409, `“${value}” nomli ichimlik allaqachon bor`);
}

async function assertContainer(db: DB, containerId: number | null | undefined) {
  if (!containerId) return;
  const [c] = await db.select({ id: containers.id }).from(containers).where(eq(containers.id, containerId));
  if (!c) throw notFound('Idish');
}

export async function createDrink(db: DB, raw: unknown) {
  const input = parse(drinkInput, raw);
  await assertNameFree(db, input.name);
  await assertContainer(db, input.containerId);
  if (input.sortOrder === 0) {
    const [{ max }] = (await db.select({ max: sql<number>`coalesce(max(${drinks.sortOrder}), 0)::int` }).from(drinks)) as [
      { max: number },
    ];
    input.sortOrder = max + 10;
  }
  const [d] = await db.insert(drinks).values(input).returning();
  return d!;
}

export async function updateDrink(db: DB, drinkId: number, raw: unknown) {
  const input = parse(patchOf(drinkInput), raw);
  await getDrink(db, drinkId);
  if (input.name) await assertNameFree(db, input.name, drinkId);
  await assertContainer(db, input.containerId);
  if (Object.keys(input).length === 0) return getDrink(db, drinkId);
  return db.transaction(async (tx) => {
    const [d] = await tx.update(drinks).set(input).where(eq(drinks.id, drinkId)).returning();
    // Sheets saved before the cost was known get it now, so their profit can be calculated.
    // Lines that already have a cost keep the cost of their day.
    if (input.costPerCup !== undefined && input.costPerCup !== null) {
      await tx
        .update(drinkSheetLines)
        .set({ unitCost: input.costPerCup })
        .where(and(eq(drinkSheetLines.drinkId, drinkId), isNull(drinkSheetLines.unitCost)));
    }
    return d!;
  });
}

export async function setDrinkImage(db: DB, drinkId: number, imagePath: string | null) {
  const old = await getDrink(db, drinkId);
  await db.update(drinks).set({ imagePath }).where(eq(drinks.id, drinkId));
  return old.imagePath;
}

export async function deleteDrink(db: DB, drinkId: number) {
  const d = await getDrink(db, drinkId);
  const [used] = await db
    .select({ id: drinkSheetLines.drinkId })
    .from(drinkSheetLines)
    .where(eq(drinkSheetLines.drinkId, drinkId))
    .limit(1);
  if (used) throw new AppError(409, 'Bu ichimlik varaqlarda ishlatilgan. Oʻchirish oʻrniga “faol emas” qilib qoʻying.');
  await db.delete(drinks).where(eq(drinks.id, drinkId));
  return d.imagePath;
}

// ─── Daily sheet ──────────────────────────────────────────────────────────────

export type SheetLine = {
  drinkId: number;
  name: string;
  groupName: string;
  imagePath: string | null;
  price: number;
  costPerCup: number | null;
  /** Bottle used on that day (saved), or the drink's current bottle for new entries. */
  containerId: number | null;
  allowCup: boolean;
  soldQty: number;
  giftQty: number;
  cupQty: number;
};

/** The sheet for a date with a row for every active drink (and any inactive drink that has numbers). */
export async function getSheet(db: DB, date: string) {
  parse(isoDate, date);
  const [sheet] = await db.select().from(drinkSheets).where(eq(drinkSheets.date, date));
  const allDrinks = await listDrinks(db, { includeInactive: true });
  const lines = sheet
    ? await db.select().from(drinkSheetLines).where(eq(drinkSheetLines.sheetId, sheet.id))
    : [];
  const byDrink = new Map(lines.map((l) => [l.drinkId, l]));
  const rows: SheetLine[] = [];
  for (const d of allDrinks) {
    const l = byDrink.get(d.id);
    if (!d.active && !l) continue;
    rows.push({
      drinkId: d.id,
      name: d.name,
      groupName: d.groupName,
      imagePath: d.imagePath,
      price: l?.unitPrice ?? d.price,
      costPerCup: l ? l.unitCost : d.costPerCup,
      containerId: l?.containerId ?? d.containerId,
      allowCup: d.allowCup || (l?.cupQty ?? 0) > 0,
      soldQty: l?.soldQty ?? 0,
      giftQty: l?.giftQty ?? 0,
      cupQty: l?.cupQty ?? 0,
    });
  }
  const totals = rows.reduce(
    (t, r) => {
      t.soldQty += r.soldQty;
      t.giftQty += r.giftQty;
      t.cupQty += r.cupQty;
      t.revenue += r.soldQty * r.price;
      return t;
    },
    { soldQty: 0, giftQty: 0, cupQty: 0, revenue: 0 },
  );
  const counts = sheet
    ? await db.select().from(drinkSheetContainerCounts).where(eq(drinkSheetContainerCounts.sheetId, sheet.id))
    : [];
  const cupId = await cupContainerId(db);
  const usage = computeUsage(rows, cupId);
  return {
    date,
    exists: Boolean(sheet),
    note: sheet?.note ?? null,
    locked: Boolean(sheet?.cashCloseId),
    updatedAt: sheet?.updatedAt ?? null,
    lines: rows,
    totals,
    cupContainerId: cupId,
    /** Containers used according to the sheet, and the count entered for that day (if any). */
    containerCounts: counts.map((c) => ({ containerId: c.containerId, countedUsed: c.countedUsed })),
    containerUsage: [...usage.entries()].map(([containerId, used]) => ({ containerId, used })),
  };
}

export const sheetInput = z.object({
  note,
  lines: z.array(z.object({ drinkId: id, soldQty: qty, giftQty: qty, cupQty: qty.default(0) })),
  /** Containers counted as used that day. Omit to keep what was saved; null removes a count. */
  containerCounts: z.array(z.object({ containerId: id, countedUsed: qty.nullable() })).optional(),
});

export async function saveSheet(db: DB, date: string, raw: unknown) {
  parse(isoDate, date);
  const input = parse(sheetInput, raw);
  await db.transaction(async (tx) => {
    let [sheet] = await tx.select().from(drinkSheets).where(eq(drinkSheets.date, date)).for('update');
    if (sheet?.cashCloseId) {
      throw new AppError(409, 'Bu kunning kassasi yopilgan. Oʻzgartirish uchun avval kassani qayta oching.');
    }
    if (!sheet) {
      [sheet] = await tx.insert(drinkSheets).values({ date, note: input.note }).returning();
    } else {
      await tx
        .update(drinkSheets)
        .set({ note: input.note, updatedAt: new Date() })
        .where(eq(drinkSheets.id, sheet.id));
    }
    const existing = await tx.select().from(drinkSheetLines).where(eq(drinkSheetLines.sheetId, sheet!.id));
    const existingBy = new Map(existing.map((l) => [l.drinkId, l]));
    const drinkRows = await tx.select().from(drinks);
    const drinkBy = new Map(drinkRows.map((d) => [d.id, d]));

    await tx.delete(drinkSheetLines).where(eq(drinkSheetLines.sheetId, sheet!.id));
    const seen = new Set<number>();
    const values = [];
    for (const l of input.lines) {
      if (seen.has(l.drinkId)) throw new AppError(400, 'Bitta ichimlik ikki marta kiritilgan');
      seen.add(l.drinkId);
      if (l.soldQty === 0 && l.giftQty === 0) continue;
      const d = drinkBy.get(l.drinkId);
      if (!d) throw notFound('Ichimlik');
      if (l.cupQty > l.soldQty + l.giftQty) {
        throw new AppError(400, `${d.name}: stakandagilar soni sotilgan va sovgʻadan koʻp boʻlishi mumkin emas`);
      }
      const prev = existingBy.get(l.drinkId);
      values.push({
        sheetId: sheet!.id,
        drinkId: l.drinkId,
        soldQty: l.soldQty,
        giftQty: l.giftQty,
        cupQty: l.cupQty,
        // Keep the price that applied on that day when editing an existing sheet.
        unitPrice: prev?.unitPrice ?? d.price,
        unitCost: prev ? prev.unitCost : d.costPerCup,
        containerId: prev?.containerId ?? d.containerId,
      });
    }
    if (values.length) await tx.insert(drinkSheetLines).values(values);

    // Containers: replace this sheet's usage with the new numbers.
    await removeSheetUsage(tx, sheet!.id);
    await applySheetUsage(tx, sheet!.id, date, computeUsage(values, await cupContainerId(tx)));

    if (input.containerCounts) {
      await tx.delete(drinkSheetContainerCounts).where(eq(drinkSheetContainerCounts.sheetId, sheet!.id));
      const counts = input.containerCounts.filter((c) => c.countedUsed !== null);
      if (counts.length) {
        await tx.insert(drinkSheetContainerCounts).values(
          counts.map((c) => ({ sheetId: sheet!.id, containerId: c.containerId, countedUsed: c.countedUsed! })),
        );
      }
    }
  });
  return getSheet(db, date);
}

export async function deleteSheet(db: DB, date: string) {
  const [sheet] = await db.select().from(drinkSheets).where(eq(drinkSheets.date, date));
  if (!sheet) throw notFound('Varaq');
  if (sheet.cashCloseId) throw new AppError(409, 'Bu kunning kassasi yopilgan, varaqni oʻchirib boʻlmaydi');
  await db.transaction(async (tx) => {
    await removeSheetUsage(tx, sheet.id);
    await tx.delete(drinkSheets).where(eq(drinkSheets.id, sheet.id));
  });
}

export async function listSheets(db: DB, limit = 60) {
  return db
    .select({
      date: drinkSheets.date,
      locked: sql<boolean>`${drinkSheets.cashCloseId} is not null`,
      soldQty: sql<number>`coalesce(sum(${drinkSheetLines.soldQty}), 0)::int`,
      giftQty: sql<number>`coalesce(sum(${drinkSheetLines.giftQty}), 0)::int`,
      revenue: sql<number>`coalesce(sum(${drinkSheetLines.soldQty} * ${drinkSheetLines.unitPrice}), 0)::int`,
    })
    .from(drinkSheets)
    .leftJoin(drinkSheetLines, eq(drinkSheetLines.sheetId, drinkSheets.id))
    .groupBy(drinkSheets.id)
    .orderBy(desc(drinkSheets.date))
    .limit(limit);
}
