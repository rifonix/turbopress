-- Migration 0004: push-callback + health infrastructure
-- site_url: canonical WP home URL for optimization-callback pushes
-- callback_secret: per-site HMAC-SHA256 secret shared by the plugin during verify
-- health_json: latest plugin health report pushed via /api/v1/auth/heartbeat
ALTER TABLE sites ADD COLUMN site_url TEXT;
ALTER TABLE sites ADD COLUMN callback_secret TEXT;
ALTER TABLE sites ADD COLUMN health_json TEXT;
