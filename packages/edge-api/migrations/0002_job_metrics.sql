-- Migration 0002: track real critical CSS size + measured metrics on jobs
ALTER TABLE optimization_jobs ADD COLUMN critical_css_bytes INTEGER;
CREATE INDEX IF NOT EXISTS idx_optimization_jobs_site_url_viewport
  ON optimization_jobs (site_id, viewport, url, created_at DESC);
