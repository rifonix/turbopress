-- Migration 0007: normalized billing, Clerk organization scope, and usage ledgers.
-- New ownership columns remain nullable so existing user-owned installations can
-- be migrated when their next authenticated organization request arrives.
ALTER TABLE subscriptions ADD COLUMN organization_id TEXT;
ALTER TABLE subscriptions ADD COLUMN polar_product_id TEXT;
ALTER TABLE subscriptions ADD COLUMN billing_interval TEXT NOT NULL DEFAULT 'monthly'
  CHECK (billing_interval IN ('monthly', 'annual'));
ALTER TABLE subscriptions ADD COLUMN current_period_start INTEGER;
ALTER TABLE subscriptions ADD COLUMN overage_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE subscriptions ADD COLUMN overage_limit_credits INTEGER NOT NULL DEFAULT 0;

ALTER TABLE sites ADD COLUMN organization_id TEXT;
ALTER TABLE optimization_jobs ADD COLUMN priority TEXT NOT NULL DEFAULT 'normal'
  CHECK (priority IN ('high', 'normal', 'low'));
ALTER TABLE optimization_jobs ADD COLUMN credit_reservation_id TEXT;

ALTER TABLE rum_daily ADD COLUMN transfer_bytes INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS organization_profiles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT 'WP Instant workspace',
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS usage_periods (
  id TEXT PRIMARY KEY,
  subscription_id TEXT NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  organization_id TEXT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  period_start INTEGER NOT NULL,
  period_end INTEGER NOT NULL,
  credit_limit INTEGER NOT NULL,
  credits_reserved INTEGER NOT NULL DEFAULT 0,
  credits_used INTEGER NOT NULL DEFAULT 0,
  pageview_limit INTEGER NOT NULL,
  pageviews_used INTEGER NOT NULL DEFAULT 0,
  byte_limit INTEGER NOT NULL,
  bytes_used INTEGER NOT NULL DEFAULT 0,
  overage_enabled INTEGER NOT NULL DEFAULT 0,
  overage_limit_credits INTEGER NOT NULL DEFAULT 0,
  overage_credits_reserved INTEGER NOT NULL DEFAULT 0,
  overage_credits_used INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(subscription_id, period_start)
);

CREATE TABLE IF NOT EXISTS optimization_credit_reservations (
  id TEXT PRIMARY KEY,
  run_key TEXT NOT NULL UNIQUE,
  job_id TEXT NOT NULL,
  subscription_id TEXT NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  usage_period_id TEXT NOT NULL REFERENCES usage_periods(id) ON DELETE CASCADE,
  units INTEGER NOT NULL CHECK (units > 0),
  is_overage INTEGER NOT NULL DEFAULT 0,
  state TEXT NOT NULL CHECK (state IN ('pending', 'reserved', 'consumed', 'released')),
  source TEXT NOT NULL DEFAULT 'manual',
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_organization_status
  ON subscriptions (organization_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sites_organization_id ON sites (organization_id);
CREATE INDEX IF NOT EXISTS idx_usage_periods_subscription ON usage_periods (subscription_id, period_start DESC);
CREATE INDEX IF NOT EXISTS idx_credit_reservations_job ON optimization_credit_reservations (job_id, state);
