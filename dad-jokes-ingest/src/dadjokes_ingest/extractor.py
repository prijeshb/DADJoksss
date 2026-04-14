"""Extract Q&A pairs from scraped text using multiple pattern strategies."""
from __future__ import annotations

import re

# ---------------------------------------------------------------------------
# Pre-processing helpers
# ---------------------------------------------------------------------------

# Remove Instagram bracket labels like "[Dark jokes, desi jokes]"
_IG_LABEL_RE = re.compile(r"\[[\w\s,.|–\-]+\]")
# Remove hashtag runs
_HASHTAG_RE = re.compile(r"(#\w+\s*)+")
# Remove "Tag a ..." / "Follow us" / ad phrases that aren't jokes
_IG_NOISE_RE = re.compile(
    r"^(tag\b|follow\b|share\b|comment\b|like\b|click\b|swipe\b|watch\b|phillips\b|thanks\b)",
    re.IGNORECASE,
)


def clean_instagram_text(text: str) -> str:
    """Strip hashtag blocks and bracket labels from Instagram caption text."""
    text = _IG_LABEL_RE.sub("", text)
    text = _HASHTAG_RE.sub("", text)
    # Collapse blank lines left over after removal
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()

# ---------------------------------------------------------------------------
# Pattern strategies
# ---------------------------------------------------------------------------

_QA_LABEL_RE = re.compile(
    r"(?:^|\n)\s*(?:q(?:uestion)?)\s*[:\-–]\s*(.{8,200}?)\s*\n\s*(?:a(?:nswer)?)\s*[:\-–]\s*(.{4,200}?)(?=\n{2,}|\Z)",
    re.IGNORECASE | re.MULTILINE,
)

_WHY_RE = re.compile(
    r"(Why\b[^?\n]{6,180}\?)\s*\n\s*([^\n]{4,180})",
    re.IGNORECASE,
)

_WHAT_RE = re.compile(
    r"(What\b[^?\n]{6,180}\?)\s*\n\s*([^\n]{4,180})",
    re.IGNORECASE,
)

_HOW_RE = re.compile(
    r"(How\b[^?\n]{6,180}\?)\s*\n\s*([^\n]{4,180})",
    re.IGNORECASE,
)


def _clean(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def _extract_labeled(text: str) -> list[tuple[str, str, str]]:
    """Match explicit Q: / A: labeling."""
    results: list[tuple[str, str, str]] = []
    for m in _QA_LABEL_RE.finditer(text):
        q = _clean(m.group(1))
        a = _clean(m.group(2))
        if len(q) > 7 and len(a) > 3:
            results.append((q, a, _clean(m.group(0))[:240]))
    return results


def _extract_pattern(pattern: re.Pattern[str], text: str) -> list[tuple[str, str, str]]:
    """Match a regex with (question, answer) groups."""
    results: list[tuple[str, str, str]] = []
    for m in pattern.finditer(text):
        q = _clean(m.group(1))
        a = _clean(m.group(2))
        if len(q) > 8 and len(a) > 3:
            results.append((q, a, _clean(f"{q} {a}")[:240]))
    return results


def _extract_line_pairs(text: str) -> list[tuple[str, str, str]]:
    """Heuristic: consecutive lines where line N ends with '?' and line N+1 doesn't."""
    lines = [_clean(ln) for ln in text.split("\n")]
    lines = [ln for ln in lines if 7 < len(ln) < 240]
    results: list[tuple[str, str, str]] = []
    for i in range(len(lines) - 1):
        q, a = lines[i], lines[i + 1]
        if q.endswith("?") and not a.endswith("?"):
            results.append((q, a, _clean(f"{q} {a}")[:240]))
    return results


# Sentence-split boundaries: ". ", "! ", "… " or end-of-string after sentence
_SENT_SPLIT_RE = re.compile(r"(?<=[.!…])\s+")


def _extract_two_sentence(text: str) -> list[tuple[str, str, str]]:
    """
    Handle one-liner / caption-style jokes that are exactly two sentences:
      Setup. Punchline.
      Setup! Punchline.
    Each non-empty line is checked; if it splits cleanly into two non-trivial
    parts the first becomes the question and the second the answer.
    """
    results: list[tuple[str, str, str]] = []
    for raw_line in text.split("\n"):
        line = _clean(raw_line)
        # Skip noise lines (ads, hashtag-only, very short or very long)
        if len(line) < 15 or len(line) > 300:
            continue
        if _IG_NOISE_RE.match(line):
            continue
        parts = _SENT_SPLIT_RE.split(line, maxsplit=1)
        if len(parts) != 2:
            continue
        q, a = _clean(parts[0]), _clean(parts[1])
        # Both parts must be meaningful and answer must not also end with "?"
        # (avoids Q?Q? patterns captured by other strategies)
        if len(q) > 8 and len(a) > 4 and not a.endswith("?"):
            results.append((q, a, _clean(f"{q} {a}")[:240]))
    return results


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def extract_pairs(
    text: str,
    max_per_source: int = 40,
    *,
    instagram: bool = False,
) -> list[tuple[str, str, str]]:
    """
    Return a deduplicated list of (question, answer, snippet) tuples
    extracted from scraped text.

    Pass ``instagram=True`` to pre-clean hashtag/label noise before extraction
    and enable the two-sentence one-liner strategy.
    """
    if instagram:
        text = clean_instagram_text(text)

    raw: list[tuple[str, str, str]] = []
    raw.extend(_extract_labeled(text))
    raw.extend(_extract_pattern(_WHY_RE, text))
    raw.extend(_extract_pattern(_WHAT_RE, text))
    raw.extend(_extract_pattern(_HOW_RE, text))
    raw.extend(_extract_line_pairs(text))
    raw.extend(_extract_two_sentence(text))

    # Deduplicate by normalised question text
    seen: set[str] = set()
    unique: list[tuple[str, str, str]] = []
    for q, a, snippet in raw:
        key = q.lower().strip()
        if key not in seen:
            seen.add(key)
            unique.append((q, a, snippet))

    return unique[:max_per_source]
