import { describe, expect, it } from 'vitest';
import { today } from '../src/lib/time.js';
import { setupApp } from './helpers.js';

const t = setupApp();

async function snickers(extra: Record<string, unknown> = {}) {
  return t.ok('POST', '/api/products', {
    name: 'Snickers',
    sellPrice: 12000,
    cost: 8000,
    warehouseQty: 50,
    standQty: 100,
    lowStockLevel: 10,
    ...extra,
  });
}

describe('auth', () => {
  it('rejects requests without a session', async () => {
    const res = await t.app.request('/api/dashboard');
    expect(res.status).toBe(401);
  });

  it('rejects a wrong password', async () => {
    const res = await t.app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '10.0.0.1' },
      body: JSON.stringify({ password: 'nope' }),
    });
    expect(res.status).toBe(401);
  });

  it('accepts a forged-looking cookie only if signed', async () => {
    const res = await t.app.request('/api/dashboard', { headers: { cookie: 'pos_session=99999999999999.abc' } });
    expect(res.status).toBe(401);
  });
});

describe('products and stock', () => {
  it('creates a product with opening stock and rejects duplicates', async () => {
    const p = await snickers();
    expect(p).toMatchObject({ warehouseQty: 50, standQty: 100, avgCost: 8000 });
    const dup = await t.call('POST', '/api/products', { name: 'snickers', sellPrice: 1 });
    expect(dup.status).toBe(409);
    const moves = await t.ok('GET', `/api/movements?productId=${p.id}`);
    expect(moves).toHaveLength(1);
    expect(moves[0].kind).toBe('opening');
  });

  it('purchase adds to warehouse, updates average cost and records an expense', async () => {
    const p = await snickers();
    await t.ok('POST', '/api/purchases', { lines: [{ productId: p.id, qty: 50, total: 500000 }] });
    const after = await t.ok('GET', `/api/products/${p.id}`);
    expect(after.warehouseQty).toBe(100);
    // (150 × 8000 + 500000) / 200 = 8500
    expect(after.avgCost).toBe(8500);
    const exp = await t.ok('GET', '/api/expenses');
    expect(exp.total).toBe(500000);
    expect(exp.rows[0].categoryName).toBe('Mahsulot xaridi');
    expect(exp.rows[0].purchaseId).toBeTruthy();
    // Linked expense can't be edited directly
    const edit = await t.call('PATCH', `/api/expenses/${exp.rows[0].id}`, { amount: 1 });
    expect(edit.status).toBe(409);
  });

  it('deleting a purchase restores stock, cost and removes the expense', async () => {
    const p = await snickers();
    const pur = await t.ok('POST', '/api/purchases', { lines: [{ productId: p.id, qty: 50, total: 500000 }] });
    await t.ok('DELETE', `/api/purchases/${pur.id}`);
    const after = await t.ok('GET', `/api/products/${p.id}`);
    expect(after).toMatchObject({ warehouseQty: 50, avgCost: 8000 });
    expect((await t.ok('GET', '/api/expenses')).total).toBe(0);
  });

  it('refill moves warehouse → stand and refuses more than the warehouse has', async () => {
    const p = await snickers();
    await t.ok('POST', '/api/refill', { lines: [{ productId: p.id, qty: 20 }] });
    expect(await t.ok('GET', `/api/products/${p.id}`)).toMatchObject({ warehouseQty: 30, standQty: 120 });
    const tooMuch = await t.call('POST', '/api/refill', { lines: [{ productId: p.id, qty: 31 }] });
    expect(tooMuch.status).toBe(409);
  });

  it('stand count records sales: 100 + 20 refilled − 85 counted = 35 sold', async () => {
    const p = await snickers();
    await t.ok('POST', '/api/refill', { lines: [{ productId: p.id, qty: 20 }] });
    const r = await t.ok('POST', '/api/stand-counts', { lines: [{ productId: p.id, counted: 85 }] });
    expect(r.soldQty).toBe(35);
    expect(r.revenue).toBe(35 * 12000);
    expect(await t.ok('GET', `/api/products/${p.id}`)).toMatchObject({ standQty: 85, warehouseQty: 30 });
    const cash = await t.ok('GET', '/api/cash');
    expect(cash.snackSales).toBe(420000);
  });

  it('a surplus on the stand is taken from the warehouse (unrecorded refill)', async () => {
    const p = await snickers();
    const r = await t.ok('POST', '/api/stand-counts', { lines: [{ productId: p.id, counted: 110 }] });
    expect(r.lines[0]).toMatchObject({ sold: 0, surplus: 10, surplusSource: 'warehouse' });
    expect(await t.ok('GET', `/api/products/${p.id}`)).toMatchObject({ standQty: 110, warehouseQty: 40 });
  });

  it('a surplus becomes a correction when the warehouse is short or the option is off', async () => {
    const p = await snickers({ warehouseQty: 0 });
    const r = await t.ok('POST', '/api/stand-counts', { lines: [{ productId: p.id, counted: 105 }] });
    expect(r.lines[0]).toMatchObject({ surplusSource: 'correction' });
    expect(await t.ok('GET', `/api/products/${p.id}`)).toMatchObject({ standQty: 105, warehouseQty: 0 });
  });

  it('deleting a stand count restores the stand and removes the sales', async () => {
    const p = await snickers();
    const r = await t.ok('POST', '/api/stand-counts', { lines: [{ productId: p.id, counted: 90 }] });
    await t.ok('DELETE', `/api/stand-counts/${r.countId}`);
    expect(await t.ok('GET', `/api/products/${p.id}`)).toMatchObject({ standQty: 100 });
    expect((await t.ok('GET', '/api/cash')).snackSales).toBe(0);
  });

  it('write-off and correction change stock without sales', async () => {
    const p = await snickers();
    await t.ok('POST', '/api/writeoffs', { productId: p.id, from: 'stand', qty: 3, note: 'muddati oʻtgan' });
    await t.ok('POST', '/api/corrections', { productId: p.id, warehouseQty: 45 });
    expect(await t.ok('GET', `/api/products/${p.id}`)).toMatchObject({ standQty: 97, warehouseQty: 45 });
    expect((await t.ok('GET', '/api/cash')).snackSales).toBe(0);
    const tooMany = await t.call('POST', '/api/writeoffs', { productId: p.id, from: 'stand', qty: 1000 });
    expect(tooMany.status).toBe(409);
  });

  it('product with history cannot be deleted, a fresh one can', async () => {
    const p = await snickers();
    await t.ok('POST', '/api/refill', { lines: [{ productId: p.id, qty: 1 }] });
    expect((await t.call('DELETE', `/api/products/${p.id}`)).status).toBe(409);
    const fresh = await t.ok('POST', '/api/products', { name: 'Twix', sellPrice: 10000 });
    await t.ok('DELETE', `/api/products/${fresh.id}`);
  });

  it('validates input', async () => {
    const bad = await t.call('POST', '/api/products', { name: '', sellPrice: -1 });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toBeTruthy();
  });
});

describe('drinks sheet', () => {
  it('seeds the menu from the paper sheet', async () => {
    const drinks = await t.ok('GET', '/api/drinks');
    expect(drinks).toHaveLength(31);
    expect(drinks[0]).toMatchObject({ name: 'Espresso', price: 20000 });
  });

  it('saves sold and gift counts, keeps the day price when the menu price changes', async () => {
    const drinks = await t.ok('GET', '/api/drinks');
    const latte = drinks.find((d: any) => d.name === 'Latte');
    await t.ok('PATCH', `/api/drinks/${latte.id}`, { costPerCup: 9000 });
    const day = '2026-11-10';
    const saved = await t.ok('PUT', `/api/sheets/${day}`, {
      lines: [{ drinkId: latte.id, soldQty: 10, giftQty: 2 }],
    });
    expect(saved.totals).toMatchObject({ soldQty: 10, giftQty: 2, revenue: 220000 });

    await t.ok('PATCH', `/api/drinks/${latte.id}`, { price: 25000 });
    const edited = await t.ok('PUT', `/api/sheets/${day}`, {
      lines: [{ drinkId: latte.id, soldQty: 11, giftQty: 2 }],
    });
    expect(edited.totals.revenue).toBe(11 * 22000);

    const rep = await t.ok('GET', `/api/reports/summary?from=${day}&to=${day}`);
    expect(rep.byDrink[0]).toMatchObject({ name: 'Latte', sold: 11, gifts: 2, revenue: 242000, cost: 13 * 9000 });
    expect(rep.totals.giftCost).toBe(18000);
    expect(rep.totals.grossProfit).toBe(242000 - 11 * 9000 - 18000);
  });

  it('setting a drink cost later fills it into earlier sheets that had none', async () => {
    const drinks = await t.ok('GET', '/api/drinks');
    const mokko = drinks.find((d: any) => d.name === 'Mokko');
    await t.ok('PUT', '/api/sheets/2026-11-01', { lines: [{ drinkId: mokko.id, soldQty: 4, giftQty: 0 }] });
    let rep = await t.ok('GET', '/api/reports/summary?from=2026-11-01&to=2026-11-01');
    expect(rep.byDrink[0].missingCost).toBe(true);
    await t.ok('PATCH', `/api/drinks/${mokko.id}`, { costPerCup: 12000 });
    rep = await t.ok('GET', '/api/reports/summary?from=2026-11-01&to=2026-11-01');
    expect(rep.byDrink[0]).toMatchObject({ missingCost: false, cost: 48000, profit: 4 * 30000 - 48000 });
    // A later change does not rewrite the cost already stored.
    await t.ok('PATCH', `/api/drinks/${mokko.id}`, { costPerCup: 20000 });
    rep = await t.ok('GET', '/api/reports/summary?from=2026-11-01&to=2026-11-01');
    expect(rep.byDrink[0].cost).toBe(48000);
  });
});

describe('cash desk', () => {
  it('full day: opening → sales → expenses → close → difference → reopen', async () => {
    const opening = await t.ok('POST', '/api/cash/close', { counted: 50000, isOpening: true });
    expect(opening.difference).toBe(0);
    expect((await t.call('POST', '/api/cash/close', { counted: 1, isOpening: true })).status).toBe(409);

    const p = await snickers();
    await t.ok('POST', '/api/stand-counts', { lines: [{ productId: p.id, counted: 90 }] }); // +120 000
    const drinks = await t.ok('GET', '/api/drinks');
    await t.ok('PUT', `/api/sheets/${today()}`, {
      lines: [{ drinkId: drinks[0].id, soldQty: 5, giftQty: 1 }], // +100 000
    });
    const cats = await t.ok('GET', '/api/expense-categories');
    const milk = cats.find((c: any) => c.name === 'Sut');
    await t.ok('POST', '/api/expenses', { categoryId: milk.id, amount: 30000 }); // −30 000
    await t.ok('POST', '/api/expenses', { categoryId: milk.id, amount: 99000, paidFromCash: false }); // no effect
    await t.ok('POST', '/api/cash/movements', { kind: 'withdrawal', amount: 10000 }); // −10 000

    const status = await t.ok('GET', '/api/cash');
    expect(status).toMatchObject({
      opening: 50000,
      snackSales: 120000,
      drinkSales: 100000,
      cashExpenses: 30000,
      withdrawals: 10000,
      expected: 230000,
    });

    const close = await t.ok('POST', '/api/cash/close', { counted: 225000 });
    expect(close).toMatchObject({ expected: 230000, counted: 225000, difference: -5000 });

    // Everything is locked now; the next period starts at the counted amount.
    const next = await t.ok('GET', '/api/cash');
    expect(next).toMatchObject({ opening: 225000, expected: 225000, snackSales: 0, drinkSales: 0 });
    const lockedSheet = await t.call('PUT', `/api/sheets/${today()}`, { lines: [] });
    expect(lockedSheet.status).toBe(409);
    const exp = await t.ok('GET', '/api/expenses');
    const cashExp = exp.rows.find((r: any) => r.paidFromCash);
    expect((await t.call('DELETE', `/api/expenses/${cashExp.id}`)).status).toBe(409);

    // Reopen restores the open period.
    await t.ok('POST', '/api/cash/reopen');
    expect((await t.ok('GET', '/api/cash')).expected).toBe(230000);
    await t.ok('PUT', `/api/sheets/${today()}`, { lines: [{ drinkId: drinks[0].id, soldQty: 4, giftQty: 1 }] });
    expect((await t.ok('GET', '/api/cash')).expected).toBe(210000);

    const closes = await t.ok('GET', '/api/cash/closes');
    expect(closes).toHaveLength(1);
  });

  it('opening cash entered after sales keeps those sales in the open period', async () => {
    const drinks = await t.ok('GET', '/api/drinks');
    await t.ok('PUT', `/api/sheets/${today()}`, { lines: [{ drinkId: drinks[0].id, soldQty: 10, giftQty: 0 }] }); // 200 000
    await t.ok('POST', '/api/cash/close', { counted: 50000, isOpening: true });
    const status = await t.ok('GET', '/api/cash');
    expect(status).toMatchObject({ opening: 50000, drinkSales: 200000, expected: 250000 });
    // The sheet is still editable.
    await t.ok('PUT', `/api/sheets/${today()}`, { lines: [{ drinkId: drinks[0].id, soldQty: 11, giftQty: 0 }] });
    expect((await t.ok('GET', '/api/cash')).expected).toBe(270000);
  });

  it('a stand count whose sales were closed cannot be deleted', async () => {
    const p = await snickers();
    const r = await t.ok('POST', '/api/stand-counts', { lines: [{ productId: p.id, counted: 90 }] });
    await t.ok('POST', '/api/cash/close', { counted: 120000 });
    expect((await t.call('DELETE', `/api/stand-counts/${r.countId}`)).status).toBe(409);
  });
});

describe('reports and dashboard', () => {
  it('summarises sales, costs, write-offs and expenses for a range', async () => {
    const p = await snickers();
    await t.ok('POST', '/api/stand-counts', { lines: [{ productId: p.id, counted: 90 }] });
    await t.ok('POST', '/api/writeoffs', { productId: p.id, from: 'warehouse', qty: 2 });
    await t.ok('POST', '/api/purchases', { lines: [{ productId: p.id, qty: 10, total: 80000 }] });
    const day = today();
    const rep = await t.ok('GET', `/api/reports/summary?from=${day}&to=${day}`);
    expect(rep.byDay).toHaveLength(1);
    expect(rep.totals).toMatchObject({
      snackRevenue: 120000,
      snackCost: 80000,
      snackSold: 10,
      writeoffCost: 16000,
      expenses: 80000,
      goodsPurchases: 80000,
      grossProfit: 120000 - 80000 - 16000,
      cashFlow: 120000 - 80000,
    });
    expect(rep.byProduct[0]).toMatchObject({ name: 'Snickers', sold: 10, profit: 40000, writeoffQty: 2 });
  });

  it('dashboard lists low stock', async () => {
    const p = await snickers({ standQty: 5, warehouseQty: 20 });
    const d = await t.ok('GET', '/api/dashboard');
    expect(d.lowStock.refill.map((x: any) => x.id)).toEqual([p.id]);
    expect(d.lowStock.buy).toEqual([]);
  });

  it('rejects inverted ranges', async () => {
    const r = await t.call('GET', '/api/reports/summary?from=2026-02-01&to=2026-01-01');
    expect(r.status).toBe(400);
  });
});
