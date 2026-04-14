"""Core ingestion pipeline — ties scraper, extractor, normalizer, and DB together."""
from __future__ import annotations

import hashlib
import logging
from dataclasses import dataclass, field

import httpx

from .extractor import extract_pairs
from .models import IngestRunSummary, JokeCandidate, ScrapeSource
from .normalizer import normalize
from .scraper import fetch_and_parse
from .supabase_client import SupabaseClient

logger = logging.getLogger(__name__)


@dataclass
class PipelineResult:
    source: ScrapeSource
    candidates_extracted: int = 0
    candidates_inserted: int = 0
    duplicates_skipped: int = 0
    error: str | None = None

    @property
    def ok(self) -> bool:
        return self.error is None


def run_source(
    source: ScrapeSource,
    *,
    db: SupabaseClient | None,
    run_id: str | None,
    source_id: str | None,
    dry_run: bool = False,
    max_candidates: int = 40,
    http_client: httpx.Client | None = None,
) -> PipelineResult:
    """
    Scrape one source, extract candidates, and (optionally) write to Supabase.
    """
    result = PipelineResult(source=source)

    try:
        scraped = fetch_and_parse(source, client=http_client)
    except Exception as exc:
        result.error = f"Fetch failed: {exc}"
        logger.warning("Source %s fetch error: %s", source.id, exc)
        return result

    full_text = " ".join(filter(None, [scraped.title, scraped.description, scraped.text]))
    pairs = extract_pairs(
        full_text,
        max_per_source=max_candidates,
        instagram=(source.platform == "instagram"),
    )
    result.candidates_extracted = len(pairs)

    for question, answer, snippet in pairs:
        try:
            candidate = normalize(
                question=question,
                answer=answer,
                snippet=snippet,
                source_platform=source.platform,
                source_handle=source.handle,
                source_url=source.url,
                language_hint=source.language_hint,
            )
        except ValueError as exc:
            logger.debug("Skipping pair from %s: %s", source.id, exc)
            continue

        if dry_run or db is None:
            result.candidates_inserted += 1
            continue

        # Wire up run/source IDs from DB registration
        candidate.ingest_run_id = run_id
        candidate.ingest_source_id = source_id

        # Use a synthetic source item ID per Q&A pair (no per-post tracking for web sources)
        item_id = db.insert_source_item(
            run_id=run_id or "",
            source_id=source_id or "",
            platform_item_id=candidate.content_hash[:16],
            source_url=source.url,
            content_type="article",
            caption=snippet[:240] if snippet else None,
        )
        candidate.ingest_source_item_id = item_id

        inserted = db.insert_candidate(candidate)
        if inserted:
            result.candidates_inserted += 1
        else:
            result.duplicates_skipped += 1

    return result


def run_pipeline(
    sources: list[ScrapeSource],
    *,
    db: SupabaseClient | None = None,
    dry_run: bool = False,
    max_candidates_per_source: int = 40,
) -> list[PipelineResult]:
    """
    Run the ingestion pipeline across all provided sources.
    Creates a DB ingest_run record if db is provided and not a dry run.
    """
    run_id: str | None = None
    total_items = 0
    total_extracted = 0
    total_inserted = 0
    total_duplicates = 0
    errors: list[str] = []

    if db and not dry_run:
        scope = ",".join(s.id for s in sources) if sources else "all"
        try:
            run_id = db.create_ingest_run(source_scope=scope)
        except Exception as exc:
            logger.error("Failed to create ingest_run: %s", exc)
            run_id = None

    results: list[PipelineResult] = []

    with httpx.Client(follow_redirects=True, timeout=20.0) as http_client:
        for source in sources:
            source_id: str | None = None

            if db and not dry_run:
                try:
                    source_id = db.upsert_ingest_source(source)
                except Exception as exc:
                    logger.warning("Failed to upsert source %s: %s", source.id, exc)

            res = run_source(
                source,
                db=db,
                run_id=run_id,
                source_id=source_id,
                dry_run=dry_run,
                max_candidates=max_candidates_per_source,
                http_client=http_client,
            )
            results.append(res)

            total_items += 1
            total_extracted += res.candidates_extracted
            total_inserted += res.candidates_inserted
            total_duplicates += res.duplicates_skipped
            if res.error:
                errors.append(f"{source.id}: {res.error}")

    if db and not dry_run and run_id:
        status = "failed" if len(errors) == len(sources) else (
            "partial" if errors else "completed"
        )
        try:
            db.finish_ingest_run(
                run_id,
                status=status,
                items_discovered=total_items,
                candidates_extracted=total_extracted,
                candidates_inserted=total_inserted,
                duplicates_skipped=total_duplicates,
                error="; ".join(errors) if errors else None,
            )
        except Exception as exc:
            logger.error("Failed to finish ingest_run %s: %s", run_id, exc)

    return results
