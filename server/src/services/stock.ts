import { and, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { DB, Tx } from '../db/index.js';
import { expenseCategories, expenses, products, purchases, standCounts, stockMovements } from '../db/schema.js';
import { AppError, notFound, parse } from '../lib/errors.js';
import { today } from '../lib/time.js';
import { id, isoDate, note, positiveMoney, positiveQty, qty } from '../lib/validators.js';

/** Name of the expense category used for snack purchases. Created on demand. */
export const PURCHASE_CATEGORY = 'Mahsulot xaridi';

async function lockProducts(tx: Tx, ids: number[]) {
  const unique = [...new Set(ids)];
  if (unique.length !== ids.length) throw new AppError(400, 'Bitta mahsulot roʻyxatda ikki marta kiritilgan');
  const rows = await tx.select().from(products).where(inArray(products.id, unique)).for('update');
  if (rows.length !== unique.length) throw notFound('Mahsulot');
  return new Map(rows.map((r) => [r.id, r]));
}

async function purchaseCategoryId(tx: Tx) {
  const [existing] = await tx
    .select({ id: expenseCategories.id })
    .from(expenseCategories)
    .where(eq(expenseCategories.name, PURCHASE_CATEGORY));
  if (existing) return existing.id;
  const [created] = await tx
    .insert(expenseCategories)
    .values({ name: PURCHASE_CATEGORY, sortOrder: -1 })
    .onConflictDoNothing()
    .returning({ id: expenseCategories.id });
  if (created) return created.id;
  const [again] = await tx
    .select({ id: expenseCategories.id })
    .from(expenseCategories)
    .where(eq(expenseCategories.name, PURCHASE_CATEGORY));
  return again!.id;
}

// ─── Purchases ────────────────────────────────────────────────────────────────

export const purchaseInput = z.object({
  date: isoDate.optional(),
  paidFromCash: z.boolean().default(true),
  note,
  lines: z
    .array(z.object({ productId: id, qty: positiveQty, total: positiveMoney }))
    .min(1, 'kamida bitta mahsulot kiriting'),
});

/** Buy goods: they go to the warehouse, the average cost is updated and an expense is recorded. */
export async function recordPurchase(db: DB, raw: unknown) {
  const input = parse(purchaseInput, raw);
  return db.transaction(async (tx) => {
    const locked = await lockProducts(
      tx,
      input.lines.map((l) => l.productId),
    );
    const total = input.lines.reduce((s, l) => s + l.total, 0);
    const date = input.date ?? today();
    const [purchase] = await tx
      .insert(purchases)
      .values({ date, total, paidFromCash: input.paidFromCash, note: input.note })
      .returning();

    for (const line of input.lines) {
      const p = locked.get(line.productId)!;
      const onHand = p.warehouseQty + p.standQty;
      const newAvg = Math.round((onHand * p.avgCost + line.total) / (onHand + line.qty));
      await tx
        .update(products)
        .set({ warehouseQty: p.warehouseQty + line.qty, avgCost: newAvg })
        .where(eq(products.id, p.id));
      await tx.insert(stockMovements).values({
        productId: p.id,
        kind: 'purchase',
        warehouseDelta: line.qty,
        unitPrice: p.sellPrice,
        unitCost: Math.round(line.total / line.qty),
        purchaseId: purchase!.id,
      });
    }

    const names = input.lines.map((l) => `${locked.get(l.productId)!.name} × ${l.qty}`).join(', ');
    await tx.insert(expenses).values({
      date,
      categoryId: await purchaseCategoryId(tx),
      amount: total,
      paidFromCash: input.paidFromCash,
      note: input.note ? `${names} — ${input.note}` : names,
      purchaseId: purchase!.id,
    });
    return purchase!;
  });
}

export async function listPurchases(db: DB, limit = 50) {
  const rows = await db.select().from(purchases).orderBy(desc(purchases.id)).limit(limit);
  if (rows.length === 0) return [];
  const lines = await db
    .select({
      purchaseId: stockMovements.purchaseId,
      productId: stockMovements.productId,
      productName: products.name,
      qty: stockMovements.warehouseDelta,
      unitCost: stockMovements.unitCost,
    })
    .from(stockMovements)
    .innerJoin(products, eq(products.id, stockMovements.productId))
    .where(
      inArray(
        stockMovements.purchaseId,
        rows.map((r) => r.id),
      ),
    );
  const closed = await db
    .select({ purchaseId: expenses.purchaseId })
    .from(expenses)
    .where(
      and(
        inArray(
          expenses.purchaseId,
          rows.map((r) => r.id),
        ),
        isNotNull(expenses.cashCloseId),
      ),
    );
  const closedSet = new Set(closed.map((c) => c.purchaseId));
  return rows.map((r) => ({
    ...r,
    locked: closedSet.has(r.id),
    lines: lines.filter((l) => l.purchaseId === r.id),
  }));
}

/** Undo a purchase (e.g. a typo). Only possible while the goods are still in the warehouse. */
export async function deletePurchase(db: DB, purchaseId: number) {
  return db.transaction(async (tx) => {
    const [purchase] = await tx.select().from(purchases).where(eq(purchases.id, purchaseId));
    if (!purchase) throw notFound('Xarid');
    const [exp] = await tx.select().from(expenses).where(eq(expenses.purchaseId, purchaseId));
    if (exp?.cashCloseId) throw new AppError(409, 'Bu xarid kassa yopilgandan keyin oʻchirib boʻlmaydi');
    const lines = await tx.select().from(stockMovements).where(eq(stockMovements.purchaseId, purchaseId));
    const locked = await lockProducts(
      tx,
      lines.map((l) => l.productId),
    );
    for (const line of lines) {
      const p = locked.get(line.productId)!;
      if (p.warehouseQty < line.warehouseDelta) {
        throw new AppError(
          409,
          `${p.name}: omborda ${p.warehouseQty} ta qolgan, xariddagi ${line.warehouseDelta} tani qaytarib boʻlmaydi`,
        );
      }
      const onHand = p.warehouseQty + p.standQty;
      const remaining = onHand - line.warehouseDelta;
      const lineTotal = line.unitCost * line.warehouseDelta;
      const newAvg =
        remaining > 0 ? Math.max(0, Math.round((onHand * p.avgCost - lineTotal) / remaining)) : p.avgCost;
      await tx
        .update(products)
        .set({ warehouseQty: p.warehouseQty - line.warehouseDelta, avgCost: newAvg })
        .where(eq(products.id, p.id));
    }
    // Movements and the linked expense cascade.
    await tx.delete(purchases).where(eq(purchases.id, purchaseId));
  });
}

// ─── Refill (warehouse → stand) ───────────────────────────────────────────────

export const refillInput = z.object({
  note,
  lines: z.array(z.object({ productId: id, qty: positiveQty })).min(1, 'kamida bitta mahsulot kiriting'),
});

export async function refillStand(db: DB, raw: unknown) {
  const input = parse(refillInput, raw);
  return db.transaction(async (tx) => {
    const locked = await lockProducts(
      tx,
      input.lines.map((l) => l.productId),
    );
    for (const line of input.lines) {
      const p = locked.get(line.productId)!;
      if (p.warehouseQty < line.qty) {
        throw new AppError(409, `${p.name}: omborda faqat ${p.warehouseQty} ta bor`);
      }
      await tx
        .update(products)
        .set({ warehouseQty: p.warehouseQty - line.qty, standQty: p.standQty + line.qty })
        .where(eq(products.id, p.id));
      await tx.insert(stockMovements).values({
        productId: p.id,
        kind: 'refill',
        warehouseDelta: -line.qty,
        standDelta: line.qty,
        unitPrice: p.sellPrice,
        unitCost: p.avgCost,
        note: input.note,
      });
    }
    return { ok: true };
  });
}

// ─── Stand count (records snack sales) ────────────────────────────────────────

export const standCountInput = z.object({
  note,
  /**
   * When more items are counted than expected, assume an unrecorded refill and take the
   * surplus from the warehouse (if it has enough). Otherwise record a correction.
   */
  surplusFromWarehouse: z.boolean().default(true),
  lines: z.array(z.object({ productId: id, counted: qty })).min(1, 'kamida bitta mahsulot sanang'),
});

export type StandCountResult = {
  countId: number;
  soldQty: number;
  revenue: number;
  lines: {
    productId: number;
    name: string;
    expected: number;
    counted: number;
    sold: number;
    surplus: number;
    surplusSource: 'warehouse' | 'correction' | null;
    revenue: number;
  }[];
};

/**
 * Enter how many pieces are on the stand right now. Everything missing since the last
 * count/refill is recorded as sold at the current sell price.
 */
export async function recordStandCount(db: DB, raw: unknown): Promise<StandCountResult> {
  const input = parse(standCountInput, raw);
  return db.transaction(async (tx) => {
    const locked = await lockProducts(
      tx,
      input.lines.map((l) => l.productId),
    );
    const [count] = await tx.insert(standCounts).values({ note: input.note }).returning();
    const result: StandCountResult = { countId: count!.id, soldQty: 0, revenue: 0, lines: [] };

    for (const line of input.lines) {
      const p = locked.get(line.productId)!;
      const expected = p.standQty;
      const diff = line.counted - expected;
      const out: StandCountResult['lines'][number] = {
        productId: p.id,
        name: p.name,
        expected,
        counted: line.counted,
        sold: 0,
        surplus: 0,
        surplusSource: null,
        revenue: 0,
      };
      let warehouseQty = p.warehouseQty;
      if (diff < 0) {
        out.sold = -diff;
        out.revenue = out.sold * p.sellPrice;
        await tx.insert(stockMovements).values({
          productId: p.id,
          kind: 'sale',
          standDelta: diff,
          unitPrice: p.sellPrice,
          unitCost: p.avgCost,
          standCountId: count!.id,
        });
      } else if (diff > 0) {
        out.surplus = diff;
        if (input.surplusFromWarehouse && p.warehouseQty >= diff) {
          out.surplusSource = 'warehouse';
          warehouseQty -= diff;
          await tx.insert(stockMovements).values({
            productId: p.id,
            kind: 'refill',
            warehouseDelta: -diff,
            standDelta: diff,
            unitPrice: p.sellPrice,
            unitCost: p.avgCost,
            standCountId: count!.id,
            note: 'Sanashda aniqlangan toʻldirish',
          });
        } else {
          out.surplusSource = 'correction';
          await tx.insert(stockMovements).values({
            productId: p.id,
            kind: 'correction',
            standDelta: diff,
            unitPrice: p.sellPrice,
            unitCost: p.avgCost,
            standCountId: count!.id,
            note: 'Sanashda ortiqcha chiqdi',
          });
        }
      }
      if (diff !== 0) {
        await tx
          .update(products)
          .set({ standQty: line.counted, warehouseQty })
          .where(eq(products.id, p.id));
      }
      result.soldQty += out.sold;
      result.revenue += out.revenue;
      result.lines.push(out);
    }
    return result;
  });
}

export async function listStandCounts(db: DB, limit = 30) {
  return db
    .select({
      id: standCounts.id,
      note: standCounts.note,
      createdAt: standCounts.createdAt,
      soldQty: sql<number>`coalesce(sum(-${stockMovements.standDelta}) filter (where ${stockMovements.kind} = 'sale'), 0)::int`,
      revenue: sql<number>`coalesce(sum(-${stockMovements.standDelta} * ${stockMovements.unitPrice}) filter (where ${stockMovements.kind} = 'sale'), 0)::int`,
      locked: sql<boolean>`coalesce(bool_or(${stockMovements.cashCloseId} is not null), false)`,
    })
    .from(standCounts)
    .leftJoin(stockMovements, eq(stockMovements.standCountId, standCounts.id))
    .groupBy(standCounts.id)
    .orderBy(desc(standCounts.id))
    .limit(limit);
}

export async function getStandCount(db: DB, countId: number) {
  const [count] = await db.select().from(standCounts).where(eq(standCounts.id, countId));
  if (!count) throw notFound('Sanoq');
  const lines = await db
    .select({
      productId: stockMovements.productId,
      name: products.name,
      kind: stockMovements.kind,
      warehouseDelta: stockMovements.warehouseDelta,
      standDelta: stockMovements.standDelta,
      unitPrice: stockMovements.unitPrice,
    })
    .from(stockMovements)
    .innerJoin(products, eq(products.id, stockMovements.productId))
    .where(eq(stockMovements.standCountId, countId));
  return { ...count, lines };
}

/** Undo a wrong count. Not allowed once its sales are included in a closed cash period. */
export async function deleteStandCount(db: DB, countId: number) {
  return db.transaction(async (tx) => {
    const [count] = await tx.select().from(standCounts).where(eq(standCounts.id, countId));
    if (!count) throw notFound('Sanoq');
    const lines = await tx.select().from(stockMovements).where(eq(stockMovements.standCountId, countId));
    if (lines.some((l) => l.cashCloseId)) {
      throw new AppError(409, 'Bu sanoqdagi savdo kassa yopilganda hisoblangan, endi oʻchirib boʻlmaydi');
    }
    const locked = await lockProducts(tx, [...new Set(lines.map((l) => l.productId))]);
    for (const line of lines) {
      const p = locked.get(line.productId)!;
      p.standQty -= line.standDelta;
      p.warehouseQty -= line.warehouseDelta;
      if (p.standQty < 0 || p.warehouseQty < 0) {
        throw new AppError(409, `${p.name}: sanoqni bekor qilsak qoldiq manfiy boʻlib qoladi`);
      }
    }
    for (const p of locked.values()) {
      await tx
        .update(products)
        .set({ standQty: p.standQty, warehouseQty: p.warehouseQty })
        .where(eq(products.id, p.id));
    }
    await tx.delete(standCounts).where(eq(standCounts.id, countId));
  });
}

// ─── Write-offs and corrections ───────────────────────────────────────────────

export const writeOffInput = z.object({
  productId: id,
  from: z.enum(['warehouse', 'stand']),
  qty: positiveQty,
  note,
});

/** Remove goods that were not sold: expired, damaged, given away. Counted as a loss at cost. */
export async function writeOff(db: DB, raw: unknown) {
  const input = parse(writeOffInput, raw);
  return db.transaction(async (tx) => {
    const p = (await lockProducts(tx, [input.productId])).get(input.productId)!;
    const have = input.from === 'warehouse' ? p.warehouseQty : p.standQty;
    if (have < input.qty) {
      throw new AppError(409, `${p.name}: ${input.from === 'warehouse' ? 'omborda' : 'vitrinada'} faqat ${have} ta bor`);
    }
    const wd = input.from === 'warehouse' ? -input.qty : 0;
    const sd = input.from === 'stand' ? -input.qty : 0;
    await tx
      .update(products)
      .set({ warehouseQty: p.warehouseQty + wd, standQty: p.standQty + sd })
      .where(eq(products.id, p.id));
    await tx.insert(stockMovements).values({
      productId: p.id,
      kind: 'writeoff',
      warehouseDelta: wd,
      standDelta: sd,
      unitPrice: p.sellPrice,
      unitCost: p.avgCost,
      note: input.note,
    });
    return { ok: true };
  });
}

export const correctionInput = z.object({
  productId: id,
  warehouseQty: qty.optional(),
  standQty: qty.optional(),
  note,
});

/** Set the exact quantity after a recount, without recording a sale. */
export async function correctStock(db: DB, raw: unknown) {
  const input = parse(correctionInput, raw);
  return db.transaction(async (tx) => {
    const p = (await lockProducts(tx, [input.productId])).get(input.productId)!;
    const wd = input.warehouseQty === undefined ? 0 : input.warehouseQty - p.warehouseQty;
    const sd = input.standQty === undefined ? 0 : input.standQty - p.standQty;
    if (wd === 0 && sd === 0) return { ok: true };
    await tx
      .update(products)
      .set({ warehouseQty: p.warehouseQty + wd, standQty: p.standQty + sd })
      .where(eq(products.id, p.id));
    await tx.insert(stockMovements).values({
      productId: p.id,
      kind: 'correction',
      warehouseDelta: wd,
      standDelta: sd,
      unitPrice: p.sellPrice,
      unitCost: p.avgCost,
      note: input.note,
    });
    return { ok: true };
  });
}
