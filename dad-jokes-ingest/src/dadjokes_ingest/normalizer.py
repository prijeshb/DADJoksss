"""Normalize raw Q&A pairs into structured JokeCandidate objects."""
from __future__ import annotations

import hashlib
import re
import unicodedata

from .models import JokeCandidate, JokeCategory, Language, LanguageHint, Platform

# Hard limits — anything outside these bounds is rejected before DB insertion.
_QUESTION_MAX = 300
_ANSWER_MAX = 300
_QUESTION_MIN = 8
_ANSWER_MIN = 3


def _sanitize_text(text: str, max_len: int) -> str:
    """
    Strip non-printable / control characters and enforce a length cap.

    Keeps:
    - Printable Unicode characters (letters, digits, punctuation, symbols)
    - Ordinary whitespace (space, tab, newline) normalised to a single space

    Strips:
    - C0/C1 control characters (U+0000–U+001F, U+007F–U+009F) except \\t/\\n/\\r
    - Unicode "format" category (Cf) — invisible direction/join markers
    - Null bytes and other non-printable junk
    """
    out: list[str] = []
    for ch in text:
        cat = unicodedata.category(ch)
        # Allow printable chars and safe whitespace; drop controls and format chars
        if ch in ("\t", "\n", "\r"):
            out.append(" ")
        elif cat == "Cc" or cat == "Cf":
            # Control or format character — drop it
            continue
        else:
            out.append(ch)

    # Collapse runs of whitespace, strip edges, cap length
    cleaned = re.sub(r" {2,}", " ", "".join(out)).strip()
    return cleaned[:max_len]


_HINGLISH_MARKERS = frozenset([
    "yaar", "bhai", "papa", "mummy", "nahi", "nahin", "kya", "kyu", "kyun",
    "beta", "desi", "wala", "matlab", "arre", "accha", "theek", "bilkul",
    "suno", "dekho", "jao", "aao", "haan", "nahi", "raat", "din",
])

_CATEGORY_PATTERNS: list[tuple[re.Pattern[str], JokeCategory]] = [
    (re.compile(r"\b(computer|coding|code|wifi|internet|app|phone|bug|software|programmer)\b", re.I), "tech"),
    (re.compile(r"\b(dog|cat|cow|goat|animal|bird|fish|lion|tiger|elephant)\b", re.I), "animal"),
    (re.compile(r"\b(food|pizza|chai|tea|coffee|burger|rice|roti|dal|khana)\b", re.I), "food"),
    (re.compile(r"\b(science|physics|chemistry|atom|gravity|element|molecule)\b", re.I), "science"),
    (re.compile(r"\b(wordplay|pun)\b", re.I), "pun"),
    (re.compile(r"\b(doctor|patient|hospital|medicine|nurse)\b", re.I), "classic"),
    (re.compile(r"\b(school|teacher|student|class|exam|homework)\b", re.I), "classic"),
]


def content_hash(question: str, language: Language) -> str:
    """SHA-256(lower(trim(question)) + "|" + language) — matches DB schema."""
    payload = f"{question.lower().strip()}|{language}"
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def detect_language(text: str, hint: LanguageHint) -> Language:
    """Detect language from text + source hint."""
    if hint == "english":
        return "english"
    if hint == "hinglish":
        return "hinglish"
    # mixed: check for hinglish markers
    lower = text.lower()
    words = set(re.findall(r"\b\w+\b", lower))
    if words & _HINGLISH_MARKERS:
        return "hinglish"
    return "english"


def infer_category(text: str) -> JokeCategory:
    """Classify a joke's category from its text."""
    for pattern, category in _CATEGORY_PATTERNS:
        if pattern.search(text):
            return category
    return "general"


def infer_difficulty(question: str, answer: str) -> int:
    """1=easy, 2=medium, 3=hard based on combined text length."""
    total = len(question) + len(answer)
    if total < 90:
        return 1
    if total < 160:
        return 2
    return 3


def build_wrong_answers(answer: str, language: Language) -> list[str]:
    """Generate 3 plausible-looking wrong answers."""
    if language == "hinglish":
        generics = ["Bilkul nahi", "Kya pata yaar", "Scene alag hai"]
    else:
        generics = ["Not really", "No idea at all", "Something else entirely"]

    # Add a truncated/mutated version of the real answer as a distractor
    if len(answer) > 25:
        alt = answer[:22] + "..."
    elif answer.endswith("!") or answer.endswith("."):
        alt = answer[:-1] + "?"
    else:
        alt = f"Maybe {answer.split()[0]}..." if answer.split() else generics[2]

    # Ensure the alt distractor doesn't exactly match the answer
    if alt == answer:
        alt = generics[2]

    return [generics[0], generics[1], alt]


def normalize(
    question: str,
    answer: str,
    snippet: str,
    source_platform: Platform,
    source_handle: str,
    source_url: str,
    language_hint: LanguageHint,
) -> JokeCandidate:
    """Turn a raw Q&A pair into a fully-normalized JokeCandidate.

    Raises ValueError if the sanitized question or answer falls below minimum
    length — the caller should skip such pairs rather than insert them.
    """
    question = _sanitize_text(question, _QUESTION_MAX)
    answer = _sanitize_text(answer, _ANSWER_MAX)

    if len(question) < _QUESTION_MIN:
        raise ValueError(f"Question too short after sanitization ({len(question)} chars)")
    if len(answer) < _ANSWER_MIN:
        raise ValueError(f"Answer too short after sanitization ({len(answer)} chars)")

    combined = f"{question} {answer}"
    language = detect_language(combined, language_hint)
    category = infer_category(combined)
    difficulty = infer_difficulty(question, answer)
    wrong_answers = build_wrong_answers(answer, language)
    tags = sorted({category, source_platform, source_handle.lower().replace(" ", "-")})
    chash = content_hash(question, language)

    return JokeCandidate(
        question=question,
        answer=answer,
        language=language,
        category=category,
        difficulty=difficulty,  # type: ignore[arg-type]
        wrong_answers=wrong_answers,
        tags=tags,
        content_hash=chash,
        source_platform=source_platform,
        source_handle=source_handle,
        source_url=source_url,
        transcript_snippet=snippet[:240],
    )
