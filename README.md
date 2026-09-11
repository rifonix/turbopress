# ⚡ WP Instant (SpeedForge Engine)
> **High-Performance Zero-DNS WordPress Optimization SaaS & Client Engine**

WP Instant is a modern, fault-proof, zero-DNS WordPress performance optimization platform that automates **95+ Mobile PageSpeed / Core Web Vitals** scores across any WordPress theme and plugin setup.

---

## 🏛️ System Architecture

WP Instant consists of three primary tiers:

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                   SAAS CONTROL PLANE                                    │
│                                                                                         │
│  Next.js 15 (OpenNext + Clerk) ──► Hono Edge API (Cloudflare Worker) ──► Polar.sh       │
│                                                 │                                       │
│                                                 ▼                                       │
│                                      Cloudflare D1 + KV Store                           │
└─────────────────────────────────────────────────┬───────────────────────────────────────┘
                                                  │
                                         REST API / Webhooks
                                                  │
┌─────────────────────────────────────────────────▼───────────────────────────────────────┐
│                                WORDPRESS CLIENT SITES                                   │
│                                                                                         │
│  WP Admin (1-Click OAuth Handshake) ◄───────────┘                                       │
│         │                                                                               │
│         ▼                                                                               │
│  advanced-cache.php (Sub-15ms TTFB) ──► DOM Transformer (Injects Critical CSS/JS Delay) │
│         │                                                                               │
│  (Trigger Page Save)                                                                    │
│         │                                                                               │
│         ▼ (Async Webhook)                                                               │
└─────────┼───────────────────────────────────────────────────────────────────────────────┘
          │
┌─────────▼───────────────────────────────────────────────────────────────────────────────┐
│                              EDGE OPTIMIZATION PIPELINE                                 │
│                                                                                         │
│  Cloudflare Queue ──► Browser Run (Puppeteer Headless) ──► Cloudflare R2 Storage        │
│                            • AST-Enriched Critical CSS          • WebP/AVIF Negotiation │
│                            • LCP & Font Auto-Detection          • Minified CSS/JS Cache │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## ☁️ Cloudflare Edge Bindings & Infrastructure

The edge API worker runs on Cloudflare Workers with native bindings provisioned via Wrangler:

| Resource | Binding Name | Cloudflare Target / ID | Purpose |
|---|---|---|---|
| **D1 SQL Database** | `DB` | `wpinstant-db` (`a6ffe36b-3e1a-46a2-895b-91693b1538e1`) | Users, Subscriptions, Sites, and Jobs relational store |
| **KV Namespace** | `KV` | `wpinstant-kv` (`5883ffa03f40476faf654faa8e531e48`) | Sub-3ms edge authorization & job status fast-path |
| **R2 Object Storage** | `ASSETS_BUCKET` | `wpinstant-assets` | Zero-egress storage for generated Critical CSS & media assets |
| **R2 Public Media CDN** | `PUBLIC_MEDIA_BUCKET` | `wpinstant-public-media` (`objects.wpinstant.dev`) | Content-addressed, immutable public media derivatives |
| **Queue Producer/Consumer**| `OPTIMIZATION_QUEUE` | `wpinstant-optimization-queue` | Background batch dispatch for Chromium Puppeteer tasks |
| **Dead-Letter Queue** | (consumer: `wpinstant-api`) | `wpinstant-dlq` | Terminal failure handling for exhausted optimization jobs |
| **Browser Rendering** | `BROWSER` | Cloudflare Browser Rendering | Headless Chromium instance pool for DOM & CSS analysis |

The dashboard runs as a separate OpenNext worker (`wpinstant-app` on `wpinstant.dev`); the API is `wpinstant-api` on `api.wpinstant.dev`.

---

## 💳 Polar.sh Billing & Webhooks Integration

Subscriptions, checkout flows, and customer portals are powered by the official `@polar-sh/sdk`:

* **Checkout Endpoint:** `POST /api/v1/billing/checkout` generates a hosted Polar checkout session.
* **Customer Portal:** `POST /api/v1/billing/portal` creates a direct link to manage active subscriptions and invoices.
* **Idempotent Webhook Engine:** `POST /api/v1/billing/polar-webhook` verifies signatures using `validateEvent` from `@polar-sh/sdk/webhooks` with 24-hour KV deduplication:
  - `subscription.created` / `subscription.updated` / `subscription.active`: updates site quotas in D1 and KV.
  - `subscription.canceled` / `subscription.revoked`: safely deactivates associated site seats.

---

## 🔐 Clerk Authentication

* The SaaS dashboard (`packages/saas-app`) integrates `@clerk/nextjs` with `<ClerkProvider>`, `<SignedIn>`, `<SignedOut>`, and `clerkMiddleware`.
* User session JWTs are cryptographically verified by the Edge API via RS256 JWKS public keys.

---

## 🚀 Key Innovations & Features

### 1. Deterministic 3-Tier Script Delayer & jQuery Queue
* **Tier 0 (Whitelisted/Instant):** Elementor runtime, Cookie Consent banners (Complianz, Cookiebot, OneTrust), and core layout scripts load immediately without delay.
* **Tier 1 (Defer):** Asynchronous non-blocking loading via `<script defer>`.
* **Tier 2 (Interaction-Delayed):** Injects a `<1.2KB` standalone micro-loader (`wp-instant-loader.min.js`) that stubs `$` and `jQuery()`, queues inline function calls, preserves original DOM execution order (`data-wpins-order`), and triggers on user interaction (`scroll`, `click`, `mousemove`, `touchstart`, `keydown`) or a configurable safety timer (3.5s).

### 2. AST-Enriched Critical CSS Extraction Pipeline
* Cloudflare Browser Rendering (Puppeteer) inspects DOM coverage and pairs it with AST post-processing.
* Preserves root CSS custom properties (`:root`, `html { --color... }`), critical `@font-face` typography, `@media` responsive queries, and automatically rebases relative asset URLs.
* Inlines critical rules in `<head>` while deferring full stylesheets with `<noscript>` fallbacks.

### 3. Dynamic Nonce & Cart Micro-Hydration
* Solves the notorious WordPress caching issue where form nonces expire after 12–24 hours (`403 Forbidden` / `-1` errors).
* Asynchronous `<800B` hydrator (`hydrator.min.js`) hits a specialized zero-bootstrap REST route (`/wp-json/wp-instant/v1/nonces`) to refresh form nonces and update WooCommerce cart badges in `<30ms`.

### 4. W3C Speculation Rules API Prerendering
* Injects native browser speculation rules for instantaneous `<50ms` link navigation on hover.
* Auto-excludes `wp-admin`, `cart`, `checkout`, `my-account`, logout URLs, and downloadable files.

### 5. 1-Click OAuth Handshake
* Seamless pairing between WordPress sites and the SaaS Control Plane using cryptographic state nonces and HMAC signatures.

---

## 🛠️ Quick Start & Local Development

### 1. Install Dependencies & Build
```bash
npm install
npm run build
```

### 2. Run Edge API Locally
```bash
npm run dev:edge
```

### 3. Run SaaS Dashboard Locally
```bash
npm run dev:saas
```

---

## 🚢 Deployment Guide

### A. Deploy Workers (Edge API + OpenNext dashboard)
```bash
# 1. Build shared library & Next.js worker bundle
npm run build

# 2. Set Secrets (Interactive Prompt)
cd packages/edge-api
npx wrangler secret put POLAR_ACCESS_TOKEN
npx wrangler secret put POLAR_WEBHOOK_SECRET
npx wrangler secret put CLERK_SECRET_KEY
npx wrangler secret put CLERK_WEBHOOK_SIGNING_SECRET

# 3. Deploy wpinstant-api Worker to Cloudflare
npx wrangler deploy
```

### C. Install WordPress Client Plugin
1. Copy `packages/wp-plugin` or download `wp-instant.zip`.
2. Upload to your WordPress site under **Plugins → Add New → Upload Plugin**.
3. Activate the plugin and navigate to **WP Instant** in the sidebar.
4. Click **1-Click Connect to WP Instant** to pair with the Edge Engine!

---

## 📊 Master Performance Presets

| Feature | Safe Mode | Aggressive | Ludicrous (Recommended) |
|---|:---:|:---:|:---:|
| **Drop-in Caching (`advanced-cache.php`)** | ✅ Sub-15ms | ✅ Sub-15ms | ✅ Sub-15ms |
| **Gzip / Brotli Pre-compression** | ✅ | ✅ | ✅ |
| **W3C Speculation Rules Prerender** | ✅ | ✅ | ✅ |
| **Edge Critical CSS Inlining** | ❌ | ✅ | ✅ |
| **Automatic LCP Priority Preload** | ❌ | ✅ | ✅ |
| **3-Tier Interaction-Delayed JS** | ❌ (Defer) | ❌ (Defer) | ✅ (Micro-Loader + Queue) |
| **Dynamic Nonce & Cart Hydration** | ❌ | ❌ | ✅ Sub-30ms |
| **Expected Mobile Lighthouse Score** | 80–88 | 90–94 | **96–100** |

---

## 🛡️ License
WP Instant is licensed under GPLv2 or later for the WordPress plugin, and MIT for the edge and shared packages.
