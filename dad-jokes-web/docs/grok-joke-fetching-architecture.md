# Free Joke Fetching Architecture (No Grok)

## Overview

This document replaces the Grok-based approach with a free/low-cost multi-source pipeline that can run on a manual trigger or a schedule every 1, 2, or 3 days.

Goal:
- Pull dad jokes from internet-friendly sources.
- Normalize and deduplicate into app schema.
- Keep moderation + quality checks before publishing.

## Existing Joke Schema (from `src/lib/types.ts`)

```typescript
interface DadJoke {
  id: string;
  question: string;
  answer: string;
  language: "english" | "hinglish";
  category: JokeCategory;
  wrongAnswers: string[];
  source?: string;
  difficulty: 1 | 2 | 3;
  tags: string[];
  featured?: boolean;
  likes?: number;
  shares?: number;
}
```

## Source Strategy (Free First)

Use sources with free access + clear terms first:
- Reddit: public subreddits via official API.
- Public joke APIs: `icanhazdadjoke`, `JokeAPI`.
- RSS/blog/news humor sections (when feed access is allowed).

For X, Instagram, Quora:
- Official APIs are usually paid or restricted.
- Recommend manual import workflow (CSV/JSON links) or approved third-party connectors only when terms permit.
- Avoid direct scraping that violates platform terms.

## High-Level Flow

```text
Scheduler / Manual Trigger
        |
        v
Next.js Cron Route (/api/ingest/run)
        |
        v
Source Adapters (reddit/api/rss/manual-import)
        |
        v
Normalize + Language Detect + Deduplicate
        |
        v
Safety / Quality Filters
        |
        v
Persist (Vercel KV) + Optional Promote to src/data/jokes.ts
```

## Recommended Components

1. `src/app/api/ingest/run/route.ts`
- Entry point for cron + manual runs.
- Accepts `?interval=1|2|3` and `?dryRun=true`.

2. `src/lib/ingest/sources/reddit.ts`
- Pull posts/comments from dad-joke subreddits.

3. `src/lib/ingest/sources/jokeApis.ts`
- Pull from free joke APIs.

4. `src/lib/ingest/sources/rss.ts`
- Pull from configured RSS sources.

5. `src/lib/ingest/normalize.ts`
- Convert raw text into `{ question, answer, tags, source }`.

6. `src/lib/ingest/dedupe.ts`
- Hash by normalized text + fuzzy similarity.

7. `src/lib/ingest/filter.ts`
- Remove NSFW/toxic/too-short/duplicate entries.

8. `src/lib/ingest/store.ts`
- Write candidates to KV (`jokes:queue`, `jokes:approved`).

9. `src/app/api/ingest/promote/route.ts`
- Manual approval/promote endpoint for dashboard workflow.

## Scheduling Options

### Automatic (recommended)
- Vercel Cron calls `/api/ingest/run` daily.
- Route decides whether to run based on `lastRunAt` and configured interval (`1|2|3` days).

### Manual
- Dashboard button calls `/api/ingest/run?manual=true`.
- Supports forced refresh without waiting for cron window.

### Hybrid
- Cron daily + manual override.

## Interval Logic

Store in KV:
- `ingest:config:intervalDays` -> `1`, `2`, or `3`
- `ingest:meta:lastRunAt` -> ISO timestamp

Run only when:
- `now - lastRunAt >= intervalDays`
- unless `manual=true` or `force=true`.

## Environment Variables

```env
# Existing
DASHBOARD_PIN=

# Ingestion controls
INGEST_INTERVAL_DAYS=2
INGEST_CRON_SECRET=change-me

# Source credentials (optional per source)
REDDIT_CLIENT_ID=
REDDIT_CLIENT_SECRET=
REDDIT_USER_AGENT=dadjoksss-ingest/1.0
```

## Example Vercel Cron

```json
{
  "crons": [
    { "path": "/api/ingest/run?source=all", "schedule": "0 9 * * *" }
  ]
}
```

Cron runs daily at 09:00 UTC; route enforces 1/2/3-day interval internally.

## Data Quality Rules

- Minimum length checks for setup/punchline.
- Reject exact duplicates and near-duplicates.
- Source attribution required (`source`, `sourceUrl` if available).
- Keep queue state: `pending`, `approved`, `rejected`.

## Suggested Rollout

1. Phase 1 (fast): Reddit + free joke APIs + manual promote.
2. Phase 2: Add RSS + stronger dedupe + dashboard moderation table.
3. Phase 3: Add optional manual imports for X/Instagram/Quora links.

## Cost

- Core ingestion can run at near-zero cost on Vercel + free sources.
- Cost mostly appears only if you add paid third-party connectors.
