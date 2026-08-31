-- Migration 0006: allow 'needs_attention' as an optimization_jobs status.
--
-- The queue consumer marks challenge-blocked jobs 'needs_attention'
-- (queue-consumer.ts) but the 0001 CHECK constraint only allowed
-- ('queued','processing','completed','failed') — the UPDATE threw, the
-- message was never acked, and every challenge job burned all retries
-- into the DLQ. SQLite cannot ALTER a CHECK constraint, so the table is
-- rebuilt (create-new / copy / drop / rename), preserving 0002's
-- critical_css_bytes column and both indexes.

PRAGMA foreign_keys = OFF;

CREATE TABLE optimization_jobs_new (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  viewport TEXT NOT NULL CHECK(viewport IN ('mobile', 'desktop')),
  status TEXT NOT NULL CHECK(status IN ('queued', 'processing', 'completed', 'failed', 'needs_attention')),
  critical_css_r2_key TEXT,
  critical_css_bytes INTEGER,
  lcp_selector TEXT,
  lcp_image_url TEXT,
  error_message TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  completed_at INTEGER
);

INSERT INTO optimization_jobs_new (
  id, site_id, url, viewport, status, critical_css_r2_key, critical_css_bytes,
  lcp_selector, lcp_image_url, error_message, attempts, created_at, completed_at
)
SELECT
  id, site_id, url, viewport, status, critical_css_r2_key, critical_css_bytes,
  lcp_selector, lcp_image_url, error_message, attempts, created_at, completed_at
FROM optimization_jobs;

DROP TABLE optimization_jobs;
ALTER TABLE optimization_jobs_new RENAME TO optimization_jobs;

CREATE INDEX idx_jobs_site_status ON optimization_jobs(site_id, status);
CREATE INDEX idx_optimization_jobs_site_url_viewport ON optimization_jobs(site_id, url, viewport);

PRAGMA foreign_keys = ON;
