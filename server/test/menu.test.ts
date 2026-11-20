import { describe, expect, it } from 'vitest';
import { setupApp } from './helpers.js';

const t = setupApp();

describe('public menu', () => {
  it('is available without logging in and lists active drinks by group and snacks in stock', async () => {
    await t.ok('POST', '/api/products', { name: 'Snickers', sellPrice: 12000, standQty: 5 });
    await t.ok('POST', '/api/products', { name: 'Tugagan', sellPrice: 9000 }); // no stock → hidden
    const drinks = await t.ok('GET', '/api/drinks');
    await t.ok('PATCH', `/api/drinks/${drinks[0].id}`, { active: false }); // Espresso hidden

    const res = await t.app.request('/api/public/menu'); // no cookie
    expect(res.status).toBe(200);
    const menu = (await res.json()) as any;
    expect(menu.groups[0].name).toBe('Issiq ichimliklar');
    expect(menu.groups[0].items[0]).toMatchObject({ name: 'Amerikano', price: 20000 });
    expect(menu.groups.flatMap((g: any) => g.items).some((i: any) => i.name === 'Espresso')).toBe(false);
    expect(menu.snacks.map((s: any) => s.name)).toEqual(['Snickers']);
    // No costs or stock numbers leak.
    expect(JSON.stringify(menu)).not.toMatch(/cost|Qty/i);
  });

  it('other API routes still require login', async () => {
    expect((await t.app.request('/api/drinks')).status).toBe(401);
    expect((await t.app.request('/api/public/other')).status).toBe(401);
  });
});
