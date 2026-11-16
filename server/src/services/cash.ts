import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { DB, Executor } from '../db/index.js';
import { cashCloses, cashMovements, drinkSheetLines, drinkSheets, expenses, stockMovements } from '../db/schema.js';
import { bus } from '../lib/events.js';
import { AppError, notFound, parse } from '../lib/errors.js';
import { money, note, positiveMoney } from '../lib/validators.js';

/**
 * The cash desk works in periods. A period starts at the last close (its counted amount is the
 * opening cash) and contains every cash-affecting record not yet linked to a close:
 *   expected = opening + snack sales + drink sales − expenses paid from cash − withdrawals + deposits
 */
export async function cashStatus(db: Executor) {
  const [last] = await db.select().from(cashCloses).orderBy(desc(cashCloses.id)).limit(1);
  const opening = last?.counted ?? 0;

  const [snack] = await db
    .select({
      total: sql<number>`coalesce(sum(-${stockMovements.standDelta} * ${stockMovements.unitPrice}), 0)::int`,
      qty: sql<number>`coalesce(sum(-${stockMovements.standDelta}), 0)::int`,
    })
    .from(stockMovements)
    .where(and(eq(stockMovements.kind, 'sale'), isNull(stockMovements.cashCloseId)));

  const sheets = await db
    .select({
      date: drinkSheets.date,
      total: sql<number>`coalesce(sum(${drinkSheetLines.soldQty} * ${drinkSheetLines.unitPrice}), 0)::int`,
    })
    .from(drinkSheets)
    .leftJoin(drinkSheetLines, eq(drinkSheetLines.sheetId, drinkSheets.id))
    .where(isNull(drinkSheets.cashCloseId))
    .groupBy(drinkSheets.id)
    .orderBy(drinkSheets.date);

  const [exp] = await db
    .select({ total: sql<number>`coalesce(sum(${expenses.amount}), 0)::int` })
    .from(expenses)
    .where(and(eq(expenses.paidFromCash, true), isNull(expenses.cashCloseId)));

  const [mov] = await db
    .select({
      withdrawals: sql<number>`coalesce(sum(${cashMovements.amount}) filter (where ${cashMovements.kind} = 'withdrawal'), 0)::int`,
      deposits: sql<number>`coalesce(sum(${cashMovements.amount}) filter (where ${cashMovements.kind} = 'deposit'), 0)::int`,
    })
    .from(cashMovements)
    .where(isNull(cashMovements.cashCloseId));

  const drinkSales = sheets.reduce((s, r) => s + r.total, 0);
  const snackSales = snack?.total ?? 0;
  const cashExpenses = exp?.total ?? 0;
  const withdrawals = mov?.withdrawals ?? 0;
  const deposits = mov?.deposits ?? 0;
  return {
    hasOpening: Boolean(last),
    lastClose: last ? { ...last, difference: last.counted - last.expected } : null,
    opening,
    snackSales,
    snackSoldQty: snack?.qty ?? 0,
    drinkSales,
    drinkSheetDates: sheets.map((s) => s.date),
    cashExpenses,
    withdrawals,
    deposits,
    expected: opening + snackSales + drinkSales - cashExpenses - withdrawals + deposits,
  };
}

export const closeInput = z.object({
  counted: money,
  note,
  /** The very first close just records how much money is in the desk. */
  isOpening: z.boolean().default(false),
});

/** Count the money in the desk and close the current period. */
export async function closeCash(db: DB, raw: unknown) {
  const input = parse(closeInput, raw);
  const result = await db.transaction(async (tx) => {
    // Serialize closes.
    await tx.execute(sql`select pg_advisory_xact_lock(778201)`);
    const status = await cashStatus(tx);
    if (input.isOpening && status.hasOpening) {
      throw new AppError(409, 'Boshlangʻich pul allaqachon kiritilgan. Kassani odatdagidek yoping.');
    }
    const expected = input.isOpening ? input.counted : status.expected;
    const [close] = await tx
      .insert(cashCloses)
      .values({ expected, counted: input.counted, isOpening: input.isOpening, note: input.note })
      .returning();
    const cid = close!.id;
    await tx
      .update(stockMovements)
      .set({ cashCloseId: cid })
      .where(and(eq(stockMovements.kind, 'sale'), isNull(stockMovements.cashCloseId)));
    await tx.update(drinkSheets).set({ cashCloseId: cid }).where(isNull(drinkSheets.cashCloseId));
    await tx
      .update(expenses)
      .set({ cashCloseId: cid })
      .where(and(eq(expenses.paidFromCash, true), isNull(expenses.cashCloseId)));
    await tx.update(cashMovements).set({ cashCloseId: cid }).where(isNull(cashMovements.cashCloseId));
    return { close: close!, status };
  });
  const { close, status } = result;
  const summary = {
    closeId: close.id,
    expected: close.expected,
    counted: close.counted,
    difference: close.counted - close.expected,
    snackSales: status.snackSales,
    drinkSales: status.drinkSales,
    cashExpenses: status.cashExpenses,
    withdrawals: status.withdrawals,
    deposits: status.deposits,
    opening: status.opening,
  };
  if (!input.isOpening) bus.emit('cash.closed', summary);
  return summary;
}

/** Undo the most recent close, e.g. to fix a sheet entered with a mistake. */
export async function reopenLastClose(db: DB) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(778201)`);
    const [last] = await tx.select().from(cashCloses).orderBy(desc(cashCloses.id)).limit(1);
    if (!last) throw new AppError(409, 'Hali kassa yopilmagan');
    const cid = last.id;
    await tx.update(stockMovements).set({ cashCloseId: null }).where(eq(stockMovements.cashCloseId, cid));
    await tx.update(drinkSheets).set({ cashCloseId: null }).where(eq(drinkSheets.cashCloseId, cid));
    await tx.update(expenses).set({ cashCloseId: null }).where(eq(expenses.cashCloseId, cid));
    await tx.update(cashMovements).set({ cashCloseId: null }).where(eq(cashMovements.cashCloseId, cid));
    await tx.delete(cashCloses).where(eq(cashCloses.id, cid));
    return { ok: true };
  });
}

export async function listCloses(db: DB, limit = 60) {
  const rows = await db.select().from(cashCloses).orderBy(desc(cashCloses.id)).limit(limit);
  return rows.map((r) => ({ ...r, difference: r.counted - r.expected }));
}

export const cashMovementInput = z.object({
  kind: z.enum(['withdrawal', 'deposit']),
  amount: positiveMoney,
  note,
});

export async function addCashMovement(db: DB, raw: unknown) {
  const input = parse(cashMovementInput, raw);
  const [m] = await db.insert(cashMovements).values(input).returning();
  return m!;
}

export async function listCashMovements(db: DB, limit = 60) {
  const rows = await db.select().from(cashMovements).orderBy(desc(cashMovements.id)).limit(limit);
  return rows.map((r) => ({ ...r, locked: r.cashCloseId !== null }));
}

export async function deleteCashMovement(db: DB, movementId: number) {
  const [m] = await db.select().from(cashMovements).where(eq(cashMovements.id, movementId));
  if (!m) throw notFound('Yozuv');
  if (m.cashCloseId) throw new AppError(409, 'Kassa yopilgan, bu yozuvni oʻchirib boʻlmaydi');
  await db.delete(cashMovements).where(eq(cashMovements.id, movementId));
}
