import { and, asc, desc, eq, lt, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { DB } from '../db/index.js';
import { products, stockMovements } from '../db/schema.js';
import { AppError, notFound, parse } from '../lib/errors.js';
import { money, name, qty } from '../lib/validators.js';

export const createProductInput = z.object({
  name,
  sellPrice: money,
  cost: money.default(0),
  warehouseQty: qty.default(0),
  standQty: qty.default(0),
  lowStockLevel: qty.default(0),
  sortOrder: z.number().int().default(0),
});

export const updateProductInput = z.object({
  name: name.optional(),
  sellPrice: money.optional(),
  avgCost: money.optional(),
  lowStockLevel: qty.optional(),
  sortOrder: z.number().int().optional(),
  active: z.boolean().optional(),
});

export type Product = typeof products.$inferSelect;

export async function listProducts(db: DB, opts: { includeInactive?: boolean } = {}) {
  return db
    .select()
    .from(products)
    .where(opts.includeInactive ? undefined : eq(products.active, true))
    .orderBy(asc(products.sortOrder), asc(products.name));
}

export async function getProduct(db: DB, productId: number) {
  const [p] = await db.select().from(products).where(eq(products.id, productId));
  if (!p) throw notFound('Mahsulot');
  return p;
}

async function assertNameFree(db: DB, value: string, exceptId?: number) {
  const [dup] = await db
    .select({ id: products.id })
    .from(products)
    .where(
      and(sql`lower(${products.name}) = lower(${value})`, exceptId ? ne(products.id, exceptId) : undefined),
    );
  if (dup) throw new AppError(409, `“${value}” nomli mahsulot allaqachon bor`);
}

export async function createProduct(db: DB, raw: unknown) {
  const input = parse(createProductInput, raw);
  await assertNameFree(db, input.name);
  return db.transaction(async (tx) => {
    const [p] = await tx
      .insert(products)
      .values({
        name: input.name,
        sellPrice: input.sellPrice,
        avgCost: input.cost,
        warehouseQty: input.warehouseQty,
        standQty: input.standQty,
        lowStockLevel: input.lowStockLevel,
        sortOrder: input.sortOrder,
      })
      .returning();
    if (input.warehouseQty > 0 || input.standQty > 0) {
      await tx.insert(stockMovements).values({
        productId: p!.id,
        kind: 'opening',
        warehouseDelta: input.warehouseQty,
        standDelta: input.standQty,
        unitPrice: input.sellPrice,
        unitCost: input.cost,
        note: 'Boshlangʻich qoldiq',
      });
    }
    return p!;
  });
}

export async function updateProduct(db: DB, productId: number, raw: unknown) {
  const input = parse(updateProductInput, raw);
  await getProduct(db, productId);
  if (input.name) await assertNameFree(db, input.name, productId);
  if (Object.keys(input).length === 0) return getProduct(db, productId);
  const [p] = await db.update(products).set(input).where(eq(products.id, productId)).returning();
  return p!;
}

export async function setProductImage(db: DB, productId: number, imagePath: string | null) {
  const old = await getProduct(db, productId);
  await db.update(products).set({ imagePath }).where(eq(products.id, productId));
  return old.imagePath;
}

/** Products can only be deleted while they have no history besides the opening stock. */
export async function deleteProduct(db: DB, productId: number) {
  const p = await getProduct(db, productId);
  const [used] = await db
    .select({ id: stockMovements.id })
    .from(stockMovements)
    .where(and(eq(stockMovements.productId, productId), ne(stockMovements.kind, 'opening')))
    .limit(1);
  if (used) {
    throw new AppError(409, 'Bu mahsulotning tarixi bor. Oʻchirish oʻrniga uni “faol emas” qilib qoʻying.');
  }
  await db.delete(products).where(eq(products.id, productId));
  return p.imagePath;
}

export const movementsQuery = z.object({
  productId: z.coerce.number().int().positive().optional(),
  kind: z.enum(['opening', 'purchase', 'refill', 'sale', 'writeoff', 'correction']).optional(),
  before: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export async function listMovements(db: DB, raw: unknown) {
  const q = parse(movementsQuery, raw);
  const rows = await db
    .select({
      id: stockMovements.id,
      productId: stockMovements.productId,
      productName: products.name,
      kind: stockMovements.kind,
      warehouseDelta: stockMovements.warehouseDelta,
      standDelta: stockMovements.standDelta,
      unitPrice: stockMovements.unitPrice,
      unitCost: stockMovements.unitCost,
      purchaseId: stockMovements.purchaseId,
      standCountId: stockMovements.standCountId,
      reason: stockMovements.reason,
      note: stockMovements.note,
      createdAt: stockMovements.createdAt,
    })
    .from(stockMovements)
    .innerJoin(products, eq(products.id, stockMovements.productId))
    .where(
      and(
        q.productId ? eq(stockMovements.productId, q.productId) : undefined,
        q.kind ? eq(stockMovements.kind, q.kind) : undefined,
        q.before ? lt(stockMovements.id, q.before) : undefined,
      ),
    )
    .orderBy(desc(stockMovements.id))
    .limit(q.limit);
  return rows;
}
