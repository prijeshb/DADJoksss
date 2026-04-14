-- =============================================================
-- DADjoksss - Schema Migration Smoke Test
-- =============================================================
-- Run this after applying docs/schema-migration.sql
-- The script wraps checks in a transaction and rolls back at the end.
-- =============================================================

BEGIN;

DO $$
DECLARE
  run_id TEXT;
  source_id TEXT;
  item_id TEXT;
  candidate_id TEXT;
  promoted_id BIGINT;
  correct_option_text TEXT;
  option_count INTEGER;
  tag_count INTEGER;
BEGIN
  INSERT INTO ingest_runs (trigger_type, status, source_scope)
  VALUES ('manual', 'running', 'smoke-test')
  RETURNING id INTO run_id;

  INSERT INTO ingest_sources (platform, handle, source_url, language_hint)
  VALUES ('instagram', 'bekarobar', 'https://example.com/bekarobar', 'mixed')
  RETURNING id INTO source_id;

  INSERT INTO ingest_source_items (
    ingest_run_id,
    ingest_source_id,
    platform_item_id,
    source_url,
    content_type,
    title,
    caption
  )
  VALUES (
    run_id,
    source_id,
    'post-001',
    'https://example.com/bekarobar/post-001',
    'post',
    'Smoke test source item',
    'Why do Indian dads carry ladders? To reach new heights in life!'
  )
  RETURNING id INTO item_id;

  INSERT INTO joke_candidates (
    ingest_run_id,
    ingest_source_id,
    ingest_source_item_id,
    question,
    answer,
    language,
    category,
    difficulty,
    wrong_answers,
    tags,
    review_status,
    content_hash,
    source_platform,
    source_handle,
    source_url,
    transcript_snippet
  )
  VALUES (
    run_id,
    source_id,
    item_id,
    'Why do Indian dads carry ladders?',
    'To reach new heights in life!',
    'hinglish',
    'general',
    1,
    '["For painting", "Gym workout", "No idea"]'::jsonb,
    '["general", "desi", "classic"]'::jsonb,
    'pending',
    'smoke-test-hash-001',
    'instagram',
    'bekarobar',
    'https://example.com/bekarobar/post-001',
    'Why do Indian dads carry ladders? To reach new heights in life!'
  )
  RETURNING id INTO candidate_id;

  SELECT fn_promote_joke_candidate(candidate_id) INTO promoted_id;

  IF promoted_id IS NULL THEN
    RAISE EXCEPTION 'promotion did not return a joke id';
  END IF;

  SELECT COUNT(*) INTO option_count
  FROM joke_options
  WHERE joke_id = promoted_id;

  IF option_count <> 4 THEN
    RAISE EXCEPTION 'expected 4 options, got %', option_count;
  END IF;

  SELECT COUNT(*) INTO tag_count
  FROM joke_tags
  WHERE joke_id = promoted_id;

  IF tag_count <> 3 THEN
    RAISE EXCEPTION 'expected 3 tags, got %', tag_count;
  END IF;

  UPDATE jokes
  SET answer = 'To climb the career ladder!'
  WHERE id = promoted_id;

  SELECT text INTO correct_option_text
  FROM joke_options
  WHERE joke_id = promoted_id AND is_correct = TRUE;

  IF correct_option_text <> 'To climb the career ladder!' THEN
    RAISE EXCEPTION
      'correct option sync failed, expected updated answer but got %',
      correct_option_text;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM joke_candidates
    WHERE id = candidate_id
      AND review_status = 'promoted'
      AND promoted_joke_id = promoted_id
  ) THEN
    RAISE EXCEPTION 'candidate promotion metadata was not updated';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM joke_provenance
    WHERE joke_id = promoted_id
      AND ingest_source_item_id = item_id
  ) THEN
    RAISE EXCEPTION 'joke provenance row missing after promotion';
  END IF;
END;
$$;

ROLLBACK;
