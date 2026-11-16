# Sodiq Coffee — sales, stock and cash tracker

A mobile-first web app (Uzbek UI) for the school coffee bar. It doesn't take orders.
It records what happened during the day and works out the money:

- **Drinks** — the daily paper sheet (*Kunlik savdo roʻyxati*) is typed in: sold and gift counts per drink.
- **Snacks** — stock lives in the **warehouse** (*ombor*) or on the **stand** (*vitrina*).
  Refill the stand at any time; count the stand at any time — whatever is missing since the last
  count is recorded as sold.
- **Expenses** — anything bought for the bar. Snack purchases add stock and create the expense automatically.
- **Cash desk** — the app always knows how much cash *should* be in the desk; at closing you enter the
  counted amount and it shows the difference (*Farq*).
- **Reports** — sales, profit per drink and per snack, gifts, write-offs, expenses by category.
- **Photos** for products and drinks (taken with the phone camera, resized automatically).
- **Telegram** notifications (optional) — cash close summary and low-stock alerts.

See [`docs/PLAN.md`](docs/PLAN.md) for the full feature list and data model,
[`docs/DEPLOY.md`](docs/DEPLOY.md) to put it on a Hetzner server, and
[`docs/QOLLANMA.md`](docs/QOLLANMA.md) for the staff guide (Uzbek).

## Stack

| Part | Tech |
|---|---|
| Backend | Node.js 22, TypeScript, [Hono](https://hono.dev), [Drizzle ORM](https://orm.drizzle.team), PostgreSQL 16 |
| Frontend | React 19, Vite, Tailwind CSS 4, TanStack Query, installable PWA |
| Images | sharp → 600×600 WebP on disk |
| Hosting | One VPS with Docker Compose: app + Postgres + Caddy (auto HTTPS) + nightly backups |

```
server/            API + business logic
  src/services/    stock, drinks, expenses, cash, reports — all rules live here
  src/lib/events   domain events (Telegram and future integrations subscribe here)
  drizzle/         SQL migrations (applied automatically on start)
  test/            integration tests against a real PostgreSQL
web/               React app (served by the server in production)
deploy/            Caddyfile, backup and restore scripts
```

## Local development

Requires Node 22+ and a PostgreSQL database.

```bash
npm install
createdb pos                      # or: DATABASE_URL=postgres://... in .env
npm run dev:server                # API on :3000 (migrates + seeds the drink menu)
npm run dev:web                   # app on :5173, proxies /api to :3000
```

Development login password is `admin` unless `ADMIN_PASSWORD` is set.

```bash
createdb pos_test && npm test     # integration tests
npm run typecheck
npm run build
```

After changing `server/src/db/schema.ts`, generate a migration with
`npm run db:generate -w server -- --name <what-changed>` and commit it.
