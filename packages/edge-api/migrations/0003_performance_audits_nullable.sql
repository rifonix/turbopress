-- Migration: 0003_performance_audits_nullable.sql
-- The original schema declared all metric columns NOT NULL, but some metrics
-- (e.g. INP/fid) are not measured and must be stored as NULL. Also adds the
-- real TTFB metric captured by the extractor and a (site, device, time) index.
-- Safe to recreate: table is written only by the queue consumer (empty on launch).

DROP TABLE IF EXISTS performance_audits;

CREATE TABLE performance_audits (
    id TEXT PRIMARY KEY,
    site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    device TEXT NOT NULL CHECK(device IN ('mobile', 'desktop')),
    performance_score REAL,
    lcp_ms REAL,
    fid_inp_ms REAL,
    cls_score REAL,
    fcp_ms REAL,
    ttfb_ms REAL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_audits_site_device_created
    ON performance_audits(site_id, device, created_at DESC);
