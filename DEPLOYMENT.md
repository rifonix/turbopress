# WP Instant Production Deployment Guide

Production topology (two Workers on the `wpinstant.dev` zone):

| Worker | Domain | Package | Purpose |
|---|---|---|---|
| `wpinstant-api` | `api.wpinstant.dev` | `packages/edge-api` | Hono Edge API, queue producer/consumer, DLQ consumer, cron sweeper, browser extraction |
| `wpinstant-app` | `wpinstant.dev` | `packages/saas-app` | Next.js 15 dashboard (OpenNext) — marketing homepage at `/` + portal at `/dashboard` |

Resources: D1 `wpinstant-db`, KV `wpinstant-kv`, R2 `wpinstant-assets`, public media R2
`wpinstant-public-media` (`objects.wpinstant.dev`), Queues `wpinstant-optimization-queue` + `wpinstant-dlq`.

---

## 1. Provision Cloudflare Resources

```bash
npx wrangler d1 create wp-instant-db            # → update database_id in packages/edge-api/wrangler.jsonc
npx wrangler kv namespace create wp-instant-kv  # → update kv_namespaces id
npx wrangler r2 bucket create wp-instant-assets
npx wrangler r2 bucket create wpinstant-public-media
npx wrangler queues create wp-instant-optimization-queue
npx wrangler queues create wp-instant-dlq
```

Connect `objects.wpinstant.dev` to `wpinstant-public-media` as an R2 custom
domain. Keep `cdn.wpinstant.dev` attached to `wpinstant-api`; do not attach it
to R2. Only media derivatives may be written to the public bucket—critical CSS,
plugin artifacts, and other control-plane objects remain in `wpinstant-assets`.

Apply D1 migrations:

```bash
cd packages/edge-api
npx wrangler d1 migrations apply wp-instant-db --remote
```

## 2. Secrets

Edge API (`packages/edge-api`):

```bash
npx wrangler secret put CLERK_SECRET_KEY            # TODO: production sk_live_ key
npx wrangler secret put CLERK_WEBHOOK_SIGNING_SECRET
npx wrangler secret put POLAR_ACCESS_TOKEN
npx wrangler secret put POLAR_WEBHOOK_SECRET
```

Dashboard (`packages/saas-app`):

```bash
npx wrangler secret put CLERK_SECRET_KEY            # same Clerk instance as the API
```

Also update `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` in `packages/saas-app/wrangler.jsonc` (vars) with the production `pk_live_` key.

## 3. Deploy

```bash
npm run build --workspace=@wpinstant/shared

# Edge API (api.wpinstant.dev, queue consumers, cron trigger)
cd packages/edge-api && npx wrangler deploy

# Dashboard (wpinstant.dev)
cd packages/saas-app && npx wrangler deploy
```

## 4. Webhooks

- **Polar**: Dashboard → Settings → Webhooks → `https://api.wpinstant.dev/api/v1/billing/polar-webhook`, events: `subscription.created/updated/active/canceled/revoked`. Secret → `POLAR_WEBHOOK_SECRET`.
- **Clerk**: Dashboard → Webhooks → `https://api.wpinstant.dev/api/v1/auth/clerk-webhook`, events: `user.created/updated/deleted`. Secret → `CLERK_WEBHOOK_SIGNING_SECRET`.

## 5. WordPress Plugin Release

```bash
cd packages/wp-plugin
npm run build          # produces wp-instant-<version>.zip with the correct wp-instant/ slug
npx wrangler r2 object put "wpinstant-assets/plugin/wp-instant.zip" --file=wp-instant-<version>.zip --content-type application/zip --remote
```

The zip is then publicly available at `https://api.wpinstant.dev/api/v1/assets/plugin/download` (linked from the dashboard Overview and Onboarding screens).
