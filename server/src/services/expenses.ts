import { and, asc, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { DB } from '../db/index.js';
import { expenseCategories, expenses } from '../db/schema.js';
import { AppError, notFound, parse } from '../lib/errors.js';
import { today } from '../lib/time.js';
import { id, isoDate, note, positiveMoney } from '../lib/validators.js';

// ─── Categories ───────────────────────────────────────────────────────────────

const categoryInput = z.object({
  name: z.string().trim().min(1, 'nom kiritilmagan').max(60),
  sortOrder: z.number().int().default(0),
});

export async function listCategories(db: DB) {
  return db.select().from(expenseCategories).orderBy(asc(expenseCategories.sortOrder), asc(expenseCategories.name));
}

export async function createCategory(db: DB, raw: unknown) {
  const input = parse(categoryInput, raw);
  const [c] = await db.insert(expenseCategories).values(input).onConflictDoNothing().returning();
  if (!c) throw new AppError(409, `“${input.name}” turkumi allaqachon bor`);
  return c;
}

export async function updateCategory(db: DB, categoryId: number, raw: unknown) {
  const input = parse(categoryInput.partial(), raw);
  try {
    const [c] = await db.update(expenseCategories).set(input).where(eq(expenseCategories.id, categoryId)).returning();
    if (!c) throw notFound('Turkum');
    return c;
  } catch (e) {
    if ((e as { code?: string }).code === '23505') throw new AppError(409, 'Bunday nomli turkum allaqachon bor');
    throw e;
  }
}

export async function deleteCategory(db: DB, categoryId: number) {
  const [used] = await db.select({ id: expenses.id }).from(expenses).where(eq(expenses.categoryId, categoryId)).limit(1);
  if (used) throw new AppError(409, 'Bu turkumda xarajatlar bor, uni oʻchirib boʻlmaydi');
  const r = await db.delete(expenseCategories).where(eq(expenseCategories.id, categoryId)).returning();
  if (r.length === 0) throw notFound('Turkum');
}

// ─── Expenses ─────────────────────────────────────────────────────────────────

export const expenseInput = z.object({
  date: isoDate.optional(),
  categoryId: id,
  amount: positiveMoney,
  paidFromCash: z.boolean().default(true),
  note,
});

export const expenseQuery = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
  categoryId: z.coerce.number().int().positive().optional(),
});

export async function listExpenses(db: DB, raw: unknown) {
  const q = parse(expenseQuery, raw);
  const where = and(
    q.from ? gte(expenses.date, q.from) : undefined,
    q.to ? lte(expenses.date, q.to) : undefined,
    q.categoryId ? eq(expenses.categoryId, q.categoryId) : undefined,
  );
  const rows = await db
    .select({
      id: expenses.id,
      date: expenses.date,
      categoryId: expenses.categoryId,
      categoryName: expenseCategories.name,
      amount: expenses.amount,
      paidFromCash: expenses.paidFromCash,
      note: expenses.note,
      purchaseId: expenses.purchaseId,
      locked: sql<boolean>`${expenses.cashCloseId} is not null`,
      createdAt: expenses.createdAt,
    })
    .from(expenses)
    .innerJoin(expenseCategories, eq(expenseCategories.id, expenses.categoryId))
    .where(where)
    .orderBy(desc(expenses.date), desc(expenses.id))
    .limit(500);
  const total = rows.reduce((s, r) => s + r.amount, 0);
  return { rows, total };
}

async function assertCategory(db: DB, categoryId: number) {
  const [c] = await db.select().from(expenseCategories).where(eq(expenseCategories.id, categoryId));
  if (!c) throw notFound('Turkum');
}

export async function createExpense(db: DB, raw: unknown) {
  const input = parse(expenseInput, raw);
  await assertCategory(db, input.categoryId);
  const [e] = await db
    .insert(expenses)
    .values({ ...input, date: input.date ?? today() })
    .returning();
  return e!;
}

async function getEditable(db: DB, expenseId: number) {
  const [e] = await db.select().from(expenses).where(eq(expenses.id, expenseId));
  if (!e) throw notFound('Xarajat');
  if (e.purchaseId) throw new AppError(409, 'Bu xarajat mahsulot xaridiga bogʻlangan. Uni “Xarid” sahifasidan oʻzgartiring.');
  if (e.cashCloseId) throw new AppError(409, 'Kassa yopilgan, bu xarajatni oʻzgartirib boʻlmaydi');
  return e;
}

export async function updateExpense(db: DB, expenseId: number, raw: unknown) {
  const input = parse(expenseInput.partial(), raw);
  await getEditable(db, expenseId);
  if (input.categoryId) await assertCategory(db, input.categoryId);
  const [e] = await db.update(expenses).set(input).where(eq(expenses.id, expenseId)).returning();
  return e!;
}

export async function deleteExpense(db: DB, expenseId: number) {
  await getEditable(db, expenseId);
  await db.delete(expenses).where(eq(expenses.id, expenseId));
}
