import { and, asc, eq, gt, sql } from 'drizzle-orm';
import type { DB } from '../db/index.js';
import { drinks, products } from '../db/schema.js';

/**
 * The public menu shown on the TV (no login). Only names and prices:
 * active drinks by group, and active snacks that are in stock.
 */
export async function publicMenu(db: DB) {
  const drinkRows = await db
    .select({ id: drinks.id, name: drinks.name, groupName: drinks.groupName, price: drinks.price, imagePath: drinks.imagePath })
    .from(drinks)
    .where(eq(drinks.active, true))
    .orderBy(asc(drinks.sortOrder), asc(drinks.id));

  const groups: { name: string; items: { id: number; name: string; price: number; imagePath: string | null }[] }[] = [];
  for (const d of drinkRows) {
    const name = d.groupName || 'Ichimliklar';
    let g = groups.find((x) => x.name === name);
    if (!g) groups.push((g = { name, items: [] }));
    g.items.push({ id: d.id, name: d.name, price: d.price, imagePath: d.imagePath });
  }

  const snacks = await db
    .select({ id: products.id, name: products.name, price: products.sellPrice, imagePath: products.imagePath })
    .from(products)
    .where(and(eq(products.active, true), gt(sql`${products.standQty} + ${products.warehouseQty}`, 0)))
    .orderBy(asc(products.sortOrder), asc(products.name));

  return { groups, snacks };
}
