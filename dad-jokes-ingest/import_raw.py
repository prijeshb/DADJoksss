"""
One-shot importer: parse jokes_raw.txt (JS-object format) and insert into Supabase.

Usage:
    python import_raw.py --file ../dad-jokes-web/jokes_raw.txt
    python import_raw.py --file ../dad-jokes-web/jokes_raw.txt --dry-run
"""
from __future__ import annotations

import argparse
import json
import logging
import re
import sys
from pathlib import Path

from dotenv import load_dotenv

from src.dadjokes_ingest.normalizer import content_hash, build_wrong_answers
from src.dadjokes_ingest.supabase_client import SupabaseClient, client_from_env, has_supabase_config
from src.dadjokes_ingest.models import JokeCandidate

logging.basicConfig(level=logging.INFO, format="%(levelname)-8s %(message)s")
logger = logging.getLogger(__name__)

# Regex to strip JS-style single-line comments (// ...) before JSON parsing
_COMMENT_RE = re.compile(r"//[^\n]*")
# Strip trailing commas before ] or }
_TRAILING_COMMA_RE = re.compile(r",\s*([}\]])")


def _normalise_to_json(raw: str) -> str:
    """Convert JS-object-array text to valid JSON."""
    text = _COMMENT_RE.sub("", raw)
    text = _TRAILING_COMMA_RE.sub(r"\1", text)
    return text.strip()


def parse_jokes_raw(path: Path) -> list[dict]:
    """Parse jokes_raw.txt into a list of raw joke dicts."""
    raw = path.read_text(encoding="utf-8")
    json_text = _normalise_to_json(raw)

    # The file might not start with '[' if it's embedded — try wrapping
    if not json_text.startswith("["):
        json_text = f"[{json_text}]"

    try:
        items = json.loads(json_text)
    except json.JSONDecodeError as exc:
        logger.error("Failed to parse %s: %s", path, exc)
        return []

    return [item for item in items if isinstance(item, dict)]


def item_to_candidate(item: dict) -> JokeCandidate | None:
    """Convert a raw joke dict to a JokeCandidate."""
    setup = item.get("setup") or item.get("question") or ""
    options: list = item.get("options") or []
    correct_index = item.get("correct", 0)
    punchline = item.get("punchline") or item.get("answer") or ""
    lang_raw = item.get("lang") or item.get("language") or "en"

    if not setup or not options or not isinstance(correct_index, int):
        return None

    # Extract correct answer from options
    if correct_index >= len(options):
        return None
    answer = str(options[correct_index]).strip()
    # Strip trailing emoji from answer if punchline starts with the answer text
    if punchline and punchline.startswith(answer):
        pass  # answer is fine
    elif punchline:
        # Use the punchline text up to the first '!' or end as the answer
        match = re.match(r"^([^!?]+[!?]?)", punchline.strip())
        if match:
            answer = match.group(1).strip()

    # Wrong answers = all options except the correct one
    wrong_options = [str(o).strip() for i, o in enumerate(options) if i != correct_index]
    # Pad or trim to exactly 3
    if len(wrong_options) > 3:
        wrong_options = wrong_options[:3]
    while len(wrong_options) < 3:
        wrong_options.append("I don't know")

    language = "hinglish" if lang_raw in ("hi", "hinglish") else "english"
    chash = content_hash(setup, language)

    return JokeCandidate(
        question=setup.strip(),
        answer=answer,
        language=language,
        category="general",
        difficulty=1,
        wrong_answers=wrong_options,
        tags=[language, "manual-import"],
        content_hash=chash,
        source_platform="other",
        source_handle="jokes_raw",
        source_url="local:jokes_raw.txt",
        transcript_snippet="",
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Import jokes_raw.txt into Supabase")
    parser.add_argument("--file", required=True, help="Path to jokes_raw.txt")
    parser.add_argument("--env", default=".env", help="Path to .env file")
    parser.add_argument("--dry-run", action="store_true", help="Don't write to Supabase")
    args = parser.parse_args()

    load_dotenv(args.env)

    path = Path(args.file)
    if not path.exists():
        logger.error("File not found: %s", path)
        sys.exit(1)

    items = parse_jokes_raw(path)
    logger.info("Parsed %d raw jokes from %s", len(items), path)

    candidates = [item_to_candidate(item) for item in items]
    valid = [c for c in candidates if c is not None]
    logger.info("%d valid candidates", len(valid))

    if args.dry_run or not has_supabase_config():
        if not args.dry_run:
            logger.warning("Supabase config missing — dry run only")
        for c in valid:
            print(f"  [{c.language:8}] {c.question[:60]}")
        print(f"\nTotal: {len(valid)} (dry run — nothing written)")
        return

    db = client_from_env()
    inserted = 0
    skipped = 0

    for c in valid:
        ok = db.insert_candidate(c)
        if ok:
            inserted += 1
        else:
            skipped += 1

    print(f"\nDone: {inserted} inserted, {skipped} duplicates skipped")


if __name__ == "__main__":
    main()
