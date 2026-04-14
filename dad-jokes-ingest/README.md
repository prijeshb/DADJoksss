# dad-jokes-ingest

Python scraper + ingestion pipeline for DADjoksss.

Scrapes public web pages for dad jokes, extracts Q&A pairs, normalizes them, and writes joke candidates into Supabase for review in the dashboard.

## Architecture

```
sources.py      — source registry (which pages to scrape)
scraper.py      — HTTP fetch + HTML → plain text
extractor.py    — regex patterns: extract (question, answer) pairs
normalizer.py   — language detect, category, difficulty, content hash, wrong answers
supabase_client.py — Supabase REST API: ingest_runs, ingest_source_items, joke_candidates
pipeline.py     — orchestrates the above per-source
cli.py          — CLI entrypoint
import_raw.py   — one-shot importer for jokes_raw.txt (manual seed)
```

Candidates land in `joke_candidates` with `review_status = 'pending'`.  
Review and promote them from the dashboard at `/dashboard` → Candidates tab.

## Setup

```bash
# 1. Create a virtual environment
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate

# 2. Install
pip install -e ".[dev]"

# 3. Configure
cp .env.example .env
# Edit .env — set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
```

## Run the scraper

```bash
# Dry run — extract but don't write to DB
dadjokes-ingest --dry-run

# Real run
dadjokes-ingest

# Custom sources file
dadjokes-ingest --sources-file sources.example.json

# Specific source IDs only
dadjokes-ingest --source-ids ig-bekarobar,web-punoftheday

# JSON output (useful for piping)
dadjokes-ingest --dry-run --json
```

## Import jokes_raw.txt

Seed Supabase candidates from the existing `jokes_raw.txt` in dad-jokes-web:

```bash
python import_raw.py --file ../dad-jokes-web/jokes_raw.txt
# or dry run:
python import_raw.py --file ../dad-jokes-web/jokes_raw.txt --dry-run
```

## Run tests

```bash
pytest
pytest -v          # verbose
pytest --tb=short  # compact tracebacks
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Service role key (bypasses RLS) |
| `SCRAPE_SOURCES_JSON` | No | JSON array of sources (overrides defaults) |
| `INGEST_SOURCE_IDS` | No | Comma-separated IDs to run |
| `INGEST_MAX_CANDIDATES` | No | Max candidates per source (default 40) |
| `INGEST_DRY_RUN` | No | Set to `true` to skip DB writes |

## Adding sources

Edit `SCRAPE_SOURCES_JSON` in your `.env`:

```json
[
  {
    "id": "web-my-source",
    "platform": "web",
    "handle": "mysite",
    "url": "https://mysite.com/jokes",
    "language_hint": "english",
    "priority": "high",
    "fetch_mode": "public_text"
  }
]
```

Or pass `--sources-file sources.json` on the CLI.

## Scheduling

Run on a cron (e.g. every 2 days):

```
0 6 */2 * * cd /path/to/dad-jokes-ingest && .venv/bin/dadjokes-ingest >> /var/log/dadjokes-ingest.log 2>&1
```

Or trigger the Next.js API route from a Vercel cron:
```
GET /api/ingest/run?manual=true
Header: x-ingest-secret: <INGEST_CRON_SECRET>
```
