"""Data models for the ingestion pipeline."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

Platform = Literal["instagram", "youtube", "x", "reddit", "web", "other"]
LanguageHint = Literal["english", "hinglish", "mixed"]
Language = Literal["english", "hinglish"]
FetchMode = Literal["public_text", "transcript", "manual_import", "api", "browser"]
Priority = Literal["high", "medium", "low"]
JokeCategory = Literal[
    "pun", "wordplay", "classic", "science", "food", "animal", "tech", "general", "adult"
]


@dataclass
class ScrapeSource:
    id: str
    platform: Platform
    handle: str
    url: str
    language_hint: LanguageHint
    priority: Priority = "medium"
    fetch_mode: FetchMode = "public_text"
    active: bool = True


@dataclass
class ScrapeResult:
    source: ScrapeSource
    text: str
    title: str | None = None
    description: str | None = None
    fetched_at: str = ""


@dataclass
class JokeCandidate:
    question: str
    answer: str
    language: Language
    category: JokeCategory
    difficulty: Literal[1, 2, 3]
    wrong_answers: list[str]
    tags: list[str]
    content_hash: str
    source_platform: Platform
    source_handle: str
    source_url: str
    transcript_snippet: str = ""

    # Set after DB insertion
    ingest_run_id: str | None = None
    ingest_source_id: str | None = None
    ingest_source_item_id: str | None = None


@dataclass
class IngestRunSummary:
    run_id: str
    source_id: str
    items_discovered: int = 0
    candidates_extracted: int = 0
    candidates_inserted: int = 0
    duplicates_skipped: int = 0
    errors: list[str] = field(default_factory=list)
