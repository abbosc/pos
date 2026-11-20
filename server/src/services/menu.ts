import { asc, eq } from 'drizzle-orm';
import type { DB } from '../db/index.js';
import { drinks } from '../db/schema.js';

export type MenuItem = { id: number; name: string; price: number; featured: boolean; imagePath: string | null };

/**
 * The public drinks menu shown on the TV (no login): active drinks by group, in menu order.
 * Only names, prices, the “recommended” flag and photos — never costs.
 */
export async function publicMenu(db: DB) {
  const rows = await db
    .select({
      id: drinks.id,
      name: drinks.name,
      groupName: drinks.groupName,
      price: drinks.price,
      featured: drinks.featured,
      imagePath: drinks.imagePath,
    })
    .from(drinks)
    .where(eq(drinks.active, true))
    .orderBy(asc(drinks.sortOrder), asc(drinks.id));

  const groups: { name: string; items: MenuItem[] }[] = [];
  for (const d of rows) {
    const name = d.groupName || 'Ichimliklar';
    let g = groups.find((x) => x.name === name);
    if (!g) groups.push((g = { name, items: [] }));
    g.items.push({ id: d.id, name: d.name, price: d.price, featured: d.featured, imagePath: d.imagePath });
  }
  return { groups };
}
