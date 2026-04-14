"""Source registry — loads scrape sources from env or a JSON config file."""
from __future__ import annotations

import ipaddress
import json
import os
import socket
from pathlib import Path
from urllib.parse import urlparse

from .models import FetchMode, JokeCategory, Language, LanguageHint, Platform, Priority, ScrapeSource

_VALID_PLATFORMS: set[str] = {"instagram", "youtube", "x", "reddit", "web", "other"}
_ALLOWED_URL_SCHEMES: set[str] = {"https"}


def _is_safe_url(url: str) -> bool:
    """Return True only for https URLs that don't resolve to private/loopback IPs."""
    try:
        parsed = urlparse(url)
    except ValueError:
        return False
    if parsed.scheme not in _ALLOWED_URL_SCHEMES:
        return False
    hostname = parsed.hostname
    if not hostname:
        return False
    try:
        addr = ipaddress.ip_address(socket.gethostbyname(hostname))
    except (socket.gaierror, ValueError):
        # Can't resolve — allow at parse time; real check happens at scrape time.
        return True
    return not (addr.is_private or addr.is_loopback or addr.is_link_local or addr.is_reserved)


_VALID_LANGUAGE_HINTS: set[str] = {"english", "hinglish", "mixed"}
_VALID_PRIORITIES: set[str] = {"high", "medium", "low"}
_VALID_FETCH_MODES: set[str] = {"public_text", "transcript", "manual_import", "api", "browser"}

DEFAULT_SOURCES: list[ScrapeSource] = [
    # JSON API — returns 30 jokes per page, many in "Why did X? Because Y." format
    ScrapeSource(
        id="api-icanhazdadjoke",
        platform="web",
        handle="icanhazdadjoke",
        url="https://icanhazdadjoke.com/search?limit=30",
        language_hint="english",
        priority="high",
        fetch_mode="api",
    ),
    # Reader's Digest jokes hub — Q&A format, server-rendered
    ScrapeSource(
        id="web-rd-dadjokes",
        platform="web",
        handle="rd",
        url="https://www.rd.com/jokes/",
        language_hint="english",
        priority="high",
        fetch_mode="public_text",
    ),
    # UpJoke — curated Q&A dad jokes, scraper-friendly
    ScrapeSource(
        id="web-upjoke-dadjokes",
        platform="web",
        handle="upjoke",
        url="https://upjoke.com/dad-jokes",
        language_hint="english",
        priority="medium",
        fetch_mode="public_text",
    ),
    # Instagram — JS-rendered, requires browser fetch
    ScrapeSource(
        id="ig-bekarobar",
        platform="instagram",
        handle="bekarobar",
        url="https://www.instagram.com/bekarobar/",
        language_hint="mixed",
        priority="high",
        fetch_mode="browser",
    ),
]


def _parse_source(raw: object) -> ScrapeSource | None:
    if not isinstance(raw, dict):
        return None

    source_id = raw.get("id", "")
    handle = raw.get("handle", "")
    url = raw.get("url", "")
    platform = raw.get("platform", "")
    language_hint = raw.get("language_hint", "mixed")
    priority = raw.get("priority", "medium")
    fetch_mode = raw.get("fetch_mode", "public_text")
    active = raw.get("active", True)

    if not (source_id and handle and url):
        return None
    if not _is_safe_url(str(url)):
        return None
    if platform not in _VALID_PLATFORMS:
        return None
    if language_hint not in _VALID_LANGUAGE_HINTS:
        return None
    if priority not in _VALID_PRIORITIES:
        return None
    if fetch_mode not in _VALID_FETCH_MODES:
        return None

    return ScrapeSource(
        id=str(source_id).strip(),
        platform=platform,  # type: ignore[arg-type]
        handle=str(handle).strip(),
        url=str(url).strip(),
        language_hint=language_hint,  # type: ignore[arg-type]
        priority=priority,  # type: ignore[arg-type]
        fetch_mode=fetch_mode,  # type: ignore[arg-type]
        active=bool(active),
    )


def load_sources(env_json: str | None = None) -> list[ScrapeSource]:
    """Load sources from SCRAPE_SOURCES_JSON env var or return defaults."""
    raw_json = env_json if env_json is not None else os.environ.get("SCRAPE_SOURCES_JSON", "")
    if not raw_json.strip():
        return DEFAULT_SOURCES

    try:
        parsed = json.loads(raw_json)
    except json.JSONDecodeError:
        return DEFAULT_SOURCES

    if not isinstance(parsed, list):
        return DEFAULT_SOURCES

    sources = [_parse_source(item) for item in parsed]
    valid = [s for s in sources if s is not None]
    return valid if valid else DEFAULT_SOURCES


def load_sources_from_file(path: str | Path) -> list[ScrapeSource]:
    """Load sources from a JSON file (e.g. sources.json)."""
    try:
        content = Path(path).read_text(encoding="utf-8")
        return load_sources(content)
    except (OSError, ValueError):
        return DEFAULT_SOURCES


def filter_sources(
    sources: list[ScrapeSource],
    ids: list[str] | None = None,
    active_only: bool = True,
) -> list[ScrapeSource]:
    """Filter sources by active status and optional ID list."""
    result = [s for s in sources if not active_only or s.active]
    if ids:
        result = [s for s in result if s.id in ids]
    return result
