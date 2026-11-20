import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

// All money values are whole so'm (integer). Quantities are pieces.

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

/** Cash desk closes ("kassani yopish"). The first one can be the opening balance. */
export const cashCloses = pgTable('cash_closes', {
  id: serial('id').primaryKey(),
  createdAt: createdAt(),
  /** Amount the system expected to be in the desk at close time. */
  expected: integer('expected').notNull(),
  /** Amount actually counted in the desk. Becomes the start of the next period. */
  counted: integer('counted').notNull(),
  isOpening: boolean('is_opening').notNull().default(false),
  note: text('note'),
});

/** Snacks and other packaged goods kept in the warehouse and on the stand. */
export const products = pgTable(
  'products',
  {
    id: serial('id').primaryKey(),
    name: text('name').notNull(),
    sellPrice: integer('sell_price').notNull(),
    /** Weighted average cost of one piece, updated by purchases. */
    avgCost: integer('avg_cost').notNull().default(0),
    warehouseQty: integer('warehouse_qty').notNull().default(0),
    standQty: integer('stand_qty').notNull().default(0),
    /** Warn when stock falls to this level or below. 0 disables. */
    lowStockLevel: integer('low_stock_level').notNull().default(0),
    imagePath: text('image_path'),
    sortOrder: integer('sort_order').notNull().default(0),
    active: boolean('active').notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('products_name_uq').on(sql`lower(${t.name})`),
    check('products_qty_nonneg', sql`${t.warehouseQty} >= 0 and ${t.standQty} >= 0`),
    check('products_prices_nonneg', sql`${t.sellPrice} >= 0 and ${t.avgCost} >= 0`),
  ],
);

export const purchases = pgTable('purchases', {
  id: serial('id').primaryKey(),
  date: date('date', { mode: 'string' }).notNull(),
  total: integer('total').notNull(),
  paidFromCash: boolean('paid_from_cash').notNull(),
  note: text('note'),
  createdAt: createdAt(),
});

export const standCounts = pgTable('stand_counts', {
  id: serial('id').primaryKey(),
  note: text('note'),
  createdAt: createdAt(),
});

export const movementKind = pgEnum('movement_kind', [
  'opening', // initial stock when a product is created
  'purchase', // bought → warehouse
  'refill', // warehouse → stand
  'sale', // found missing on stand during a count
  'writeoff', // expired / damaged / gift
  'correction', // manual recount fix
]);

/** Every change of stock. warehouse_delta / stand_delta are signed. */
export const stockMovements = pgTable(
  'stock_movements',
  {
    id: serial('id').primaryKey(),
    productId: integer('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    kind: movementKind('kind').notNull(),
    warehouseDelta: integer('warehouse_delta').notNull().default(0),
    standDelta: integer('stand_delta').notNull().default(0),
    /** Sell price per piece at the time (sales). */
    unitPrice: integer('unit_price').notNull().default(0),
    /** Cost per piece at the time. */
    unitCost: integer('unit_cost').notNull().default(0),
    purchaseId: integer('purchase_id').references(() => purchases.id, { onDelete: 'cascade' }),
    standCountId: integer('stand_count_id').references(() => standCounts.id, { onDelete: 'cascade' }),
    /** Set on sales once the cash desk is closed. */
    cashCloseId: integer('cash_close_id').references(() => cashCloses.id),
    /** Write-offs: gift | staff | spoiled | other. */
    reason: text('reason'),
    note: text('note'),
    createdAt: createdAt(),
  },
  (t) => [
    index('stock_movements_product_idx').on(t.productId, t.createdAt),
    index('stock_movements_created_idx').on(t.createdAt),
    index('stock_movements_open_sales_idx').on(t.kind).where(sql`${t.cashCloseId} is null`),
  ],
);

/** Bottles and cups drinks are served in. Stock may go negative if usage is recorded before stock. */
export const containers = pgTable(
  'containers',
  {
    id: serial('id').primaryKey(),
    name: text('name').notNull(),
    /** The cup used when a drink (coffee) is served in a cup instead of its bottle. */
    isCup: boolean('is_cup').notNull().default(false),
    stockQty: integer('stock_qty').notNull().default(0),
    lowStockLevel: integer('low_stock_level').notNull().default(0),
    sortOrder: integer('sort_order').notNull().default(0),
    active: boolean('active').notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('containers_name_uq').on(sql`lower(${t.name})`)],
);

/** Drinks made at the bar (sold by the paper sheet). */
export const drinks = pgTable(
  'drinks',
  {
    id: serial('id').primaryKey(),
    name: text('name').notNull(),
    groupName: text('group_name').notNull().default(''),
    price: integer('price').notNull(),
    /** Estimated ingredient cost of one cup. Null = not set yet. */
    costPerCup: integer('cost_per_cup'),
    /** The bottle this drink is always served in. */
    containerId: integer('container_id').references(() => containers.id, { onDelete: 'set null' }),
    /** Can also be served in a cup (coffee). */
    allowCup: boolean('allow_cup').notNull().default(false),
    /** Recommended: shown with a “TAVSIYA” badge on the TV menu. */
    featured: boolean('featured').notNull().default(false),
    imagePath: text('image_path'),
    sortOrder: integer('sort_order').notNull().default(0),
    active: boolean('active').notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('drinks_name_uq').on(sql`lower(${t.name})`)],
);

/** One paper sheet = one day. */
export const drinkSheets = pgTable('drink_sheets', {
  id: serial('id').primaryKey(),
  date: date('date', { mode: 'string' }).notNull().unique(),
  note: text('note'),
  cashCloseId: integer('cash_close_id').references(() => cashCloses.id),
  createdAt: createdAt(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const drinkSheetLines = pgTable(
  'drink_sheet_lines',
  {
    sheetId: integer('sheet_id')
      .notNull()
      .references(() => drinkSheets.id, { onDelete: 'cascade' }),
    drinkId: integer('drink_id')
      .notNull()
      .references(() => drinks.id),
    soldQty: integer('sold_qty').notNull().default(0),
    giftQty: integer('gift_qty').notNull().default(0),
    /** How many of sold + gift were served in a cup instead of the bottle. */
    cupQty: integer('cup_qty').notNull().default(0),
    unitPrice: integer('unit_price').notNull(),
    unitCost: integer('unit_cost'),
    /** Bottle used on that day. */
    containerId: integer('container_id').references(() => containers.id, { onDelete: 'set null' }),
  },
  (t) => [
    primaryKey({ columns: [t.sheetId, t.drinkId] }),
    check('drink_lines_qty_nonneg', sql`${t.soldQty} >= 0 and ${t.giftQty} >= 0`),
    check('drink_lines_cup_le_total', sql`${t.cupQty} >= 0 and ${t.cupQty} <= ${t.soldQty} + ${t.giftQty}`),
  ],
);

/** Containers actually counted as used on a sheet's day, to compare with the sheet. */
export const drinkSheetContainerCounts = pgTable(
  'drink_sheet_container_counts',
  {
    sheetId: integer('sheet_id')
      .notNull()
      .references(() => drinkSheets.id, { onDelete: 'cascade' }),
    containerId: integer('container_id')
      .notNull()
      .references(() => containers.id, { onDelete: 'cascade' }),
    countedUsed: integer('counted_used').notNull(),
  },
  (t) => [primaryKey({ columns: [t.sheetId, t.containerId] })],
);

export const expenseCategories = pgTable('expense_categories', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(),
  sortOrder: integer('sort_order').notNull().default(0),
});

export const expenses = pgTable(
  'expenses',
  {
    id: serial('id').primaryKey(),
    date: date('date', { mode: 'string' }).notNull(),
    categoryId: integer('category_id')
      .notNull()
      .references(() => expenseCategories.id),
    amount: integer('amount').notNull(),
    paidFromCash: boolean('paid_from_cash').notNull().default(true),
    note: text('note'),
    /** Set when the expense was created by a snack purchase. */
    purchaseId: integer('purchase_id').references(() => purchases.id, { onDelete: 'cascade' }),
    cashCloseId: integer('cash_close_id').references(() => cashCloses.id),
    createdAt: createdAt(),
  },
  (t) => [
    index('expenses_date_idx').on(t.date),
    check('expenses_amount_pos', sql`${t.amount} > 0`),
  ],
);

export const cashMovementKind = pgEnum('cash_movement_kind', ['withdrawal', 'deposit']);

/** Money taken out of (e.g. handed to the owner) or put into the desk. */
export const cashMovements = pgTable(
  'cash_movements',
  {
    id: serial('id').primaryKey(),
    kind: cashMovementKind('kind').notNull(),
    amount: integer('amount').notNull(),
    note: text('note'),
    cashCloseId: integer('cash_close_id').references(() => cashCloses.id),
    createdAt: createdAt(),
  },
  (t) => [check('cash_movements_amount_pos', sql`${t.amount} > 0`)],
);

export const containerMovementKind = pgEnum('container_movement_kind', [
  'purchase', // received into stock
  'usage', // used by a drinks sheet
  'count', // stock count correction
  'writeoff', // broken / thrown away
]);

export const containerMovements = pgTable(
  'container_movements',
  {
    id: serial('id').primaryKey(),
    containerId: integer('container_id')
      .notNull()
      .references(() => containers.id, { onDelete: 'cascade' }),
    kind: containerMovementKind('kind').notNull(),
    delta: integer('delta').notNull(),
    sheetId: integer('sheet_id').references(() => drinkSheets.id, { onDelete: 'cascade' }),
    expenseId: integer('expense_id').references(() => expenses.id, { onDelete: 'set null' }),
    note: text('note'),
    createdAt: createdAt(),
  },
  (t) => [index('container_movements_container_idx').on(t.containerId, t.createdAt)],
);
