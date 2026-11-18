import fs from 'node:fs';
import path from 'node:path';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { sql } from 'drizzle-orm';
import { bodyLimit } from 'hono/body-limit';
import { compress } from 'hono/compress';
import { secureHeaders } from 'hono/secure-headers';
import { z } from 'zod';
import { config } from './config.js';
import type { DB } from './db/index.js';
import { isLoggedIn, login, logout, requireAuth } from './lib/auth.js';
import { AppError, parse } from './lib/errors.js';
import { bus } from './lib/events.js';
import { MAX_UPLOAD_BYTES, removeImage, saveImage } from './lib/images.js';
import { today } from './lib/time.js';
import * as cash from './services/cash.js';
import * as containersSvc from './services/containers.js';
import * as drinks from './services/drinks.js';
import * as expenses from './services/expenses.js';
import * as productsSvc from './services/products.js';
import * as reports from './services/reports.js';
import * as stock from './services/stock.js';

const idParam = z.coerce.number().int().positive();

async function readJson(c: { req: { json: () => Promise<unknown> } }) {
  try {
    return await c.req.json();
  } catch {
    throw new AppError(400, 'Soʻrov notoʻgʻri (JSON kutilgan)');
  }
}

async function readImage(c: { req: { parseBody: () => Promise<Record<string, unknown>> } }) {
  const body = await c.req.parseBody();
  const file = body.file;
  if (!(file instanceof File)) throw new AppError(400, 'Rasm fayli yuborilmagan');
  return saveImage(file);
}

export function createApp(db: DB) {
  const app = new Hono();

  app.onError((err, c) => {
    if (err instanceof AppError) return c.json({ error: err.message }, err.status);
    console.error(err);
    return c.json({ error: 'Serverda xatolik yuz berdi. Qayta urinib koʻring.' }, 500);
  });

  app.use('*', secureHeaders({ crossOriginResourcePolicy: 'same-origin' }));
  app.use('/api/*', compress());

  app.get('/api/health', async (c) => {
    await db.execute(sql`select 1`);
    return c.json({ ok: true });
  });

  // ─── Auth ────────────────────────────────────────────────────────────────
  app.post('/api/auth/login', async (c) => {
    const { password } = parse(z.object({ password: z.string().max(200) }), await readJson(c));
    login(c, password);
    return c.json({ ok: true });
  });
  app.post('/api/auth/logout', (c) => {
    logout(c);
    return c.json({ ok: true });
  });
  app.get('/api/auth/me', (c) => c.json({ loggedIn: isLoggedIn(c) }));

  const api = new Hono();
  api.use('*', requireAuth);
  api.use(
    '*',
    bodyLimit({
      maxSize: MAX_UPLOAD_BYTES + 1024 * 1024,
      onError: (c) => c.json({ error: 'Fayl juda katta' }, 413),
    }),
  );

  // ─── Dashboard & reports ─────────────────────────────────────────────────
  api.get('/dashboard', async (c) => c.json(await reports.dashboard(db)));
  api.get('/reports/summary', async (c) => c.json(await reports.summary(db, c.req.query())));
  api.get('/today', (c) => c.json({ today: today() }));

  // ─── Products ────────────────────────────────────────────────────────────
  api.get('/products', async (c) =>
    c.json(await productsSvc.listProducts(db, { includeInactive: c.req.query('all') === '1' })),
  );
  api.post('/products', async (c) => c.json(await productsSvc.createProduct(db, await readJson(c)), 201));
  api.get('/products/:id', async (c) => c.json(await productsSvc.getProduct(db, parse(idParam, c.req.param('id')))));
  api.patch('/products/:id', async (c) =>
    c.json(await productsSvc.updateProduct(db, parse(idParam, c.req.param('id')), await readJson(c))),
  );
  api.delete('/products/:id', async (c) => {
    const img = await productsSvc.deleteProduct(db, parse(idParam, c.req.param('id')));
    await removeImage(img);
    return c.json({ ok: true });
  });
  api.post('/products/:id/image', async (c) => {
    const pid = parse(idParam, c.req.param('id'));
    await productsSvc.getProduct(db, pid);
    const newPath = await readImage(c);
    const old = await productsSvc.setProductImage(db, pid, newPath);
    await removeImage(old);
    return c.json({ imagePath: newPath });
  });
  api.delete('/products/:id/image', async (c) => {
    const old = await productsSvc.setProductImage(db, parse(idParam, c.req.param('id')), null);
    await removeImage(old);
    return c.json({ ok: true });
  });
  api.get('/movements', async (c) => c.json(await productsSvc.listMovements(db, c.req.query())));

  // ─── Stock operations ────────────────────────────────────────────────────
  api.get('/purchases', async (c) => c.json(await stock.listPurchases(db)));
  api.post('/purchases', async (c) => c.json(await stock.recordPurchase(db, await readJson(c)), 201));
  api.delete('/purchases/:id', async (c) => {
    await stock.deletePurchase(db, parse(idParam, c.req.param('id')));
    return c.json({ ok: true });
  });
  api.post('/refill', async (c) => c.json(await stock.refillStand(db, await readJson(c))));
  api.get('/stand-counts', async (c) => c.json(await stock.listStandCounts(db)));
  api.get('/stand-counts/:id', async (c) => c.json(await stock.getStandCount(db, parse(idParam, c.req.param('id')))));
  api.post('/stand-counts', async (c) => {
    const result = await stock.recordStandCount(db, await readJson(c));
    notifyLowStock(db, result.lines.map((l) => ({ productId: l.productId, before: l.expected }))).catch(console.error);
    return c.json(result, 201);
  });
  api.delete('/stand-counts/:id', async (c) => {
    await stock.deleteStandCount(db, parse(idParam, c.req.param('id')));
    return c.json({ ok: true });
  });
  api.post('/writeoffs', async (c) => c.json(await stock.writeOff(db, await readJson(c))));
  api.post('/writeoffs/bulk', async (c) => c.json(await stock.writeOffMany(db, await readJson(c))));
  api.post('/corrections', async (c) => c.json(await stock.correctStock(db, await readJson(c))));

  // ─── Drinks ──────────────────────────────────────────────────────────────
  api.get('/drinks', async (c) => c.json(await drinks.listDrinks(db, { includeInactive: c.req.query('all') === '1' })));
  api.post('/drinks', async (c) => c.json(await drinks.createDrink(db, await readJson(c)), 201));
  api.patch('/drinks/:id', async (c) =>
    c.json(await drinks.updateDrink(db, parse(idParam, c.req.param('id')), await readJson(c))),
  );
  api.delete('/drinks/:id', async (c) => {
    const img = await drinks.deleteDrink(db, parse(idParam, c.req.param('id')));
    await removeImage(img);
    return c.json({ ok: true });
  });
  api.post('/drinks/:id/image', async (c) => {
    const did = parse(idParam, c.req.param('id'));
    await drinks.getDrink(db, did);
    const newPath = await readImage(c);
    const old = await drinks.setDrinkImage(db, did, newPath);
    await removeImage(old);
    return c.json({ imagePath: newPath });
  });
  api.delete('/drinks/:id/image', async (c) => {
    const old = await drinks.setDrinkImage(db, parse(idParam, c.req.param('id')), null);
    await removeImage(old);
    return c.json({ ok: true });
  });
  api.get('/sheets', async (c) => c.json(await drinks.listSheets(db)));
  api.get('/sheets/:date', async (c) => c.json(await drinks.getSheet(db, c.req.param('date'))));
  api.put('/sheets/:date', async (c) => c.json(await drinks.saveSheet(db, c.req.param('date'), await readJson(c))));
  api.delete('/sheets/:date', async (c) => {
    await drinks.deleteSheet(db, c.req.param('date'));
    return c.json({ ok: true });
  });

  // ─── Containers (bottles, cups) ──────────────────────────────────────────
  api.get('/containers', async (c) =>
    c.json(await containersSvc.listContainers(db, { includeInactive: c.req.query('all') === '1' })),
  );
  api.post('/containers', async (c) => c.json(await containersSvc.createContainer(db, await readJson(c)), 201));
  api.patch('/containers/:id', async (c) =>
    c.json(await containersSvc.updateContainer(db, parse(idParam, c.req.param('id')), await readJson(c))),
  );
  api.post('/containers/receive', async (c) => c.json(await containersSvc.receiveContainers(db, await readJson(c)), 201));
  api.post('/containers/count', async (c) => c.json(await containersSvc.countContainers(db, await readJson(c))));
  api.post('/containers/writeoff', async (c) => c.json(await containersSvc.writeOffContainers(db, await readJson(c))));
  api.get('/container-movements', async (c) => c.json(await containersSvc.listContainerMovements(db, c.req.query())));
  api.delete('/container-movements/:id', async (c) => {
    await containersSvc.deleteContainerMovement(db, parse(idParam, c.req.param('id')));
    return c.json({ ok: true });
  });

  // ─── Expenses ────────────────────────────────────────────────────────────
  api.get('/expense-categories', async (c) => c.json(await expenses.listCategories(db)));
  api.post('/expense-categories', async (c) => c.json(await expenses.createCategory(db, await readJson(c)), 201));
  api.patch('/expense-categories/:id', async (c) =>
    c.json(await expenses.updateCategory(db, parse(idParam, c.req.param('id')), await readJson(c))),
  );
  api.delete('/expense-categories/:id', async (c) => {
    await expenses.deleteCategory(db, parse(idParam, c.req.param('id')));
    return c.json({ ok: true });
  });
  api.get('/expenses', async (c) => c.json(await expenses.listExpenses(db, c.req.query())));
  api.post('/expenses', async (c) => c.json(await expenses.createExpense(db, await readJson(c)), 201));
  api.patch('/expenses/:id', async (c) =>
    c.json(await expenses.updateExpense(db, parse(idParam, c.req.param('id')), await readJson(c))),
  );
  api.delete('/expenses/:id', async (c) => {
    await expenses.deleteExpense(db, parse(idParam, c.req.param('id')));
    return c.json({ ok: true });
  });

  // ─── Cash desk ───────────────────────────────────────────────────────────
  api.get('/cash', async (c) => c.json(await cash.cashStatus(db)));
  api.post('/cash/close', async (c) => c.json(await cash.closeCash(db, await readJson(c)), 201));
  api.post('/cash/reopen', async (c) => c.json(await cash.reopenLastClose(db)));
  api.get('/cash/closes', async (c) => c.json(await cash.listCloses(db)));
  api.get('/cash/movements', async (c) => c.json(await cash.listCashMovements(db)));
  api.post('/cash/movements', async (c) => c.json(await cash.addCashMovement(db, await readJson(c)), 201));
  api.delete('/cash/movements/:id', async (c) => {
    await cash.deleteCashMovement(db, parse(idParam, c.req.param('id')));
    return c.json({ ok: true });
  });

  app.route('/api', api);
  app.all('/api/*', (c) => c.json({ error: 'Topilmadi' }, 404));

  // ─── Uploaded images ─────────────────────────────────────────────────────
  app.use(
    '/uploads/*',
    serveStatic({
      root: path.relative(process.cwd(), config.uploadDir),
      rewriteRequestPath: (p) => p.replace(/^\/uploads/, ''),
      onFound: (_p, c) => c.header('Cache-Control', 'public, max-age=31536000, immutable'),
    }),
  );

  // ─── Web app (production) ────────────────────────────────────────────────
  if (fs.existsSync(path.join(config.webDir, 'index.html'))) {
    const root = path.relative(process.cwd(), config.webDir);
    app.use(
      '/assets/*',
      serveStatic({ root, onFound: (_p, c) => c.header('Cache-Control', 'public, max-age=31536000, immutable') }),
    );
    app.use('*', serveStatic({ root }));
    const indexHtml = fs.readFileSync(path.join(config.webDir, 'index.html'), 'utf8');
    app.get('*', (c) => {
      c.header('Cache-Control', 'no-cache');
      return c.html(indexHtml);
    });
  }

  return app;
}

/** Emit `stock.low` for products whose stand quantity just dropped to their warning level. */
async function notifyLowStock(db: DB, changed: { productId: number; before: number }[]) {
  const before = new Map(changed.map((c) => [c.productId, c.before]));
  const all = await productsSvc.listProducts(db);
  const crossed = all.filter(
    (p) =>
      before.has(p.id) &&
      p.lowStockLevel > 0 &&
      p.standQty <= p.lowStockLevel &&
      (before.get(p.id) ?? 0) > p.lowStockLevel,
  );
  if (crossed.length) {
    bus.emit(
      'stock.low',
      crossed.map((p) => ({
        id: p.id,
        name: p.name,
        standQty: p.standQty,
        warehouseQty: p.warehouseQty,
        lowStockLevel: p.lowStockLevel,
      })),
    );
  }
}
