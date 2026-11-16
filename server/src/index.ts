import fs from 'node:fs';
import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { config } from './config.js';
import { createDb, runMigrations } from './db/index.js';
import { seedDefaults } from './db/seed.js';
import { registerTelegramNotifications } from './lib/telegram.js';

fs.mkdirSync(config.uploadDir, { recursive: true });

const { db, client } = createDb(config.databaseUrl);
await runMigrations(db);
await seedDefaults(db);
registerTelegramNotifications();

const app = createApp(db);
const server = serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`POS server listening on http://localhost:${info.port}`);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close();
    client.end({ timeout: 5 }).finally(() => process.exit(0));
  });
}
