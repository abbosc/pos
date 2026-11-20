import { describe, expect, it } from 'vitest';
import { setupApp } from './helpers.js';

const t = setupApp();

describe('public TV menu', () => {
  it('is available without logging in and lists active drinks by group with the recommended flag', async () => {
    await t.ok('POST', '/api/products', { name: 'Snickers', sellPrice: 12000, standQty: 5 });
    const drinks = await t.ok('GET', '/api/drinks');
    await t.ok('PATCH', `/api/drinks/${drinks[0].id}`, { active: false }); // Espresso hidden

    const res = await t.app.request('/api/public/menu'); // no cookie
    expect(res.status).toBe(200);
    const menu = (await res.json()) as any;
    expect(menu.groups.map((g: any) => g.name)).toEqual([
      'Issiq kofe',
      'Ays kofe',
      'Anchan va matcha',
      'Milksheyk',
      'Mualliflik choyi',
      'Fresh',
      'Muzdek ichimliklar',
    ]);
    expect(menu.groups[0].items[0]).toMatchObject({ name: 'Amerikano', price: 20000, featured: false });
    const all = menu.groups.flatMap((g: any) => g.items);
    expect(all.some((i: any) => i.name === 'Espresso')).toBe(false);
    expect(all.filter((i: any) => i.featured).map((i: any) => i.name)).toEqual(['Raf xolva', 'Ays anchan qulupnayli']);
    // Drinks only, and no costs leak.
    expect(menu.snacks).toBeUndefined();
    expect(JSON.stringify(menu)).not.toMatch(/Snickers|cost/i);
  });

  it('other API routes still require login', async () => {
    expect((await t.app.request('/api/drinks')).status).toBe(401);
    expect((await t.app.request('/api/public/other')).status).toBe(401);
  });

  it('featured can be toggled from the admin side', async () => {
    const drinks = await t.ok('GET', '/api/drinks');
    const latte = drinks.find((d: any) => d.name === 'Latte');
    expect((await t.ok('PATCH', `/api/drinks/${latte.id}`, { featured: true })).featured).toBe(true);
  });
});
