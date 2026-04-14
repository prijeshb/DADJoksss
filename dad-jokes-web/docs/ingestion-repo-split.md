# Ingestion Repo Split

## Overview

This project is split into two repositories:

1. `dad-jokes-web`
- Next.js frontend and dashboard
- Supabase-backed read/write flows for approved jokes and candidate review
- Existing `src/data/jokes.ts` remains in place as seed data and fallback content

2. `dad-jokes-ingest`
- Python worker for scraping, transcript extraction, normalization, dedupe, and candidate insertion
- Runs on its own schedule
- Writes scraped results into Supabase staging tables

## Why Split

The web app and the scraper have different runtime needs.

- Web app:
  - fast request/response
  - UI and moderation
  - deploys well on Vercel

- Scraper:
  - long-running jobs
  - Python scraping ecosystem
  - transcript extraction and retries
  - better deployed outside Vercel

## Current Repo Role

This repo stays focused on:
- frontend
- dashboard auth
- moderation flow
- reading approved jokes from DB
- promoting approved candidates into production tables

## `src/data/jokes.ts`

`src/data/jokes.ts` is not deleted.

It remains useful for:
- initial seed data
- fallback jokes if DB is unavailable
- local development and testing
- quality reference set for future ingestion comparisons

## Database Flow

### Staging path
Python worker writes into:
- `ingest_runs`
- `ingest_sources`
- `ingest_source_items`
- `joke_candidates`

### Promotion path
Reviewer edits and approves a candidate:
- insert into `jokes`
- insert into `joke_options`
- insert into `joke_tags`
- insert into `joke_provenance`
- update candidate with promoted joke reference

## Deployment Direction

- `dad-jokes-web` -> Vercel
- `dad-jokes-ingest` -> separate Python runtime
- Scheduler -> Supabase cron
- Database -> Supabase Postgres
