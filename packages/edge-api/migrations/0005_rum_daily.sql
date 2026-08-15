-- Migration: 0005_rum_daily
-- Daily per-mode Core Web Vitals + JS error rollups pushed by the plugin's
-- hourly RUM heartbeat (beacon buckets live in cache/turbopress/{host}/rum.json).
CREATE TABLE IF NOT EXISTS rum_daily (
  site_id TEXT NOT NULL,
  day TEXT NOT NULL,
  mode TEXT NOT NULL,
  pageviews INTEGER NOT NULL DEFAULT 0,
  errors INTEGER NOT NULL DEFAULT 0,
  lcp_p75_ms INTEGER,
  cls_p75 REAL,
  error_pages_json TEXT,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (site_id, day, mode)
);
