"""CLI entrypoint: python -m dadjokes_ingest run [options]"""
from __future__ import annotations

import argparse
import json
import logging
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

from .pipeline import run_pipeline
from .sources import filter_sources, load_sources, load_sources_from_file
from .supabase_client import client_from_env, has_supabase_config

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-8s %(name)s  %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
)
logger = logging.getLogger("dadjokes_ingest")


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="dadjokes-ingest",
        description="Scrape joke sources and ingest candidates into Supabase.",
    )
    parser.add_argument(
        "--env",
        metavar="FILE",
        default=".env",
        help="Path to .env file (default: .env)",
    )
    parser.add_argument(
        "--sources-file",
        metavar="FILE",
        help="Path to a JSON sources file (overrides SCRAPE_SOURCES_JSON env var)",
    )
    parser.add_argument(
        "--source-ids",
        metavar="IDS",
        help="Comma-separated list of source IDs to run (default: all active)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        default=False,
        help="Extract candidates but do not write to Supabase",
    )
    parser.add_argument(
        "--max-candidates",
        type=int,
        default=40,
        metavar="N",
        help="Max candidates to extract per source (default: 40)",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        dest="output_json",
        default=False,
        help="Output results as JSON",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> None:
    args = _parse_args(argv)

    # Load env
    env_path = Path(args.env)
    if env_path.exists():
        load_dotenv(env_path)
        logger.info("Loaded env from %s", env_path)

    # Env overrides
    dry_run: bool = args.dry_run or os.environ.get("INGEST_DRY_RUN", "").lower() in (
        "1", "true", "yes"
    )
    max_candidates: int = args.max_candidates
    if env_max := os.environ.get("INGEST_MAX_CANDIDATES"):
        try:
            max_candidates = int(env_max)
        except ValueError:
            pass

    # Load sources
    if args.sources_file:
        all_sources = load_sources_from_file(args.sources_file)
    else:
        all_sources = load_sources()

    # Filter sources
    ids: list[str] | None = None
    raw_ids = args.source_ids or os.environ.get("INGEST_SOURCE_IDS", "")
    if raw_ids.strip():
        ids = [s.strip() for s in raw_ids.split(",") if s.strip()]

    sources = filter_sources(all_sources, ids=ids, active_only=True)
    if not sources:
        logger.error("No active sources found. Check your config.")
        sys.exit(1)

    logger.info(
        "Running pipeline: %d source(s), dry_run=%s, max_candidates=%d",
        len(sources),
        dry_run,
        max_candidates,
    )

    # Connect to Supabase (skip if dry run or config missing)
    db = None
    if not dry_run:
        if has_supabase_config():
            try:
                db = client_from_env()
                logger.info("Connected to Supabase")
            except Exception as exc:
                logger.warning("Supabase connection failed: %s — running in dry-run mode", exc)
                dry_run = True
        else:
            logger.warning("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — running in dry-run mode")
            dry_run = True

    results = run_pipeline(
        sources,
        db=db,
        dry_run=dry_run,
        max_candidates_per_source=max_candidates,
    )

    # Output
    if args.output_json:
        output = [
            {
                "source_id": r.source.id,
                "platform": r.source.platform,
                "ok": r.ok,
                "candidates_extracted": r.candidates_extracted,
                "candidates_inserted": r.candidates_inserted,
                "duplicates_skipped": r.duplicates_skipped,
                "error": r.error,
            }
            for r in results
        ]
        print(json.dumps({"dry_run": dry_run, "results": output}, indent=2))
    else:
        print(f"\n{'DRY RUN — ' if dry_run else ''}Results:")
        for r in results:
            status = "OK" if r.ok else "FAIL"
            print(
                f"  [{status}] {r.source.id} ({r.source.platform})"
                f"  extracted={r.candidates_extracted}"
                f"  inserted={r.candidates_inserted}"
                f"  dupes={r.duplicates_skipped}"
                + (f"  error={r.error}" if r.error else "")
            )

    total_inserted = sum(r.candidates_inserted for r in results)
    failed = [r for r in results if not r.ok]
    print(f"\nTotal inserted: {total_inserted} | Failed sources: {len(failed)}")

    if failed and len(failed) == len(results):
        sys.exit(1)


if __name__ == "__main__":
    main()
