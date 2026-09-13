# Dev HR Management — Server

NestJS backend, meant to gradually become the main server for Dev HR Management
(migrating off MongoDB to Prisma + PostgreSQL as modules move over).

**Current scope (MVP):** WhatsApp support automation only.
Client sends a WhatsApp message → OpenAI replies grounded on a pgvector-backed FAQ
knowledge base → if the AI decides it needs a human, it escalates by pinging one
fixed support number over WhatsApp and marks the conversation `ESCALATED`.

No auth/RBAC on the WhatsApp module by design — the webhook must stay reachable
without login. Everything else added later (tickets, meetings, admin dashboard) will
sit behind the `auth` module's JWT + role guards as it's built out.

## Stack

- NestJS 12 (ESM, `nodenext`)
- PostgreSQL 17 + [pgvector](https://github.com/pgvector/pgvector) (RAG knowledge base)
- Prisma 7 (`@prisma/adapter-pg` driver adapter — Prisma 7 no longer talks to the DB
  directly, it goes through an explicit driver)
- Redis + BullMQ (queues the inbound WhatsApp message so the webhook responds
  instantly; the AI reply happens in a background worker)
- OpenAI SDK (chat + embeddings)
- Meta WhatsApp Cloud API

## Local development

Requires Docker (for Postgres/Redis) and pnpm.

```bash
cp .env.example .env        # then fill in real secrets
docker compose up -d        # starts postgres (pgvector) + redis, bound to 127.0.0.1 only
pnpm install
pnpm prisma:migrate         # applies prisma/migrations, creates tables + vector extension
pnpm start:dev
```

Seed a few FAQ entries (edit `src/knowledge-base/seed-faqs.ts` first, then):

```bash
pnpm seed:faqs
```

Webhook endpoints (both public, no auth):

- `GET /whatsapp/webhook` — Meta's verification handshake
- `POST /whatsapp/webhook` — inbound messages (must carry Meta's `X-Hub-Signature-256`
  once `WHATSAPP_APP_SECRET` is set; without it, signature checking is skipped so you
  can exercise the endpoint locally with plain `curl`)

## Wiring up Meta WhatsApp Cloud API

1. Create a Meta App → add the "WhatsApp" product → grab a test phone number.
2. In the app's WhatsApp → Configuration screen, set the webhook URL to
   `https://<your-domain>/whatsapp/webhook` and the verify token to whatever you put
   in `WHATSAPP_VERIFY_TOKEN`.
3. Subscribe the webhook to the `messages` field.
4. Copy the **App Secret** into `WHATSAPP_APP_SECRET` (enables signature verification).
5. Generate a permanent access token (System User in Meta Business Suite, not the
   24h test token) → `WHATSAPP_ACCESS_TOKEN`.
6. Copy the phone number ID → `WHATSAPP_PHONE_NUMBER_ID`.
7. Set `WHATSAPP_SUPPORT_NUMBER` to the one number that should receive "please reply"
   escalation pings for the MVP.

## Deploying to your own VPS (fully self-hosted, no managed DB)

This app expects Postgres and Redis to be private services only the app itself can
reach — never exposed to the internet. Everything below is a manual step on the VPS
itself (SSH in and run it there); it isn't something I can do remotely for you.

### 1. Firewall first

```bash
sudo apt update && sudo apt install -y ufw fail2ban
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow OpenSSH
sudo ufw allow 443/tcp   # only the reverse proxy's HTTPS port needs to be public
sudo ufw enable
sudo systemctl enable --now fail2ban
```

Do **not** open 5432 (Postgres) or 6379 (Redis) — `docker-compose.yml` already binds
both to `127.0.0.1` only, so they're unreachable from outside the box even if the
firewall rule is missed.

### 2. Docker + the app

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER   # re-login after this
```

Clone the repo, create `.env` on the server with strong random values for every
`change-me-to-a-long-random-value` placeholder (`openssl rand -hex 32` is fine), then:

```bash
docker compose up -d
pnpm install --prod
pnpm build
pnpm prisma:migrate deploy   # `deploy`, not `dev`, in production — no interactive prompts
pnpm start:prod
```

Run `pnpm start:prod` under a process manager (systemd unit or pm2), not directly in
a terminal, so it restarts on crash/reboot.

### 3. Reverse proxy + TLS

Put nginx or Caddy in front of the Nest app (which should itself only listen on
`127.0.0.1:$PORT`), terminate TLS there (Let's Encrypt via certbot or Caddy's
automatic HTTPS), and only that proxy's 443 is exposed per the firewall rules above.
Meta's webhook requires HTTPS — plain HTTP won't be accepted.

### 4. Backups

```bash
docker exec whatsapp-automation-postgres-1 pg_dump -U devhr devhr | gzip > backup-$(date +%F).sql.gz
```
Cron this daily, ship the file off-box (rsync/S3-compatible bucket) — a backup that
only lives on the same VPS doesn't survive a disk failure.

### 5. Secrets

Never commit `.env`. On the VPS, restrict its permissions:

```bash
chmod 600 .env
```

Rotate `WHATSAPP_ACCESS_TOKEN`, `JWT_SECRET`, `POSTGRES_PASSWORD` and
`REDIS_PASSWORD` if they're ever exposed (leaked log, committed by accident, etc).

## Project layout

```
src/
  config/          env validation (class-validator) — app fails fast on bad config
  prisma/           PrismaService wired to the pg driver adapter
  queue/            BullMQ connection + queue names
  ai/               OpenAI client + the RAG "should this escalate?" logic
  knowledge-base/   FAQ storage + pgvector similarity search
  whatsapp/         webhook controller, signature guard, conversation persistence,
                    queue processor that ties AI + WhatsApp send together
  auth/             (skeleton, not wired to anything yet) JWT + roles for when the
                    admin dashboard / other MongoDB-migrated modules land here
```

As MongoDB-backed features move into this service, they should land as their own
`src/<feature>` module following the same pattern — Prisma models in
`prisma/schema.prisma`, a module/service/controller triplet, guarded by the `auth`
module's `JwtAuthGuard` + `RolesGuard` (the WhatsApp module is the one deliberate
exception to that).
