import { describe, expect, it } from 'vitest';
import { today } from '../src/lib/time.js';
import { setupApp } from './helpers.js';

const t = setupApp();

async function setup() {
  const containers = await t.ok('GET', '/api/containers');
  const kraft = containers.find((c: any) => c.name === 'Kraft butilka');
  const clear = containers.find((c: any) => c.name === 'Shaffof butilka');
  const cup = containers.find((c: any) => c.isCup);
  const drinks = await t.ok('GET', '/api/drinks');
  const latte = drinks.find((d: any) => d.name === 'Latte');
  const mojito = drinks.find((d: any) => d.name === 'Moxito klassik');
  return { kraft, clear, cup, latte, mojito };
}

describe('containers', () => {
  it('seeds kraft, transparent and cup', async () => {
    const { kraft, clear, cup } = await setup();
    expect(kraft).toBeTruthy();
    expect(clear).toBeTruthy();
    expect(cup?.name).toBe('Chashka');
  });

  it('PATCH changes only the fields sent', async () => {
    const { kraft, latte } = await setup();
    const before = await t.ok('PATCH', `/api/drinks/${latte.id}`, { costPerCup: 9000 });
    const after = await t.ok('PATCH', `/api/drinks/${latte.id}`, { containerId: kraft.id, allowCup: true });
    expect(after).toMatchObject({
      groupName: before.groupName,
      price: before.price,
      costPerCup: 9000,
      sortOrder: before.sortOrder,
      containerId: kraft.id,
      allowCup: true,
    });
  });

  it('a saved sheet uses bottles and cups; re-saving and deleting adjust the stock', async () => {
    const { kraft, clear, cup, latte, mojito } = await setup();
    await t.ok('PATCH', `/api/drinks/${latte.id}`, { containerId: kraft.id, allowCup: true });
    await t.ok('PATCH', `/api/drinks/${mojito.id}`, { containerId: clear.id });
    for (const c of [kraft, clear, cup]) await t.ok('POST', '/api/containers/receive', { containerId: c.id, qty: 100 });

    const day = today();
    // Latte: 10 sold + 2 gift, 3 of them in a cup → 9 kraft, 3 cups. Mojito: 5 → 5 transparent.
    const sheet = await t.ok('PUT', `/api/sheets/${day}`, {
      lines: [
        { drinkId: latte.id, soldQty: 10, giftQty: 2, cupQty: 3 },
        { drinkId: mojito.id, soldQty: 5, giftQty: 0 },
      ],
      containerCounts: [
        { containerId: kraft.id, countedUsed: 9 },
        { containerId: clear.id, countedUsed: 6 },
      ],
    });
    const usage = Object.fromEntries(sheet.containerUsage.map((u: any) => [u.containerId, u.used]));
    expect(usage).toEqual({ [kraft.id]: 9, [clear.id]: 5, [cup.id]: 3 });
    expect(sheet.containerCounts).toHaveLength(2);

    let stock = Object.fromEntries((await t.ok('GET', '/api/containers')).map((c: any) => [c.id, c.stockQty]));
    expect(stock).toEqual({ [kraft.id]: 91, [clear.id]: 95, [cup.id]: 97 });

    // Re-save with fewer: stock is corrected, not deducted twice.
    await t.ok('PUT', `/api/sheets/${day}`, { lines: [{ drinkId: latte.id, soldQty: 4, giftQty: 0, cupQty: 0 }] });
    stock = Object.fromEntries((await t.ok('GET', '/api/containers')).map((c: any) => [c.id, c.stockQty]));
    expect(stock).toEqual({ [kraft.id]: 96, [clear.id]: 100, [cup.id]: 100 });
    // Counts were not sent, so they are kept.
    expect((await t.ok('GET', `/api/sheets/${day}`)).containerCounts).toHaveLength(2);

    await t.ok('DELETE', `/api/sheets/${day}`);
    stock = Object.fromEntries((await t.ok('GET', '/api/containers')).map((c: any) => [c.id, c.stockQty]));
    expect(stock).toEqual({ [kraft.id]: 100, [clear.id]: 100, [cup.id]: 100 });
  });

  it('rejects more cups than drinks', async () => {
    const { latte } = await setup();
    const r = await t.call('PUT', `/api/sheets/${today()}`, { lines: [{ drinkId: latte.id, soldQty: 2, giftQty: 0, cupQty: 3 }] });
    expect(r.status).toBe(400);
  });

  it('a drink without a bottle set uses nothing until it is configured and the sheet re-saved', async () => {
    const { kraft, latte } = await setup();
    await t.ok('PUT', `/api/sheets/${today()}`, { lines: [{ drinkId: latte.id, soldQty: 5, giftQty: 0 }] });
    expect((await t.ok('GET', '/api/containers')).find((c: any) => c.id === kraft.id).stockQty).toBe(0);
    await t.ok('PATCH', `/api/drinks/${latte.id}`, { containerId: kraft.id });
    const sheet = await t.ok('PUT', `/api/sheets/${today()}`, { lines: [{ drinkId: latte.id, soldQty: 5, giftQty: 0 }] });
    expect(sheet.containerUsage).toEqual([{ containerId: kraft.id, used: 5 }]);
    expect((await t.ok('GET', '/api/containers')).find((c: any) => c.id === kraft.id).stockQty).toBe(-5);
  });

  it('receive with price creates an expense; count shows the difference; undo reverses', async () => {
    const { kraft } = await setup();
    const rec = await t.ok('POST', '/api/containers/receive', { containerId: kraft.id, qty: 200, total: 300000 });
    const exp = await t.ok('GET', '/api/expenses');
    expect(exp.total).toBe(300000);
    expect(exp.rows[0].categoryName).toBe('Stakan va qopqoqlar');

    const count = await t.ok('POST', '/api/containers/count', { containerId: kraft.id, counted: 195 });
    expect(count).toEqual({ expected: 200, counted: 195, difference: -5 });

    await t.ok('DELETE', `/api/container-movements/${rec.id}`);
    expect((await t.ok('GET', '/api/expenses')).total).toBe(0);
    expect((await t.ok('GET', '/api/containers')).find((c: any) => c.id === kraft.id).stockQty).toBe(-5);
  });

  it('report shows container usage for the period', async () => {
    const { kraft, latte } = await setup();
    await t.ok('PATCH', `/api/drinks/${latte.id}`, { containerId: kraft.id });
    await t.ok('PUT', `/api/sheets/${today()}`, { lines: [{ drinkId: latte.id, soldQty: 7, giftQty: 1 }] });
    const rep = await t.ok('GET', `/api/reports/summary?from=${today()}&to=${today()}`);
    expect(rep.containerUsage).toEqual([{ id: kraft.id, name: 'Kraft butilka', used: 8 }]);
  });
});

describe('snack write-offs (gifts, eaten, spoiled)', () => {
  it('records several products at once with a reason, before the count, without counting them as sales', async () => {
    const a = await t.ok('POST', '/api/products', { name: 'Snickers', sellPrice: 12000, cost: 8000, standQty: 20 });
    const b = await t.ok('POST', '/api/products', { name: 'Twix', sellPrice: 10000, cost: 6000, standQty: 10 });
    const r = await t.ok('POST', '/api/writeoffs/bulk', {
      reason: 'staff',
      lines: [
        { productId: a.id, qty: 2 },
        { productId: b.id, qty: 1 },
      ],
    });
    expect(r).toEqual({ qty: 3, cost: 2 * 8000 + 6000 });
    await t.ok('POST', '/api/writeoffs/bulk', { reason: 'gift', lines: [{ productId: a.id, qty: 1 }] });

    // Stand count afterwards: only real sales are counted.
    const count = await t.ok('POST', '/api/stand-counts', { lines: [{ productId: a.id, counted: 12 }] });
    expect(count.soldQty).toBe(5); // 20 − 3 written off − 12 left

    const rep = await t.ok('GET', `/api/reports/summary?from=${today()}&to=${today()}`);
    const byReason = Object.fromEntries(rep.writeoffsByReason.map((w: any) => [w.reason, w]));
    expect(byReason.staff).toMatchObject({ qty: 3, cost: 22000 });
    expect(byReason.gift).toMatchObject({ qty: 1, cost: 8000 });
    expect(rep.totals.snackRevenue).toBe(5 * 12000);

    const moves = await t.ok('GET', `/api/movements?productId=${a.id}&kind=writeoff`);
    expect(moves.map((m: any) => m.reason).sort()).toEqual(['gift', 'staff']);
  });

  it('refuses more than is on the stand', async () => {
    const a = await t.ok('POST', '/api/products', { name: 'Suv', sellPrice: 5000, standQty: 2 });
    const r = await t.call('POST', '/api/writeoffs/bulk', { reason: 'gift', lines: [{ productId: a.id, qty: 3 }] });
    expect(r.status).toBe(409);
  });
});
