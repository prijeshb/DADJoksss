-- =============================================================
-- DADjoksss - Joke Ingestion Pipeline Schema Migration
-- =============================================================
-- Apply in Supabase SQL Editor (or supabase db push)
-- Safe to run top-to-bottom on a fresh project.
-- =============================================================


-- =============================================================
-- CATEGORIES lookup table (replaces CHECK constraint on jokes)
-- Adding a new category = INSERT row, no migration needed.
-- =============================================================
CREATE TABLE categories (
  name TEXT PRIMARY KEY
);

INSERT INTO categories (name) VALUES
  ('pun'),
  ('wordplay'),
  ('classic'),
  ('science'),
  ('food'),
  ('animal'),
  ('tech'),
  ('general'),
  ('adult');


-- =============================================================
-- JOKES (core production content)
--
-- content_hash strategy:
--   SHA-256( lower(trim(question)) + "|" + language )
--   Rationale: hashing question+language catches same joke
--   re-fetched from different sources. Including answer would
--   allow trivially-reworded duplicates to bypass dedup.
--   Deliberately excludes wrong answers - they are mutable.
-- =============================================================
CREATE TABLE jokes (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  question     TEXT NOT NULL,
  answer       TEXT NOT NULL,
  language     TEXT NOT NULL CHECK (language IN ('english', 'hinglish')),
  category     TEXT NOT NULL REFERENCES categories(name),
  source       TEXT,
  difficulty   SMALLINT NOT NULL CHECK (difficulty IN (1, 2, 3)),
  featured     BOOLEAN NOT NULL DEFAULT FALSE,
  status       TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'approved', 'rejected')),
  content_hash TEXT NOT NULL UNIQUE,
  is_deleted   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- =============================================================
-- JOKE TAGS (normalized, lowercase enforced at DB level)
-- =============================================================
CREATE TABLE joke_tags (
  joke_id BIGINT NOT NULL REFERENCES jokes(id) ON DELETE CASCADE,
  tag     TEXT NOT NULL
            CHECK (char_length(tag) BETWEEN 1 AND 50)
            CHECK (tag = lower(tag)),
  PRIMARY KEY (joke_id, tag)
);


-- =============================================================
-- JOKE OPTIONS (quiz presentation layer)
--
-- Constraints:
--   uq_joke_one_correct   - exactly one is_correct = TRUE per joke
--   uq_joke_options_order - no two options share the same display_order
--   trg_joke_options_max  - hard cap of 4 options per joke
--   Canonical answer lives on jokes.answer; the correct option mirrors it
-- =============================================================
CREATE TABLE joke_options (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  joke_id       BIGINT NOT NULL REFERENCES jokes(id) ON DELETE CASCADE,
  text          TEXT NOT NULL,
  is_correct    BOOLEAN NOT NULL DEFAULT FALSE,
  display_order SMALLINT NOT NULL CHECK (display_order BETWEEN 0 AND 3)
);

CREATE UNIQUE INDEX uq_joke_one_correct
  ON joke_options (joke_id) WHERE is_correct = TRUE;

CREATE UNIQUE INDEX uq_joke_options_order
  ON joke_options (joke_id, display_order);

CREATE UNIQUE INDEX uq_joke_options_text
  ON joke_options (joke_id, text);


-- =============================================================
-- JOKE STATS (counters + metrics, 1:1 with jokes)
-- Auto-created on joke insert via trg_jokes_create_stats.
-- engagement_score is computed on read (see joke_stats_computed view).
-- =============================================================
CREATE TABLE joke_stats (
  joke_id          BIGINT PRIMARY KEY REFERENCES jokes(id) ON DELETE CASCADE,
  likes            INTEGER NOT NULL DEFAULT 0 CHECK (likes >= 0),
  shares           INTEGER NOT NULL DEFAULT 0 CHECK (shares >= 0),
  impressions      INTEGER NOT NULL DEFAULT 0 CHECK (impressions >= 0),
  correct_answers  INTEGER NOT NULL DEFAULT 0 CHECK (correct_answers >= 0),
  wrong_answers    INTEGER NOT NULL DEFAULT 0 CHECK (wrong_answers >= 0),
  avg_time_on_card NUMERIC(6,2) NOT NULL DEFAULT 0 CHECK (avg_time_on_card >= 0),
  skip_rate        NUMERIC(4,3) NOT NULL DEFAULT 0 CHECK (skip_rate BETWEEN 0 AND 1),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- =============================================================
-- VIEWS
-- =============================================================

CREATE VIEW active_jokes AS
  SELECT * FROM jokes
  WHERE is_deleted = FALSE AND status = 'approved';

CREATE VIEW joke_stats_computed AS
  SELECT *,
    ROUND(
      (likes * 2.0 + shares * 3.0) / NULLIF(impressions, 0) * 100,
      2
    ) AS engagement_score
  FROM joke_stats;


-- =============================================================
-- FUNCTIONS
-- =============================================================

CREATE OR REPLACE FUNCTION fn_create_joke_stats()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO joke_stats (joke_id) VALUES (NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION fn_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION fn_sync_correct_option_with_answer()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE joke_options
  SET text = NEW.answer
  WHERE joke_id = NEW.id AND is_correct = TRUE;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION fn_validate_options_count()
RETURNS TRIGGER AS $$
DECLARE
  opt_count INTEGER;
  canonical_answer TEXT;
BEGIN
  SELECT answer INTO canonical_answer
  FROM jokes
  WHERE id = NEW.joke_id;

  IF canonical_answer IS NULL THEN
    RAISE EXCEPTION 'joke % does not exist', NEW.joke_id;
  END IF;

  IF TG_OP = 'INSERT' THEN
    SELECT COUNT(*) INTO opt_count
    FROM joke_options
    WHERE joke_id = NEW.joke_id;

    IF opt_count >= 4 THEN
      RAISE EXCEPTION
        'joke % already has 4 options - cannot insert more', NEW.joke_id;
    END IF;
  END IF;

  IF NEW.is_correct AND NEW.text <> canonical_answer THEN
    RAISE EXCEPTION
      'correct option text must match jokes.answer for joke %', NEW.joke_id;
  END IF;

  IF NOT NEW.is_correct AND NEW.text = canonical_answer THEN
    RAISE EXCEPTION
      'wrong option text cannot equal jokes.answer for joke %', NEW.joke_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION fn_validate_pending_limit()
RETURNS TRIGGER AS $$
DECLARE
  pending_count INTEGER;
BEGIN
  IF NEW.status = 'pending' THEN
    SELECT COUNT(*) INTO pending_count
    FROM jokes
    WHERE status = 'pending' AND is_deleted = FALSE;

    IF pending_count >= 100 THEN
      RAISE EXCEPTION
        'Pending joke limit reached (100). Review and approve/reject existing pending jokes before ingesting more.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- =============================================================
-- TRIGGERS
-- =============================================================

CREATE TRIGGER trg_jokes_create_stats
  AFTER INSERT ON jokes
  FOR EACH ROW EXECUTE FUNCTION fn_create_joke_stats();

CREATE TRIGGER trg_jokes_updated_at
  BEFORE UPDATE ON jokes
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE TRIGGER trg_joke_stats_updated_at
  BEFORE UPDATE ON joke_stats
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE TRIGGER trg_jokes_sync_correct_option
  AFTER UPDATE OF answer ON jokes
  FOR EACH ROW
  WHEN (OLD.answer IS DISTINCT FROM NEW.answer)
  EXECUTE FUNCTION fn_sync_correct_option_with_answer();

CREATE TRIGGER trg_joke_options_max
  BEFORE INSERT ON joke_options
  FOR EACH ROW EXECUTE FUNCTION fn_validate_options_count();

CREATE TRIGGER trg_joke_options_validate_update
  BEFORE UPDATE ON joke_options
  FOR EACH ROW EXECUTE FUNCTION fn_validate_options_count();

CREATE TRIGGER trg_jokes_pending_limit
  BEFORE INSERT ON jokes
  FOR EACH ROW EXECUTE FUNCTION fn_validate_pending_limit();


-- =============================================================
-- INGESTION TABLES
-- Separate staging/provenance layer for scraper output
-- =============================================================

CREATE TABLE ingest_runs (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('manual', 'scheduled', 'reprocess')),
  status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed', 'partial')),
  source_scope TEXT NOT NULL DEFAULT 'all',
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  items_discovered INTEGER NOT NULL DEFAULT 0 CHECK (items_discovered >= 0),
  candidates_extracted INTEGER NOT NULL DEFAULT 0 CHECK (candidates_extracted >= 0),
  candidates_inserted INTEGER NOT NULL DEFAULT 0 CHECK (candidates_inserted >= 0),
  duplicates_skipped INTEGER NOT NULL DEFAULT 0 CHECK (duplicates_skipped >= 0),
  error TEXT
);

CREATE TABLE ingest_sources (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  platform TEXT NOT NULL CHECK (platform IN ('instagram', 'youtube', 'x', 'reddit', 'web', 'other')),
  handle TEXT NOT NULL,
  source_url TEXT NOT NULL,
  language_hint TEXT CHECK (language_hint IN ('english', 'hinglish', 'mixed')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('high', 'medium', 'low')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'disabled')),
  fetch_mode TEXT NOT NULL DEFAULT 'public_text'
    CHECK (fetch_mode IN ('public_text', 'transcript', 'manual_import', 'api')),
  last_fetched_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE ingest_source_items (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  ingest_run_id TEXT REFERENCES ingest_runs(id) ON DELETE SET NULL,
  ingest_source_id TEXT NOT NULL REFERENCES ingest_sources(id) ON DELETE CASCADE,
  platform_item_id TEXT NOT NULL,
  source_url TEXT NOT NULL,
  content_type TEXT NOT NULL
    CHECK (content_type IN ('post', 'reel', 'video', 'short', 'tweet', 'article', 'other')),
  title TEXT,
  caption TEXT,
  transcript_snippet TEXT,
  content_hash TEXT,
  discovered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  processing_status TEXT NOT NULL DEFAULT 'discovered'
    CHECK (processing_status IN ('discovered', 'processed', 'failed', 'skipped')),
  error TEXT,
  UNIQUE (ingest_source_id, platform_item_id)
);

CREATE TABLE joke_candidates (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  ingest_run_id TEXT REFERENCES ingest_runs(id) ON DELETE SET NULL,
  ingest_source_id TEXT REFERENCES ingest_sources(id) ON DELETE SET NULL,
  ingest_source_item_id TEXT REFERENCES ingest_source_items(id) ON DELETE SET NULL,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  language TEXT NOT NULL CHECK (language IN ('english', 'hinglish')),
  category TEXT NOT NULL REFERENCES categories(name),
  difficulty SMALLINT NOT NULL CHECK (difficulty IN (1, 2, 3)),
  wrong_answers JSONB NOT NULL DEFAULT '[]'::JSONB,
  tags JSONB NOT NULL DEFAULT '[]'::JSONB,
  review_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (review_status IN ('pending', 'approved', 'rejected', 'promoted')),
  review_notes TEXT,
  content_hash TEXT NOT NULL,
  source_platform TEXT NOT NULL CHECK (source_platform IN ('instagram', 'youtube', 'x', 'reddit', 'web', 'other')),
  source_handle TEXT,
  source_url TEXT NOT NULL,
  transcript_snippet TEXT,
  promoted_joke_id BIGINT REFERENCES jokes(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE joke_provenance (
  joke_id BIGINT PRIMARY KEY REFERENCES jokes(id) ON DELETE CASCADE,
  ingest_run_id TEXT REFERENCES ingest_runs(id) ON DELETE SET NULL,
  ingest_source_id TEXT REFERENCES ingest_sources(id) ON DELETE SET NULL,
  ingest_source_item_id TEXT REFERENCES ingest_source_items(id) ON DELETE SET NULL,
  source_platform TEXT NOT NULL CHECK (source_platform IN ('instagram', 'youtube', 'x', 'reddit', 'web', 'other')),
  source_handle TEXT,
  source_url TEXT NOT NULL,
  transcript_snippet TEXT,
  extraction_method TEXT NOT NULL DEFAULT 'heuristic'
    CHECK (extraction_method IN ('heuristic', 'manual', 'llm', 'api')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_ingest_sources_updated_at
  BEFORE UPDATE ON ingest_sources
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE TRIGGER trg_joke_candidates_updated_at
  BEFORE UPDATE ON joke_candidates
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();


-- =============================================================
-- APPROVAL / PROMOTION
-- Promote an edited candidate into the production joke tables
-- in one transaction and keep provenance attached.
-- =============================================================
CREATE OR REPLACE FUNCTION fn_promote_joke_candidate(p_candidate_id TEXT)
RETURNS BIGINT AS $$
DECLARE
  candidate_record joke_candidates%ROWTYPE;
  new_joke_id BIGINT;
  wrong_answer TEXT;
  wrong_index INTEGER := 1;
BEGIN
  SELECT *
  INTO candidate_record
  FROM joke_candidates
  WHERE id = p_candidate_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'joke candidate % not found', p_candidate_id;
  END IF;

  IF candidate_record.review_status NOT IN ('pending', 'approved') THEN
    RAISE EXCEPTION
      'joke candidate % cannot be promoted from status %',
      p_candidate_id,
      candidate_record.review_status;
  END IF;

  IF jsonb_typeof(candidate_record.wrong_answers) <> 'array'
     OR jsonb_array_length(candidate_record.wrong_answers) <> 3 THEN
    RAISE EXCEPTION
      'joke candidate % must contain exactly 3 wrong answers',
      p_candidate_id;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jokes
    WHERE content_hash = candidate_record.content_hash
  ) THEN
    RAISE EXCEPTION
      'a joke with content_hash % already exists',
      candidate_record.content_hash;
  END IF;

  INSERT INTO jokes (
    question,
    answer,
    language,
    category,
    source,
    difficulty,
    featured,
    status,
    content_hash
  )
  VALUES (
    candidate_record.question,
    candidate_record.answer,
    candidate_record.language,
    candidate_record.category,
    candidate_record.source_platform || ':' || COALESCE(candidate_record.source_handle, 'unknown'),
    candidate_record.difficulty,
    FALSE,
    'approved',
    candidate_record.content_hash
  )
  RETURNING id INTO new_joke_id;

  INSERT INTO joke_options (joke_id, text, is_correct, display_order)
  VALUES (new_joke_id, candidate_record.answer, TRUE, 0);

  FOR wrong_answer IN
    SELECT value
    FROM jsonb_array_elements_text(candidate_record.wrong_answers)
  LOOP
    IF wrong_answer = candidate_record.answer THEN
      RAISE EXCEPTION
        'wrong answer cannot match canonical answer for candidate %',
        p_candidate_id;
    END IF;

    INSERT INTO joke_options (joke_id, text, is_correct, display_order)
    VALUES (new_joke_id, wrong_answer, FALSE, wrong_index);

    wrong_index := wrong_index + 1;
  END LOOP;

  INSERT INTO joke_tags (joke_id, tag)
  SELECT new_joke_id, value
  FROM jsonb_array_elements_text(candidate_record.tags)
  ON CONFLICT DO NOTHING;

  INSERT INTO joke_provenance (
    joke_id,
    ingest_run_id,
    ingest_source_id,
    ingest_source_item_id,
    source_platform,
    source_handle,
    source_url,
    transcript_snippet,
    extraction_method
  )
  VALUES (
    new_joke_id,
    candidate_record.ingest_run_id,
    candidate_record.ingest_source_id,
    candidate_record.ingest_source_item_id,
    candidate_record.source_platform,
    candidate_record.source_handle,
    candidate_record.source_url,
    candidate_record.transcript_snippet,
    'manual'
  );

  UPDATE joke_candidates
  SET
    review_status = 'promoted',
    promoted_joke_id = new_joke_id
  WHERE id = p_candidate_id;

  RETURN new_joke_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION fn_reject_joke_candidate(
  p_candidate_id TEXT,
  p_review_notes TEXT DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
  UPDATE joke_candidates
  SET
    review_status = 'rejected',
    review_notes = p_review_notes
  WHERE id = p_candidate_id
    AND review_status IN ('pending', 'approved');

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'joke candidate % not found or cannot be rejected from its current status',
      p_candidate_id;
  END IF;
END;
$$ LANGUAGE plpgsql;


-- =============================================================
-- INDEXES
-- =============================================================
CREATE INDEX idx_jokes_status
  ON jokes (status) WHERE is_deleted = FALSE;

CREATE INDEX idx_jokes_language
  ON jokes (language) WHERE is_deleted = FALSE AND status = 'approved';

CREATE INDEX idx_jokes_featured
  ON jokes (featured) WHERE featured = TRUE AND is_deleted = FALSE;

CREATE INDEX idx_joke_tags_tag
  ON joke_tags (tag);

CREATE INDEX idx_joke_stats_likes
  ON joke_stats (likes DESC);

CREATE INDEX idx_joke_stats_shares
  ON joke_stats (shares DESC);

CREATE INDEX idx_ingest_runs_status
  ON ingest_runs (status);

CREATE INDEX idx_ingest_runs_started_at
  ON ingest_runs (started_at DESC);

CREATE INDEX idx_ingest_sources_status
  ON ingest_sources (status);

CREATE INDEX idx_ingest_source_items_run
  ON ingest_source_items (ingest_run_id);

CREATE INDEX idx_ingest_source_items_status
  ON ingest_source_items (processing_status);

CREATE INDEX idx_joke_candidates_review_status
  ON joke_candidates (review_status);

CREATE INDEX idx_joke_candidates_source_item
  ON joke_candidates (ingest_source_item_id);

CREATE INDEX idx_joke_candidates_content_hash
  ON joke_candidates (content_hash);

CREATE INDEX idx_joke_provenance_source_platform
  ON joke_provenance (source_platform);

CREATE INDEX idx_joke_provenance_ingest_run
  ON joke_provenance (ingest_run_id);


-- =============================================================
-- SEED: migrate static jokes.ts data
-- Run this after populating jokes/joke_options/joke_tags from
-- the application seed script (npm run db:seed).
-- Copies existing likes + shares from static data; zeros the rest.
-- =============================================================
-- (Seed script handled in src/scripts/seed.ts - not inline SQL)
