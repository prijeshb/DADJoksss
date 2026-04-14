"""HTTP fetcher + HTML text extractor for public pages."""
from __future__ import annotations

import re
from datetime import datetime, timezone

import httpx
from bs4 import BeautifulSoup

from .models import ScrapeResult, ScrapeSource

# Playwright is an optional runtime dependency — imported lazily so the rest of
# the pipeline works without it when fetch_mode != "browser".
try:
    from playwright.sync_api import sync_playwright as _sync_playwright
    _PLAYWRIGHT_AVAILABLE = True
except ImportError:
    _PLAYWRIGHT_AVAILABLE = False

_USER_AGENT = "dadjoksss-ingest/0.1 (+public-text-scan)"
_REQUEST_TIMEOUT = 20.0
_MAX_TEXT_CHARS = 25_000


def _extract_meta(soup: BeautifulSoup, *names: str) -> str | None:
    for name in names:
        tag = soup.find("meta", attrs={"name": name}) or soup.find(
            "meta", attrs={"property": name}
        )
        if tag and isinstance(tag, object):
            content = getattr(tag, "attrs", {}).get("content", "")
            if content and isinstance(content, str):
                return content.strip()
    return None


def _extract_json_ld_text(soup: BeautifulSoup) -> str:
    parts: list[str] = []
    for script in soup.find_all("script", type="application/ld+json"):
        text = script.get_text(" ", strip=True)
        if text:
            parts.append(text)
    return " ".join(parts)


def _clean_text(raw: str) -> str:
    """Collapse runs of spaces/tabs but preserve newlines for line-pair extraction."""
    # Normalise line endings
    text = raw.replace("\r\n", "\n").replace("\r", "\n")
    # Collapse horizontal whitespace only (keep newlines intact)
    text = re.sub(r"[^\S\n]+", " ", text)
    # Collapse runs of blank lines to at most two newlines
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def parse_html(html: str, source: ScrapeSource) -> ScrapeResult:
    """Extract title, description and visible text from raw HTML."""
    soup = BeautifulSoup(html, "lxml")

    title = (
        _extract_meta(soup, "og:title", "twitter:title")
        or (soup.title.get_text(strip=True) if soup.title else None)
    )
    description = _extract_meta(
        soup, "description", "og:description", "twitter:description"
    )

    # Remove non-content elements
    for tag in soup(["script", "style", "noscript", "svg", "nav", "footer", "header"]):
        tag.decompose()

    json_ld = _extract_json_ld_text(BeautifulSoup(html, "lxml"))
    # Use "\n" separator so block elements produce separate lines the extractor can split on
    visible = soup.get_text("\n", strip=True)
    combined = _clean_text(f"{json_ld}\n{visible}")[:_MAX_TEXT_CHARS]

    return ScrapeResult(
        source=source,
        title=title,
        description=description,
        text=combined,
        fetched_at=datetime.now(timezone.utc).isoformat(),
    )


def fetch_json_api(source: ScrapeSource, client: httpx.Client) -> ScrapeResult:
    """
    Fetch a JSON API endpoint and convert the joke list to line-pair text.

    Supports the icanhazdadjoke.com /search response shape:
        {"results": [{"joke": "Why did X? Because Y."}]}

    Each joke is split on the first "? " so the extractor sees:
        Why did X?
        Because Y.
    """
    response = client.get(
        source.url,
        headers={
            "User-Agent": _USER_AGENT,
            "Accept": "application/json",
            "Accept-Language": "en-US,en;q=0.9",
        },
    )
    response.raise_for_status()
    data = response.json()

    jokes: list[str] = []
    if isinstance(data, dict):
        for item in data.get("results", []):
            if isinstance(item, dict) and isinstance(item.get("joke"), str):
                jokes.append(item["joke"])
    elif isinstance(data, list):
        for item in data:
            if isinstance(item, dict) and isinstance(item.get("joke"), str):
                jokes.append(item["joke"])

    lines: list[str] = []
    for joke in jokes:
        if "? " in joke:
            q, a = joke.split("? ", 1)
            lines.append(q + "?")
            lines.append(a)
        else:
            lines.append(joke)
        lines.append("")  # blank line between jokes

    return ScrapeResult(
        source=source,
        text="\n".join(lines),
        fetched_at=datetime.now(timezone.utc).isoformat(),
    )


_YT_ID_RE = re.compile(
    r"(?:v=|youtu\.be/|/embed/|/shorts/)([A-Za-z0-9_-]{11})"
)


def _extract_video_id(url: str) -> str | None:
    m = _YT_ID_RE.search(url)
    return m.group(1) if m else None


def fetch_transcript(source: ScrapeSource) -> ScrapeResult:
    """
    Fetch a YouTube video transcript via youtube-transcript-api.

    Captions are segmented into sentences and written one-per-line so the
    extractor's line-pair and two-sentence strategies can find Q&A pairs.
    Languages tried in order: source language_hint, then English fallback.
    """
    try:
        from youtube_transcript_api import YouTubeTranscriptApi
    except ImportError:
        raise RuntimeError(
            "youtube-transcript-api is not installed. Run: pip install youtube-transcript-api"
        )

    video_id = _extract_video_id(source.url)
    if not video_id:
        raise ValueError(f"Could not extract YouTube video ID from URL: {source.url}")

    lang_codes: list[str] = []
    if source.language_hint == "hinglish":
        lang_codes = ["hi", "en"]
    elif source.language_hint == "mixed":
        lang_codes = ["en", "hi"]
    else:
        lang_codes = ["en"]

    api = YouTubeTranscriptApi()
    try:
        fetched = api.fetch(video_id, languages=lang_codes)
    except Exception:
        # Fall back to any available language
        try:
            transcript_list = api.list(video_id)
            fetched = next(iter(transcript_list)).fetch()
        except Exception as exc:
            raise RuntimeError(f"No transcript available for {video_id}: {exc}") from exc

    # Clean and merge caption chunks into sentences, one per line
    raw_tokens = [s.text.strip() for s in fetched if s.text.strip()]
    joined = " ".join(raw_tokens)

    # Strip transcript noise: speaker markers (>>), sound descriptions ([laughter])
    joined = re.sub(r">>\s*", "", joined)
    joined = re.sub(r"\[[\w\s]+\]", "", joined)
    joined = re.sub(r"\s{2,}", " ", joined).strip()

    sentences = re.split(r"(?<=[.!?])\s+", joined)
    text = "\n".join(s.strip() for s in sentences if s.strip())

    return ScrapeResult(
        source=source,
        text=text,
        fetched_at=datetime.now(timezone.utc).isoformat(),
    )


def fetch_browser(source: ScrapeSource) -> ScrapeResult:
    """
    Fetch a JS-rendered page using a headless Chromium browser via Playwright.
    Waits for the network to go idle before extracting text, so dynamic content
    (infinite scroll teasers, lazy-loaded joke lists) is included.
    """
    if not _PLAYWRIGHT_AVAILABLE:
        raise RuntimeError(
            "Playwright is not installed. Run: pip install playwright && playwright install chromium"
        )

    with _sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        try:
            context = browser.new_context(
                user_agent=(
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/124.0.0.0 Safari/537.36"
                ),
                locale="en-US",
            )
            page = context.new_page()
            page.goto(source.url, wait_until="networkidle", timeout=30_000)
            html = page.content()
        finally:
            browser.close()

    return parse_html(html, source)


def fetch_and_parse(source: ScrapeSource, client: httpx.Client | None = None) -> ScrapeResult:
    """Fetch a URL and return a ScrapeResult. Raises on HTTP error."""
    own_client = client is None
    http = client or httpx.Client(timeout=_REQUEST_TIMEOUT, follow_redirects=True)

    try:
        if source.fetch_mode == "api":
            return fetch_json_api(source, http)

        if source.fetch_mode == "browser":
            return fetch_browser(source)

        if source.fetch_mode == "transcript":
            return fetch_transcript(source)

        response = http.get(
            source.url,
            headers={
                "User-Agent": _USER_AGENT,
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.9,hi;q=0.8",
            },
        )
        response.raise_for_status()
        return parse_html(response.text, source)
    finally:
        if own_client:
            http.close()
