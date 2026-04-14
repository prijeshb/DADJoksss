-- =============================================================
-- Patch 001 — add 'browser' to ingest_sources.fetch_mode check
-- =============================================================
-- Apply after schema-migration.sql if you are using
-- fetch_mode = 'browser' (Playwright) in the ingest pipeline.
-- =============================================================

ALTER TABLE ingest_sources
  DROP CONSTRAINT IF EXISTS ingest_sources_fetch_mode_check;

ALTER TABLE ingest_sources
  ADD CONSTRAINT ingest_sources_fetch_mode_check
    CHECK (fetch_mode IN ('public_text', 'transcript', 'manual_import', 'api', 'browser'));
