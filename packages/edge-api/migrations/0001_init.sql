-- Migration: 0001_init.sql
-- Turbopress Core Schema for Cloudflare D1

-- 1. Users (Synced from Clerk Webhooks / Auth)
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, -- Clerk User ID (user_2x...)
    email TEXT NOT NULL UNIQUE,
    polar_customer_id TEXT UNIQUE,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- 2. Subscriptions (Synced from Polar.sh Webhooks)
CREATE TABLE IF NOT EXISTS subscriptions (
    id TEXT PRIMARY KEY, -- Polar Subscription ID
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan_id TEXT NOT NULL,
    status TEXT NOT NULL, -- 'active', 'past_due', 'canceled', 'revoked', 'trialing'
    max_sites INTEGER NOT NULL DEFAULT 1,
    current_period_end INTEGER NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- 3. Connected Sites (WordPress instances)
CREATE TABLE IF NOT EXISTS sites (
    id TEXT PRIMARY KEY, -- site_uuid
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    subscription_id TEXT NOT NULL REFERENCES subscriptions(id),
    domain TEXT NOT NULL UNIQUE, -- Normalized domain: "example.com"
    site_api_key_hash TEXT NOT NULL UNIQUE, -- SHA-256 hash of sk_live_...
    config_json TEXT NOT NULL DEFAULT '{}',
    is_active INTEGER NOT NULL DEFAULT 1,
    wp_version TEXT,
    plugin_version TEXT,
    last_ping_at INTEGER,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- 4. Asynchronous Optimization Jobs (Critical CSS / LCP Pipeline)
CREATE TABLE IF NOT EXISTS optimization_jobs (
    id TEXT PRIMARY KEY, -- job_uuid
    site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    viewport TEXT NOT NULL CHECK(viewport IN ('mobile', 'desktop')),
    status TEXT NOT NULL CHECK(status IN ('queued', 'processing', 'completed', 'failed')),
    critical_css_r2_key TEXT,
    lcp_selector TEXT,
    lcp_image_url TEXT,
    error_message TEXT,
    attempts INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    completed_at INTEGER
);

-- 5. Performance Audits History (PageSpeed & Core Web Vitals)
CREATE TABLE IF NOT EXISTS performance_audits (
    id TEXT PRIMARY KEY,
    site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    device TEXT NOT NULL CHECK(device IN ('mobile', 'desktop')),
    performance_score INTEGER NOT NULL,
    lcp_ms REAL NOT NULL,
    fid_inp_ms REAL NOT NULL,
    cls_score REAL NOT NULL,
    fcp_ms REAL NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Indexes for ultra-fast query paths
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_sites_user_id ON sites(user_id);
CREATE INDEX IF NOT EXISTS idx_sites_domain ON sites(domain);
CREATE INDEX IF NOT EXISTS idx_sites_api_key_hash ON sites(site_api_key_hash);
CREATE INDEX IF NOT EXISTS idx_jobs_site_status ON optimization_jobs(site_id, status);
CREATE INDEX IF NOT EXISTS idx_audits_site_created ON performance_audits(site_id, created_at);
