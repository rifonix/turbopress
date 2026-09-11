# WP Instant — Production Setup Guide

Everything you need to configure keys, pricing, products, and deployments.
Audience: you, once you have your production Clerk and Polar credentials.

---

## 1. Architecture & Hostnames

| Hostname | Worker | Purpose |
|---|---|---|
| `wpinstant.dev` | `wpinstant-app` | Marketing homepage (`/`) + portal (`/dashboard/…`), sign-in, connect |
| `api.wpinstant.dev` | `wpinstant-api` | Control plane: REST API, auth, pairing, billing webhooks, queue consumer |
| `cdn.wpinstant.dev` | `wpinstant-api` (same worker) | Visitor-facing asset delivery: media derivatives, critical CSS, plugin zip — R2-backed |
| `objects.wpinstant.dev` | none (R2 custom domain) | Direct public delivery of immutable media derivatives from `wpinstant-public-media` |

All Worker hostnames are Workers custom domains on the `wpinstant.dev` zone
(id `731977825d1dde521498998580dd5e11`, **active**); `objects.wpinstant.dev` is
an R2 custom domain.
The Worker CDN remains the cold-fill/fallback path for new derivatives. Once a
versioned image derivative is uploaded successfully, newly rendered HTML can use
the direct `objects.wpinstant.dev` URL. The plugin stores proven URLs in
`wp_instant_public_media_manifest`, so it never emits a direct URL before the
object exists. All control-plane calls still go to `api.wpinstant.dev`.

The dashboard lives under the `/dashboard` path prefix (Next.js route segment);
the marketing homepage is served at `/`. Clerk sign-in/up stay at `/sign-in`,
`/sign-up`; the pairing authorize screen at `/connect`; public embed panels at `/embed/…`.

The old `app.wpinstant.dev` dashboard hostname is retired — the portal is
`wpinstant.dev/dashboard`.

### Cloudflare resources (account `8bf11cd648b64d5dc88ba50312319c8a`)

| Resource | Name | ID / notes |
|---|---|---|
| D1 database | `wpinstant-db` | `a6ffe36b-3e1a-46a2-895b-91693b1538e1` — migrations 0001–0006 applied |
| KV namespace | `wpinstant-kv` | `5883ffa03f40476faf654faa8e531e48` |
| R2 bucket | `wpinstant-assets` | critical CSS, media derivatives, `plugin/wp-instant.zip` |
| R2 public bucket | `wpinstant-public-media` | media-only immutable derivatives; custom domain `objects.wpinstant.dev` |
| Queue | `wpinstant-optimization-queue` | producer + consumer (batch 5 / 30s / 3 retries) |
| Queue | `wpinstant-dlq` | consumer attached; failed jobs marked `failed` + surfaced in attention feed |
| Cron | `*/15 * * * *` | zombie-job sweeper + subscription expiry sweep |

Configs: `packages/edge-api/wrangler.jsonc` and `packages/saas-app/wrangler.jsonc`.

---

## 2. Clerk (authentication) — production setup

The dashboard signs users in with Clerk; the API verifies dashboard JWTs against Clerk's JWKS.

### 2.1 Create the production instance

1. In Clerk, create a **production instance** (or promote your dev instance — recommended: separate instance so dev keys keep working).
2. Copy from **API Keys**:
   - **Publishable key** — starts with `pk_live_…` (public, safe to commit)
   - **Secret key** — starts with `sk_live_…` (SECRET — never commit, never paste in chat)

### 2.2 Where each key goes

| Key | Worker | Type | Name |
|---|---|---|---|
| `pk_live_…` | `wpinstant-app` | **var** (build-time!) | `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` |
| `pk_live_…` | `wpinstant-api` | **var** | `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` |
| `sk_live_…` | `wpinstant-app` | **secret** | `CLERK_SECRET_KEY` |
| `sk_live_…` | `wpinstant-api` | **secret** | `CLERK_SECRET_KEY` |
| webhook signing secret | `wpinstant-api` | **secret** | `CLERK_WEBHOOK_SIGNING_SECRET` |

The API worker derives the JWKS URL from the publishable key, so **both workers must carry the same `pk_live_` value**.

> **The publishable key on `wpinstant-app` is inlined at build time** (Next.js `NEXT_PUBLIC_*`).
> Changing it requires editing `packages/saas-app/wrangler.jsonc` and **rebuilding + redeploying** the dashboard — a `wrangler secret put` is not enough.

Set the secrets (run once per worker, paste value when prompted):

```bash
cd packages/edge-api
npx wrangler secret put CLERK_SECRET_KEY --name wpinstant-api
npx wrangler secret put CLERK_WEBHOOK_SIGNING_SECRET --name wpinstant-api

cd ../saas-app
npx wrangler secret put CLERK_SECRET_KEY --name wpinstant-app
```

To update the publishable key vars, replace `pk_test_…` in **both** `wrangler.jsonc` files:

```jsonc
"vars": {
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY": "pk_live_YOUR_KEY",
  ...
}
```

then redeploy **both** workers (see §6) — the dashboard one needs a full rebuild.

### 2.3 Clerk webhook

In the Clerk dashboard → **Webhooks → Add Endpoint**:

- **Endpoint URL:** `https://api.wpinstant.dev/api/v1/auth/clerk-webhook`
- **Events:** `user.created`, `user.updated`, `user.deleted`
- Copy the **Signing Secret** → `CLERK_WEBHOOK_SIGNING_SECRET` (command above).

`user.deleted` cascades the D1 delete and purges the site-auth KV cache immediately.

### 2.4 Clerk application settings

Under **Configure → URLs / Domains** for the production instance:

- Add production domain: `wpinstant.dev`
- Sign-in / sign-up redirect URLs: `https://wpinstant.dev/**`
- Allowed origins: `https://wpinstant.dev`

---

## 3. Polar (billing) — production setup

### 3.1 Pricing model (what the app advertises)

Prices live in **two mirrored places** — keep them in sync:

- `packages/edge-api/src/routes/billing.ts` → `PLAN_LIMITS` (entitlements + monthly price)
- `packages/saas-app/src/components/PricingPage.tsx` (display prices)

| Plan | Monthly | Annual (per-month) | Annual total | Max sites | Optimization runs/mo |
|---|---|---|---|---|---|
| Starter | $19 | $15 | $180/yr | 1 | 200 |
| Pro | $49 | $39 | $468/yr | 5 | 1,000 |
| Agency | $79 | $63 | $756/yr | 10 | 2,000 |
| Enterprise | $299 | custom | custom | 100 | 10,000 |

Create Polar prices to match (annual = one recurring yearly price of the annual total).

### 3.2 Create products — naming matters

Product resolution order at checkout (see `productForServer` in `billing.ts`):

1. **Env vars** `POLAR_PRODUCT_{PLAN}_{MONTHLY|ANNUAL}` on `wpinstant-api` (highest priority)
2. **Static map** (only Starter is hardcoded: prod UUIDs `ca0c63de-…` monthly / `3907e862-…` annual)
3. **Catalog auto-resolution** — lists your live Polar products and matches by name:
   - name must **contain the plan keyword**: `starter` / `pro` / `agency` / `enterprise`
   - name must contain `monthly` (or no interval word) vs `annual`/`yearly`/`year`

**Recommended product names** (guarantees auto-resolution works with zero env config):

| Product name | Recurring price |
|---|---|
| `WP Instant Starter Monthly` | $19 / month |
| `WP Instant Starter Annual` | $180 / year |
| `WP Instant Pro Monthly` | $49 / month |
| `WP Instant Pro Annual` | $468 / year |
| `WP Instant Agency Monthly` | $79 / month |
| `WP Instant Agency Annual` | $756 / year |
| `WP Instant Enterprise Monthly` | $299 / month |
| `WP Instant Enterprise Annual` | your choice / year |

Enterprise is advertised as "custom" in the UI — either create the $299 product or leave it out and handle those customers manually.

### 3.3 Pin product IDs via env vars (optional but recommended)

After creating products, copy each product ID (UUID) from the Polar dashboard and pin it.
Vars are plaintext and product IDs are not secrets, so they go in `wrangler.jsonc`:

```jsonc
"vars": {
  "POLAR_PRODUCT_STARTER_MONTHLY": "<uuid>",
  "POLAR_PRODUCT_STARTER_ANNUAL": "<uuid>",
  "POLAR_PRODUCT_PRO_MONTHLY": "<uuid>",
  "POLAR_PRODUCT_PRO_ANNUAL": "<uuid>",
  "POLAR_PRODUCT_AGENCY_MONTHLY": "<uuid>",
  "POLAR_PRODUCT_AGENCY_ANNUAL": "<uuid>",
  "POLAR_PRODUCT_ENTERPRISE_MONTHLY": "<uuid>",
  "POLAR_PRODUCT_ENTERPRISE_ANNUAL": "<uuid>",
  ...
}
```

Only set the ones you've created — unset vars simply fall through to the next resolution step. Then `npx wrangler deploy` from `packages/edge-api`.

(The dashboard's client-side `POLAR_PRODUCT_IDS` map is **advisory only** — the API always resolves the authoritative product server-side. It can be aligned via `NEXT_PUBLIC_POLAR_PRODUCT_*` build-time envs, but is not required.)

### 3.4 Polar secrets

From Polar → **Settings → Polar for SaaS / API**:

| Secret | Where | Name |
|---|---|---|
| Production org **access token** | `wpinstant-api` (secret) | `POLAR_ACCESS_TOKEN` |
| Webhook **signing secret** | `wpinstant-api` (secret) | `POLAR_WEBHOOK_SECRET` |

```bash
cd packages/edge-api
npx wrangler secret put POLAR_ACCESS_TOKEN --name wpinstant-api
npx wrangler secret put POLAR_WEBHOOK_SECRET --name wpinstant-api
```

The checkout code auto-detects whether the token belongs to the sandbox or production org and retries on the right server (`withPolarServerRetry`). With a production token, all checkouts are live.

> Sandbox-only: if you want $0 test checkouts in the sandbox org, create a 100%-off discount and set var `POLAR_SANDBOX_DISCOUNT_ID` (plain var, `wrangler.jsonc`). Not needed for production.

### 3.5 Polar webhook

Polar dashboard → **Webhooks → Add Endpoint**:

- **URL:** `https://api.wpinstant.dev/api/v1/billing/polar-webhook`
- **Events:** `subscription.created`, `subscription.updated`, `subscription.active`, `subscription.canceled`, `subscription.revoked`
- Copy the signing secret → `POLAR_WEBHOOK_SECRET` (command above).

Semantics implemented: `canceled` keeps sites active until `current_period_end` (sweeper deactivates after); `revoked` deactivates immediately + purges auth KV.

---

## 4. Current placeholder secrets — replace before launch

These are set to `TODO_…` placeholder values on `wpinstant-api` right now. All four must be replaced with the commands above:

- [ ] `CLERK_SECRET_KEY` (wpinstant-api)
- [ ] `CLERK_WEBHOOK_SIGNING_SECRET` (wpinstant-api)
- [ ] `POLAR_ACCESS_TOKEN` (wpinstant-api)
- [ ] `POLAR_WEBHOOK_SECRET` (wpinstant-api)
- [ ] `CLERK_SECRET_KEY` (wpinstant-app) — **this is why the dashboard currently returns 500**
- [ ] Replace `pk_test_…` in both `wrangler.jsonc` files with `pk_live_…` and redeploy

Verify after setting (no restarts needed — next request picks them up):

```bash
curl -s https://api.wpinstant.dev/health
curl -s -o /dev/null -w "%{http_code}\n" https://wpinstant.dev/sign-in   # expect 200 once Clerk key set
```

---

## 5. Plugin zip (dashboard download + install)

The dashboard's "Download WP Plugin" button streams `plugin/wp-instant.zip` from R2 via
`https://api.wpinstant.dev/api/v1/assets/plugin/download` (also reachable on the CDN host).

Rebuild + upload after plugin changes:

```bash
bash packages/wp-plugin/build-zip.sh
# → writes packages/wp-plugin/wp-instant-<version>.zip  (version read from wp-instant.php header)

cd packages/edge-api
npx wrangler r2 object put wpinstant-assets/plugin/wp-instant.zip \
  --file ../wp-plugin/wp-instant-<version>.zip --remote --content-type application/zip
```

`--remote` is required — without it wrangler targets a local simulator and the real bucket is untouched.

---

## 6. Deploy quick reference

```bash
# API worker (api.wpinstant.dev + cdn.wpinstant.dev)
cd packages/edge-api && npx wrangler deploy

# Dashboard (wpinstant.dev) — full rebuild required when NEXT_PUBLIC_* vars change
cd packages/saas-app && npm run build && npx wrangler deploy

# D1 migrations (if you add one)
cd packages/edge-api && npx wrangler d1 migrations apply wpinstant-db --remote
```

---

## 7. Go-live checklist

1. **Deploy both workers** (custom domains attach at deploy time; zone is already active):
   ```bash
   cd packages/edge-api && npx wrangler deploy    # api.wpinstant.dev + cdn.wpinstant.dev
   cd ../saas-app && npm run build:worker && npx wrangler deploy   # wpinstant.dev (homepage + /dashboard)
   ```
2. Clerk production instance created; keys set per §2; webhook + domains configured
3. Polar products created (names per §3.2 or IDs pinned per §3.3); secrets set per §3.4; webhook per §3.5
4. `pk_live_` baked into both `wrangler.jsonc`; **dashboard rebuilt + redeployed**
5. `https://wpinstant.dev` (homepage) and `https://wpinstant.dev/dashboard` (portal) load; sign-in works
6. Dashboard → Connect a site → install plugin from the zip → pairing handshake completes
7. Run an optimization job end-to-end; verify media URLs point at `cdn.wpinstant.dev`
8. Test checkout for each plan in production
9. Optionally redirect the retired `app.wpinstant.dev` → `wpinstant.dev` (redirect rule on the zone)
10. Delete legacy `turbopress-*` resources (workers `turbopress`, `turbopress-edge-api`, D1 `turbopress-db`, KV, R2 bucket, both queues) once verified
