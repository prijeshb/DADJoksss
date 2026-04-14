"""Tests for the normalizer module."""
import hashlib

import pytest

from dadjokes_ingest.normalizer import (
    _ANSWER_MAX,
    _ANSWER_MIN,
    _QUESTION_MAX,
    _QUESTION_MIN,
    _sanitize_text,
    build_wrong_answers,
    content_hash,
    detect_language,
    infer_category,
    infer_difficulty,
    normalize,
)


class TestContentHash:
    def test_matches_schema_formula(self):
        question = "  Why did the dad bring a ladder?  "
        language = "english"
        expected = hashlib.sha256(
            f"{question.lower().strip()}|{language}".encode()
        ).hexdigest()
        assert content_hash(question, language) == expected

    def test_is_case_insensitive(self):
        assert content_hash("Why did dad do that?", "english") == content_hash(
            "why did dad do that?", "english"
        )

    def test_different_languages_differ(self):
        q = "Kya hal hai?"
        assert content_hash(q, "english") != content_hash(q, "hinglish")


class TestDetectLanguage:
    def test_english_hint_returns_english(self):
        assert detect_language("why did the chicken cross the road", "english") == "english"

    def test_hinglish_hint_returns_hinglish(self):
        assert detect_language("any text here", "hinglish") == "hinglish"

    def test_mixed_with_hinglish_marker(self):
        assert detect_language("yaar, kya chal raha hai", "mixed") == "hinglish"

    def test_mixed_without_marker_defaults_to_english(self):
        assert detect_language("why did the chicken cross the road", "mixed") == "english"


class TestInferCategory:
    def test_tech_keywords(self):
        assert infer_category("why does my computer crash every time I code") == "tech"

    def test_animal_keywords(self):
        assert infer_category("why does the dog bark at midnight") == "animal"

    def test_food_keywords(self):
        assert infer_category("my chai is too cold") == "food"

    def test_science_keywords(self):
        assert infer_category("what is the speed of gravity") == "science"

    def test_default_general(self):
        assert infer_category("why is the sky blue on a clear day") == "general"


class TestInferDifficulty:
    def test_short_is_easy(self):
        assert infer_difficulty("Why?", "Yes.") == 1

    def test_medium_length(self):
        q = "Why did the software engineer quit his job at the big company?"
        a = "Because he did not get arrays of benefits he expected."
        assert infer_difficulty(q, a) == 2

    def test_long_is_hard(self):
        q = "x" * 100
        a = "y" * 100
        assert infer_difficulty(q, a) == 3


class TestBuildWrongAnswers:
    def test_returns_three_answers(self):
        answers = build_wrong_answers("To reach new heights!", "english")
        assert len(answers) == 3

    def test_none_match_correct_answer(self):
        correct = "Because the wifi was down"
        wrongs = build_wrong_answers(correct, "english")
        assert correct not in wrongs

    def test_hinglish_uses_hindi_words(self):
        wrongs = build_wrong_answers("Kuch nahi", "hinglish")
        assert any("Bilkul" in w or "Kya" in w for w in wrongs)


class TestSanitizeText:
    # ── control / non-printable stripping ──────────────────────────────────

    def test_null_byte_stripped(self):
        assert _sanitize_text("hel\x00lo", 300) == "hello"

    def test_c0_controls_stripped(self):
        # Bell (0x07), backspace (0x08), ESC (0x1B) must all vanish
        assert _sanitize_text("hi\x07\x08\x1bthere", 300) == "hithere"

    def test_c1_controls_stripped(self):
        # DEL (0x7F) and C1 range (0x80–0x9F)
        assert _sanitize_text("ab\x7fcd\x85ef", 300) == "abcdef"

    def test_unicode_format_chars_stripped(self):
        # Zero-width joiner U+200D, zero-width no-break space U+FEFF
        assert _sanitize_text("joke\u200dtext\ufeff", 300) == "joketext"

    def test_rtl_override_stripped(self):
        # Right-to-left override U+202E — classic text-spoofing char
        assert _sanitize_text("safe\u202etext", 300) == "safetext"

    # ── whitespace normalisation ────────────────────────────────────────────

    def test_tab_and_newline_become_space(self):
        assert _sanitize_text("why\tdid\nhe", 300) == "why did he"

    def test_multiple_spaces_collapsed(self):
        assert _sanitize_text("too   many    spaces", 300) == "too many spaces"

    def test_leading_trailing_whitespace_stripped(self):
        assert _sanitize_text("  hello  ", 300) == "hello"

    # ── length cap ─────────────────────────────────────────────────────────

    def test_truncated_to_max_len(self):
        result = _sanitize_text("a" * 500, 300)
        assert len(result) == 300

    def test_short_string_unchanged_length(self):
        text = "Why did the dad joke?"
        assert _sanitize_text(text, 300) == text

    def test_max_len_zero_returns_empty(self):
        assert _sanitize_text("anything", 0) == ""

    # ── XSS payloads — stored as plain text, NOT stripped here ────────────
    #
    # _sanitize_text only removes non-printable/control characters.
    # HTML tags are printable text; stripping them at this layer would
    # silently corrupt legitimate joke content (e.g. "Why is <br> a
    # bad tag name?  Because it never closes!").
    #
    # XSS prevention is the responsibility of the RENDER layer:
    #   • Dashboard → React JSX auto-escapes all text nodes and attributes.
    #   • Public feed → served from static data/jokes.ts (DB never reaches it).
    #
    # These tests DOCUMENT that behaviour so no future refactor silently
    # adds HTML-stripping here and breaks pun jokes about angle brackets.

    def test_script_tag_stored_as_plain_text(self):
        payload = "<script>alert(1)</script>"
        assert _sanitize_text(payload, 300) == payload

    def test_img_onerror_stored_as_plain_text(self):
        payload = '<img src=x onerror=alert(document.cookie)>'
        assert _sanitize_text(payload, 300) == payload

    def test_svg_onload_stored_as_plain_text(self):
        payload = '<svg onload=alert(1)>'
        assert _sanitize_text(payload, 300) == payload

    def test_html_entity_encoding_stored_as_plain_text(self):
        # Raw entities are printable characters — preserved unchanged.
        payload = "&lt;script&gt;alert(1)&lt;/script&gt;"
        assert _sanitize_text(payload, 300) == payload

    def test_javascript_scheme_stored_as_plain_text(self):
        # The sourceUrl check in sources.py blocks javascript: URLs at
        # ingest time; if one ever reaches the normalizer it is still
        # just text — rendered inert by React's href guard in the dashboard.
        payload = "javascript:alert(document.cookie)"
        assert _sanitize_text(payload, 300) == payload

    def test_xss_with_null_byte_bypass_attempt(self):
        # Attacker tries to split the payload with a null byte hoping
        # to confuse a downstream filter.  Null byte is stripped; the
        # remaining printable payload is preserved (render layer handles it).
        result = _sanitize_text("<scr\x00ipt>alert(1)</scr\x00ipt>", 300)
        assert "\x00" not in result
        assert result == "<script>alert(1)</script>"  # null bytes gone, surrounding chars join

    def test_xss_with_rtl_override_bypass_attempt(self):
        # RTL override (U+202E) is used to visually disguise filenames/text.
        # It is a Cf-category format char and must be stripped.
        result = _sanitize_text("safe\u202e<script>", 300)
        assert "\u202e" not in result
        assert result == "safe<script>"

    def test_xss_payload_truncated_by_max_len(self):
        long_payload = "<script>alert(1)</script>" * 20  # 500 chars
        result = _sanitize_text(long_payload, 300)
        assert len(result) <= 300
        # Still plain text — not executed because React escapes on render.

    # ── legitimate content preserved ───────────────────────────────────────

    def test_emoji_preserved(self):
        assert "😂" in _sanitize_text("haha 😂 funny", 300)

    def test_hinglish_unicode_preserved(self):
        assert _sanitize_text("Kya baat hai yaar!", 300) == "Kya baat hai yaar!"

    def test_punctuation_preserved(self):
        result = _sanitize_text("Why? Because: it's \"funny\" & true!", 300)
        assert result == "Why? Because: it's \"funny\" & true!"

    def test_numbers_preserved(self):
        assert _sanitize_text("Answer is 42.", 300) == "Answer is 42."


class TestNormalizeSanitization:
    """Validate that normalize() applies sanitization and enforces length bounds."""

    _BASE = dict(
        snippet="snippet",
        source_platform="web",
        source_handle="site",
        source_url="https://example.com",
        language_hint="english",
    )

    def _call(self, question: str, answer: str):
        return normalize(question=question, answer=answer, **self._BASE)

    # ── null bytes / control characters rejected or stripped ───────────────

    def test_null_byte_in_question_stripped(self):
        c = self._call("Why did dad\x00 do it?", "Because he could.")
        assert "\x00" not in c.question

    def test_control_chars_in_answer_stripped(self):
        # Controls are dropped (not replaced with space); spaces around them are preserved.
        c = self._call("Why did the chicken cross?", "To \x07get\x1b to \x08the other side.")
        assert c.answer == "To get to the other side."

    def test_rtl_override_in_question_stripped(self):
        c = self._call("Normal question\u202e?", "Normal answer.")
        assert "\u202e" not in c.question

    def test_zero_width_joiner_stripped(self):
        # Use a full-length question so stripping U+200D doesn't drop below min length.
        c = self._call("Why did dad do that\u200d?", "Because\u200d he could.")
        assert "\u200d" not in c.question
        assert "\u200d" not in c.answer

    # ── length cap enforced ─────────────────────────────────────────────────

    def test_question_capped_at_max(self):
        long_q = "Why " + "a" * 400 + "?"
        c = self._call(long_q, "Short answer.")
        assert len(c.question) <= _QUESTION_MAX

    def test_answer_capped_at_max(self):
        long_a = "Because " + "b" * 400 + "."
        c = self._call("Short question?", long_a)
        assert len(c.answer) <= _ANSWER_MAX

    # ── too-short after sanitization → ValueError ──────────────────────────

    def test_question_all_controls_raises(self):
        # After stripping, question is empty → below min
        with pytest.raises(ValueError, match="Question too short"):
            self._call("\x00\x01\x02\x03\x04\x05\x06\x07", "Valid answer here.")

    def test_answer_all_controls_raises(self):
        with pytest.raises(ValueError, match="Answer too short"):
            self._call("Why did the dad do it?", "\x00\x01\x02")

    def test_question_below_min_raises(self):
        # 7 printable chars — one below _QUESTION_MIN (8)
        with pytest.raises(ValueError, match="Question too short"):
            self._call("Why ok?", "Valid answer here.")

    def test_answer_below_min_raises(self):
        # 2 printable chars — one below _ANSWER_MIN (3)
        with pytest.raises(ValueError, match="Answer too short"):
            self._call("Why did the dad do it?", "No")

    def test_exactly_at_min_lengths_accepted(self):
        q = "x" * _QUESTION_MIN + "?"   # _QUESTION_MIN chars + punctuation → above min
        a = "x" * _ANSWER_MIN
        c = self._call(q, a)
        assert len(c.question) >= _QUESTION_MIN
        assert len(c.answer) >= _ANSWER_MIN

    # ── legitimate content survives unchanged ──────────────────────────────

    def test_normal_joke_passes_through(self):
        c = self._call(
            "Why did the dad bring a ladder?",
            "To reach new heights!",
        )
        assert c.question == "Why did the dad bring a ladder?"
        assert c.answer == "To reach new heights!"

    def test_emoji_in_joke_preserved(self):
        c = self._call("Why so serious? 😂", "Because dad jokes! 😄")
        assert "😂" in c.question
        assert "😄" in c.answer

    # ── XSS payloads through the full normalize() pipeline ────────────────

    def test_script_tag_in_question_stored_verbatim(self):
        # HTML is printable text — stored as-is, escaped by React on render.
        c = self._call(
            "<script>alert(1)</script> Why did the dad joke?",
            "Because he could not help it.",
        )
        assert c.question.startswith("<script>")

    def test_img_onerror_in_answer_stored_verbatim(self):
        c = self._call(
            "Why did the chicken cross the road today?",
            '<img src=x onerror=alert(1)> To get there.',
        )
        assert "<img" in c.answer

    def test_null_byte_xss_bypass_stripped_from_question(self):
        # Null byte in the middle of a script tag — stripped, not replaced.
        c = self._call(
            "<scr\x00ipt>alert(1)</scr\x00ipt> Why did the dad joke?",
            "Because he could not stop laughing.",
        )
        assert "\x00" not in c.question

    def test_rtl_override_xss_bypass_stripped_from_answer(self):
        c = self._call(
            "Why did the developer push to production?",
            "It worked\u202e on his machine.",
        )
        assert "\u202e" not in c.answer

    def test_xss_only_question_raises_if_too_short_after_strip(self):
        # Payload that is entirely control chars after stripping → too short.
        with pytest.raises(ValueError, match="Question too short"):
            self._call("\x00\x01\x02\x03\x04\x05\x06\x07", "Valid long enough answer.")

    def test_long_xss_payload_capped_at_max(self):
        long_payload = "<script>alert(1)</script>" * 20  # 500 chars
        c = self._call(
            long_payload,
            "The punchline is right here for real.",
        )
        assert len(c.question) <= _QUESTION_MAX

    # ── hinglish preservation ───────────────────────────────────────────────

    def test_hinglish_joke_preserved(self):
        # language_hint="mixed" triggers marker-based detection; "yaar"+"nahi"+"bhai" → hinglish
        c = normalize(
            question="Yaar, kya chal raha hai?",
            answer="Kuch nahi bhai, bas timepass.",
            snippet="snippet",
            source_platform="web",
            source_handle="site",
            source_url="https://example.com",
            language_hint="mixed",
        )
        assert c.question == "Yaar, kya chal raha hai?"
        assert c.language == "hinglish"


class TestNormalize:
    def test_returns_candidate(self):
        c = normalize(
            question="Why did dad bring a ladder?",
            answer="To reach new heights!",
            snippet="Why did dad bring a ladder? To reach new heights!",
            source_platform="web",
            source_handle="testsite",
            source_url="https://example.com",
            language_hint="english",
        )
        assert c.question == "Why did dad bring a ladder?"
        assert c.answer == "To reach new heights!"
        assert c.language == "english"
        assert len(c.wrong_answers) == 3
        assert c.content_hash  # non-empty
        assert c.source_platform == "web"

    def test_snippet_is_truncated_to_240(self):
        long_snippet = "x" * 300
        c = normalize(
            question="Why did the dad bring a ladder?",
            answer="To reach new heights!",
            snippet=long_snippet,
            source_platform="web",
            source_handle="h",
            source_url="https://example.com",
            language_hint="english",
        )
        assert len(c.transcript_snippet) <= 240
