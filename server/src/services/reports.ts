import { and, desc, eq, gt, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { DB } from '../db/index.js';
import { drinkSheets, products, standCounts } from '../db/schema.js';
import { AppError, parse } from '../lib/errors.js';
import { addDays, today } from '../lib/time.js';
import { isoDate } from '../lib/validators.js';
import { cashStatus } from './cash.js';
import { PURCHASE_CATEGORY } from './stock.js';

const TZ = sql.raw(`'Asia/Tashkent'`);
const n = (v: unknown) => Number(v ?? 0);

export const rangeQuery = z.object({ from: isoDate, to: isoDate });

export type DayRow = {
  date: string;
  drinkRevenue: number;
  drinkCost: number;
  drinkSold: number;
  giftQty: number;
  giftCost: number;
  snackRevenue: number;
  snackCost: number;
  snackSold: number;
  writeoffCost: number;
  expenses: number;
  goodsPurchases: number;
};

export async function summary(db: DB, raw: unknown) {
  const { from, to } = parse(rangeQuery, raw);
  if (from > to) throw new AppError(400, 'Boshlanish sanasi tugash sanasidan keyin boʻlishi mumkin emas');
  if (addDays(from, 400) < to) throw new AppError(400, 'Oraliq juda katta (koʻpi bilan 400 kun)');

  const days = (await db.execute(sql`
    with days as (
      select d::date as date from generate_series(${from}::date, ${to}::date, interval '1 day') d
    ),
    snack as (
      select (created_at at time zone ${TZ})::date as date,
        sum(-stand_delta * unit_price) filter (where kind = 'sale') as revenue,
        sum(-stand_delta * unit_cost) filter (where kind = 'sale') as cost,
        sum(-stand_delta) filter (where kind = 'sale') as sold,
        sum(-(warehouse_delta + stand_delta) * unit_cost) filter (where kind = 'writeoff') as writeoff
      from stock_movements
      where kind in ('sale', 'writeoff')
        and created_at >= (${from}::date::timestamp at time zone ${TZ})
        and created_at < ((${to}::date + 1)::timestamp at time zone ${TZ})
      group by 1
    ),
    drink as (
      select s.date,
        sum(l.sold_qty * l.unit_price) as revenue,
        sum(l.sold_qty * coalesce(l.unit_cost, 0)) as cost,
        sum(l.sold_qty) as sold,
        sum(l.gift_qty) as gifts,
        sum(l.gift_qty * coalesce(l.unit_cost, 0)) as gift_cost
      from drink_sheets s join drink_sheet_lines l on l.sheet_id = s.id
      where s.date between ${from}::date and ${to}::date
      group by 1
    ),
    exp as (
      select e.date,
        sum(e.amount) as total,
        sum(e.amount) filter (where e.purchase_id is not null) as goods
      from expenses e
      where e.date between ${from}::date and ${to}::date
      group by 1
    )
    select to_char(days.date, 'YYYY-MM-DD') as date,
      coalesce(drink.revenue, 0) as drink_revenue, coalesce(drink.cost, 0) as drink_cost,
      coalesce(drink.sold, 0) as drink_sold, coalesce(drink.gifts, 0) as gifts,
      coalesce(drink.gift_cost, 0) as gift_cost,
      coalesce(snack.revenue, 0) as snack_revenue, coalesce(snack.cost, 0) as snack_cost,
      coalesce(snack.sold, 0) as snack_sold, coalesce(snack.writeoff, 0) as writeoff,
      coalesce(exp.total, 0) as expenses, coalesce(exp.goods, 0) as goods
    from days
    left join snack on snack.date = days.date
    left join drink on drink.date = days.date
    left join exp on exp.date = days.date
    order by days.date
  `)) as unknown as Record<string, unknown>[];

  const byDay: DayRow[] = days.map((r) => ({
    date: String(r.date),
    drinkRevenue: n(r.drink_revenue),
    drinkCost: n(r.drink_cost),
    drinkSold: n(r.drink_sold),
    giftQty: n(r.gifts),
    giftCost: n(r.gift_cost),
    snackRevenue: n(r.snack_revenue),
    snackCost: n(r.snack_cost),
    snackSold: n(r.snack_sold),
    writeoffCost: n(r.writeoff),
    expenses: n(r.expenses),
    goodsPurchases: n(r.goods),
  }));

  const byDrink = (
    (await db.execute(sql`
      select d.id, d.name, d.group_name,
        sum(l.sold_qty) as sold, sum(l.gift_qty) as gifts,
        sum(l.sold_qty * l.unit_price) as revenue,
        sum((l.sold_qty + l.gift_qty) * coalesce(l.unit_cost, 0)) as cost,
        bool_or(l.unit_cost is null) as missing_cost
      from drink_sheet_lines l
      join drink_sheets s on s.id = l.sheet_id
      join drinks d on d.id = l.drink_id
      where s.date between ${from}::date and ${to}::date
      group by d.id
      order by revenue desc, d.name
    `)) as unknown as Record<string, unknown>[]
  ).map((r) => {
    const revenue = n(r.revenue);
    const cost = n(r.cost);
    return {
      id: n(r.id),
      name: String(r.name),
      groupName: String(r.group_name),
      sold: n(r.sold),
      gifts: n(r.gifts),
      revenue,
      cost,
      profit: revenue - cost,
      missingCost: Boolean(r.missing_cost),
    };
  });

  const byProduct = (
    (await db.execute(sql`
      select p.id, p.name,
        coalesce(sum(-m.stand_delta) filter (where m.kind = 'sale'), 0) as sold,
        coalesce(sum(-m.stand_delta * m.unit_price) filter (where m.kind = 'sale'), 0) as revenue,
        coalesce(sum(-m.stand_delta * m.unit_cost) filter (where m.kind = 'sale'), 0) as cost,
        coalesce(sum(-(m.warehouse_delta + m.stand_delta)) filter (where m.kind = 'writeoff'), 0) as writeoff_qty,
        coalesce(sum(-(m.warehouse_delta + m.stand_delta) * m.unit_cost) filter (where m.kind = 'writeoff'), 0) as writeoff_cost
      from stock_movements m
      join products p on p.id = m.product_id
      where m.kind in ('sale', 'writeoff')
        and m.created_at >= (${from}::date::timestamp at time zone ${TZ})
        and m.created_at < ((${to}::date + 1)::timestamp at time zone ${TZ})
      group by p.id
      order by revenue desc, p.name
    `)) as unknown as Record<string, unknown>[]
  ).map((r) => {
    const revenue = n(r.revenue);
    const cost = n(r.cost);
    return {
      id: n(r.id),
      name: String(r.name),
      sold: n(r.sold),
      revenue,
      cost,
      profit: revenue - cost,
      writeoffQty: n(r.writeoff_qty),
      writeoffCost: n(r.writeoff_cost),
    };
  });

  const byCategory = (
    (await db.execute(sql`
      select c.id, c.name, sum(e.amount) as total, count(*) as count
      from expenses e join expense_categories c on c.id = e.category_id
      where e.date between ${from}::date and ${to}::date
      group by c.id
      order by total desc
    `)) as unknown as Record<string, unknown>[]
  ).map((r) => ({ id: n(r.id), name: String(r.name), total: n(r.total), count: n(r.count) }));

  const t = byDay.reduce(
    (a, d) => {
      a.drinkRevenue += d.drinkRevenue;
      a.drinkCost += d.drinkCost;
      a.drinkSold += d.drinkSold;
      a.giftQty += d.giftQty;
      a.giftCost += d.giftCost;
      a.snackRevenue += d.snackRevenue;
      a.snackCost += d.snackCost;
      a.snackSold += d.snackSold;
      a.writeoffCost += d.writeoffCost;
      a.expenses += d.expenses;
      a.goodsPurchases += d.goodsPurchases;
      return a;
    },
    {
      drinkRevenue: 0,
      drinkCost: 0,
      drinkSold: 0,
      giftQty: 0,
      giftCost: 0,
      snackRevenue: 0,
      snackCost: 0,
      snackSold: 0,
      writeoffCost: 0,
      expenses: 0,
      goodsPurchases: 0,
    },
  );
  const revenue = t.drinkRevenue + t.snackRevenue;
  const grossProfit = t.drinkRevenue - t.drinkCost - t.giftCost + (t.snackRevenue - t.snackCost) - t.writeoffCost;

  return {
    from,
    to,
    totals: {
      ...t,
      revenue,
      /** Sales minus the cost of what was sold, given away or written off. */
      grossProfit,
      /** Sales minus all money spent in the period. */
      cashFlow: revenue - t.expenses,
      drinksMissingCost: byDrink.filter((d) => d.missingCost).length,
    },
    byDay,
    byDrink,
    byProduct,
    byCategory,
    purchaseCategory: PURCHASE_CATEGORY,
  };
}

export async function lowStock(db: DB) {
  const rows = await db
    .select({
      id: products.id,
      name: products.name,
      imagePath: products.imagePath,
      standQty: products.standQty,
      warehouseQty: products.warehouseQty,
      lowStockLevel: products.lowStockLevel,
    })
    .from(products)
    .where(
      and(
        eq(products.active, true),
        gt(products.lowStockLevel, 0),
        sql`${products.standQty} <= ${products.lowStockLevel}`,
      ),
    )
    .orderBy(products.name);
  return {
    /** Stand is low but the warehouse has more. */
    refill: rows.filter((r) => r.warehouseQty > 0),
    /** Running out everywhere — time to buy. */
    buy: rows.filter((r) => r.warehouseQty + r.standQty <= r.lowStockLevel),
  };
}

export async function dashboard(db: DB) {
  const day = today();
  const [cash, todaySummary, low, lastCount, sheet] = await Promise.all([
    cashStatus(db),
    summary(db, { from: day, to: day }),
    lowStock(db),
    db.select({ createdAt: standCounts.createdAt }).from(standCounts).orderBy(desc(standCounts.id)).limit(1),
    db.select({ id: drinkSheets.id }).from(drinkSheets).where(eq(drinkSheets.date, day)),
  ]);
  return {
    today: day,
    cash,
    todayTotals: todaySummary.totals,
    lowStock: low,
    lastStandCountAt: lastCount[0]?.createdAt ?? null,
    todaySheetExists: sheet.length > 0,
  };
}
