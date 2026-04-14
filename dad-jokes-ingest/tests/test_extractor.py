"""Tests for the Q&A extractor."""
import pytest

from dadjokes_ingest.extractor import extract_pairs


class TestExtractPairs:
    def test_extracts_why_pattern(self):
        text = "Why did the dad bring a ladder?\nTo reach new heights."
        pairs = extract_pairs(text)
        assert len(pairs) == 1
        q, a, snippet = pairs[0]
        assert "ladder" in q
        assert "heights" in a

    def test_extracts_qa_label_pattern(self):
        text = "Q: Why did the chicken cross the road?\nA: To get to the other side.\n\nSome filler."
        pairs = extract_pairs(text)
        assert any("chicken" in q for q, _, _ in pairs)

    def test_extracts_line_pairs(self):
        text = "Why is the sky blue?\nBecause of Rayleigh scattering."
        pairs = extract_pairs(text)
        assert len(pairs) >= 1

    def test_deduplicates_same_question(self):
        text = (
            "Why did dad do it?\nBecause he could.\n\n"
            "Why did dad do it?\nBecause he could."
        )
        pairs = extract_pairs(text)
        questions = [q for q, _, _ in pairs]
        assert len(questions) == len(set(q.lower().strip() for q in questions))

    def test_respects_max_per_source(self):
        lines = []
        for i in range(30):
            lines.append(f"Why does thing {i} work?")
            lines.append(f"Because of reason {i}.")
            lines.append("")
        text = "\n".join(lines)
        pairs = extract_pairs(text, max_per_source=5)
        assert len(pairs) <= 5

    def test_empty_text_returns_empty(self):
        assert extract_pairs("") == []

    def test_ignores_very_short_answers(self):
        text = "Why?\nNo."
        pairs = extract_pairs(text)
        # "No." is too short (< 4 chars) for the why pattern
        assert all(len(a) > 3 for _, a, _ in pairs)

    def test_what_pattern(self):
        text = "What do you call a fish without eyes?\nA fsh."
        pairs = extract_pairs(text)
        assert any("fish" in q for q, _, _ in pairs)
