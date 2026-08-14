# 🚀 Turbopress Production Deployment Guide

This guide outlines how to deploy the **Cloudflare Edge Pipeline**, **D1 Database**, **KV Cache**, **R2 Storage**, and **SaaS Web App**.

---

## 1. Cloudflare Infrastructure Provisioning

### A. Create Cloudflare D1 Database
```bash
npx wrangler d1 create turbopress-db
```
Update the `database_id` in `packages/edge-api/wrangler.jsonc`.

### B. Run D1 Database Migrations
```bash
cd packages/edge-api
npx wrangler d1 migrations apply turbopress-db --remote
```

### C. Create Cloudflare KV Namespace
```bash
npx wrangler kv:namespace create turbopress-kv
```
Update the `kv_namespaces` binding `id` in `packages/edge-api/wrangler.jsonc`.

### D. Create Cloudflare R2 Asset Bucket
```bash
npx wrangler r2 bucket create turbopress-assets
```

### E. Create Cloudflare Queue
```bash
npx wrangler queues create turbopress-optimization-queue
npx wrangler queues create turbopress-dlq
```

---

## 2. Deploy Edge API Worker (Hono)

### Set Environment Secrets
```bash
cd packages/edge-api
npx wrangler secret put POLAR_WEBHOOK_SECRET
npx wrangler secret put CLERK_SECRET_KEY
```

### Deploy to Cloudflare Network
```bash
npx wrangler deploy
```

---

## 3. Deploy SaaS Control Plane (Cloudflare Pages)

```bash
cd packages/saas-app
npm run build
npx wrangler pages deploy dist --project-name=turbopress-app
```

---

## 4. Configure Polar.sh Webhooks

1. Log into your **Polar.sh Dashboard**.
2. Navigate to **Settings → Webhooks → Add Webhook**.
3. Set the Webhook URL: `https://api.turbopress.io/api/v1/billing/polar-webhook`
4. Subscribe to the following events:
   - `subscription.created`
   - `subscription.updated`
   - `subscription.active`
   - `subscription.canceled`
   - `subscription.revoked`
5. Copy the generated secret and store it in Wrangler secrets (`POLAR_WEBHOOK_SECRET`).

---

## 5. WordPress Plugin Distribution

1. Compress the plugin directory:
   ```bash
   cd packages
   zip -r turbopress-optimizer.zip wp-plugin/
   ```
2. Distribute `turbopress-optimizer.zip` to WordPress administrators.
3. Install via **WordPress Admin → Plugins → Add New → Upload Plugin**.
