# Deploying to a Hetzner server

Everything runs with Docker Compose on one server: the app, PostgreSQL, Caddy (HTTPS certificates
are obtained automatically) and a backup job. Expect ~15 minutes.

## 1. Server

- Hetzner Cloud → **Add server**: Ubuntu 24.04, the cheapest shared-vCPU plan with 2 vCPU / 4 GB
  (x86 or Arm both work), your usual location, your SSH key.
- Optional but recommended: tick **Backups** (whole-server snapshots, ~+20% of the price).
- Firewall: allow inbound TCP 22, 80, 443 (and UDP 443).

## 2. Domain

At your domain provider add an **A record** pointing to the server's IPv4 address, e.g.

```
kofe.yourdomain.com   A   203.0.113.10
```

(Add an AAAA record for IPv6 too if you like.) Wait until `ping kofe.yourdomain.com` shows the server IP.

## 3. Install Docker and the app

```bash
ssh root@<server-ip>
curl -fsSL https://get.docker.com | sh

git clone https://github.com/abbosc/pos.git /opt/pos   # private repo: see note below
cd /opt/pos
cp .env.example .env
nano .env
```

> **Private repository?** Create a deploy key on the server (`ssh-keygen -t ed25519 -f ~/.ssh/pos_deploy -N ""`),
> add `~/.ssh/pos_deploy.pub` in GitHub → repo → Settings → Deploy keys (read-only), then clone with
> `GIT_SSH_COMMAND='ssh -i ~/.ssh/pos_deploy' git clone git@github.com:abbosc/pos.git /opt/pos`
> and run `git config core.sshCommand 'ssh -i ~/.ssh/pos_deploy'` inside `/opt/pos` so `git pull` works later.

Fill in `.env`:

```bash
DOMAIN=kofe.yourdomain.com
ADMIN_PASSWORD=<a long password you will type on the phone>
SESSION_SECRET=<output of: openssl rand -hex 32>
POSTGRES_PASSWORD=<output of: openssl rand -hex 32>
```

Start:

```bash
docker compose up -d --build
docker compose ps          # all services "Up", app "healthy"
docker compose logs -f app # Ctrl+C to stop following
```

Open `https://kofe.yourdomain.com`, log in, and on the phone use **Add to Home Screen**
(Safari: Share → Add to Home Screen; Chrome: ⋮ → Install app).

## First-time setup in the app

1. **Kassa** → enter the cash that is in the desk now (*Boshlangʻich pul*).
2. **Yana → Mahsulotlar** → add every snack with its sell price, cost, and how many are in the
   warehouse and on the stand right now. Add photos.
3. **Yana → Ichimliklar menyusi** → the drinks from the paper sheet are already there. Check prices
   and fill in **cost per cup** for each drink.
4. **Xarajatlar** → adjust categories if needed.

## Updating to a new version

```bash
cd /opt/pos
git pull
docker compose up -d --build
```

Database migrations run automatically when the app starts.

## Backups

- Every night after 02:00 (Tashkent) the `backup` service writes
  `/opt/pos/backups/pos-YYYY-MM-DD.dump` (database) and `uploads-YYYY-MM-DD.tar.gz` (photos),
  keeping 30 days (`BACKUP_KEEP_DAYS`).
- These live on the same server, so also copy them off it. The simplest option is Hetzner's server
  Backups (step 1). Another is a Hetzner Storage Box with a nightly `rsync`, for example in
  `crontab -e`:
  ```
  30 3 * * * rsync -a /opt/pos/backups/ u123456@u123456.your-storagebox.de:pos-backups/ -e 'ssh -p 23'
  ```
- **Restore** (replaces all current data):
  ```bash
  cd /opt/pos
  sh deploy/restore.sh backups/pos-2026-11-16.dump backups/uploads-2026-11-16.tar.gz
  ```

## Telegram notifications (optional)

1. In Telegram, talk to **@BotFather** → `/newbot` → copy the token.
2. Add the bot to your group (or message it directly), send any message, then open
   `https://api.telegram.org/bot<TOKEN>/getUpdates` and copy `chat.id` (group ids start with `-`).
3. Put both into `.env` as `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID`, then `docker compose up -d`.

You'll get the cash close summary (sales, expenses, expected vs. counted, Farq) and low-stock alerts.

## Running next to other sites on an existing server

If the server already runs nginx/Caddy/Traefik on ports 80/443, remove the `caddy` service from
`docker-compose.yml`, publish the app port instead (`ports: ["127.0.0.1:3000:3000"]` under `app`),
and proxy your domain to `http://127.0.0.1:3000` in the existing web server (with HTTPS).

## Useful commands

```bash
docker compose logs --tail=100 app          # app logs
docker compose exec db psql -U pos          # database shell
docker compose restart app                  # restart the app
```

Changing `ADMIN_PASSWORD` (then `docker compose up -d`) logs out every device.
