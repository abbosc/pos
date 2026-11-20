import { sql } from 'drizzle-orm';
import type { DB } from './index.js';
import { containers, drinks, expenseCategories } from './schema.js';

/** Default data for a fresh database: the drink menu from the paper sheet and expense categories. */
const DRINK_MENU: [group: string, items: [name: string, priceThousands: number][]][] = [
  ['Issiq kofe', [
    ['Espresso', 20], ['Amerikano', 20], ['Kapuchino', 22], ['Latte', 22], ['Flet uayt', 24],
    ['Mokko', 30], ['Raf', 30], ['Raf xolva', 32], ['Matcha latte', 28], ['Issiq shokolad', 25],
  ]],
  ['Ays kofe', [['Ays amerikano', 22], ['Ays latte', 24]]],
  ['Anchan va matcha', [['Ays anchan qulupnayli', 32], ['Ays matcha qulupnayli', 32]]],
  ['Milksheyk', [['Bananli', 25], ['Sutli', 23], ['Yagodni', 30]]],
  ['Mualliflik choyi', [['Yagodni choy', 15], ['Imbir choy', 18], ['Chakanda choy', 20], ['Malina choy', 15], ['Limon choy', 12]]],
  ['Fresh', [['Olma', 20], ['Sabzi', 15], ['Apelsin', 35], ['Olma va sabzi', 18]]],
  ['Muzdek ichimliklar', [
    ['Aysti yagodni', 22], ['Moxito klassik', 25], ['Mango marakuya', 28], ['Qulupnay jasmin', 24], ['Shaftoli marakuya', 24],
  ]],
];

const FEATURED = ['Raf xolva', 'Ays anchan qulupnayli'];

const CATEGORIES = ['Mahsulot xaridi', 'Kofe donlari', 'Sut', 'Siroplar', 'Meva va ingredientlar', 'Stakan va qopqoqlar', 'Jihozlar', 'Boshqa'];

export async function seedDefaults(db: DB) {
  await seedContainers(db);
  const [{ count: drinkCount }] = (await db.select({ count: sql<number>`count(*)::int` }).from(drinks)) as [{ count: number }];
  if (drinkCount === 0) {
    let sort = 0;
    const rows = DRINK_MENU.flatMap(([groupName, items]) =>
      items.map(([name, price]) => ({ name, groupName, price: price * 1000, sortOrder: (sort += 10), featured: FEATURED.includes(name) })),
    );
    await db.insert(drinks).values(rows).onConflictDoNothing();
  }
  const [{ count: catCount }] = (await db.select({ count: sql<number>`count(*)::int` }).from(expenseCategories)) as [
    { count: number },
  ];
  if (catCount === 0) {
    await db
      .insert(expenseCategories)
      .values(CATEGORIES.map((name, i) => ({ name, sortOrder: i === 0 ? -1 : i * 10 })))
      .onConflictDoNothing();
  }
}

export const DEFAULT_CONTAINERS = [
  { name: 'Kraft stakan', isCup: false, sortOrder: 10 },
  { name: 'Shaffof stakan', isCup: false, sortOrder: 20 },
  { name: 'Chashka', isCup: true, sortOrder: 30 },
];

export async function seedContainers(db: DB) {
  const [{ count }] = (await db.select({ count: sql<number>`count(*)::int` }).from(containers)) as [{ count: number }];
  if (count === 0) await db.insert(containers).values(DEFAULT_CONTAINERS).onConflictDoNothing();
}
