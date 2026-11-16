import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach } from 'vitest';
import { createApp } from '../src/app.js';
import { createDb, runMigrations } from '../src/db/index.js';
import { seedDefaults } from '../src/db/seed.js';

export function setupApp() {
  const { db, client } = createDb(process.env.DATABASE_URL!);
  const app = createApp(db);
  let cookie = '';

  beforeAll(async () => {
    await runMigrations(db);
  });

  beforeEach(async () => {
    await db.execute(sql`
      truncate cash_closes, products, purchases, stand_counts, stock_movements, drinks,
        drink_sheets, drink_sheet_lines, expense_categories, expenses, cash_movements
      restart identity cascade
    `);
    await seedDefaults(db);
    const res = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'test-pass' }),
    });
    cookie = res.headers.get('set-cookie')!.split(';')[0]!;
  });

  afterAll(async () => {
    await client.end();
  });

  async function call<T = any>(method: string, url: string, body?: unknown): Promise<{ status: number; body: T }> {
    const res = await app.request(url, {
      method,
      headers: { cookie, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, body: (await res.json()) as T };
  }

  /** Call and assert a 2xx response. */
  async function ok<T = any>(method: string, url: string, body?: unknown): Promise<T> {
    const r = await call<T>(method, url, body);
    if (r.status >= 300) throw new Error(`${method} ${url} → ${r.status} ${JSON.stringify(r.body)}`);
    return r.body;
  }

  return { app, db, call, ok, get cookie() { return cookie; } };
}
