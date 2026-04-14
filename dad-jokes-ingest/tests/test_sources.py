"""Tests for the source registry."""
import json

import pytest

from dadjokes_ingest.sources import (
    DEFAULT_SOURCES,
    filter_sources,
    load_sources,
    load_sources_from_file,
)


class TestLoadSources:
    def test_returns_defaults_when_env_empty(self):
        sources = load_sources(env_json="")
        assert sources == DEFAULT_SOURCES

    def test_returns_defaults_on_invalid_json(self):
        sources = load_sources(env_json="{not valid json}")
        assert sources == DEFAULT_SOURCES

    def test_returns_defaults_when_not_a_list(self):
        sources = load_sources(env_json='{"key": "value"}')
        assert sources == DEFAULT_SOURCES

    def test_parses_valid_json(self):
        data = [
            {
                "id": "test-source",
                "platform": "web",
                "handle": "testsite",
                "url": "https://example.com",
                "language_hint": "english",
            }
        ]
        sources = load_sources(env_json=json.dumps(data))
        assert len(sources) == 1
        assert sources[0].id == "test-source"
        assert sources[0].platform == "web"
        assert sources[0].language_hint == "english"

    def test_skips_invalid_entries_but_keeps_valid(self):
        data = [
            {"id": "bad"},  # missing required fields
            {
                "id": "ok-source",
                "platform": "youtube",
                "handle": "joker",
                "url": "https://youtube.com/@joker",
                "language_hint": "english",
            },
        ]
        sources = load_sources(env_json=json.dumps(data))
        assert len(sources) == 1
        assert sources[0].id == "ok-source"

    def test_unknown_platform_is_rejected(self):
        data = [
            {
                "id": "bad-platform",
                "platform": "tiktok",
                "handle": "h",
                "url": "https://tiktok.com/@h",
                "language_hint": "english",
            }
        ]
        sources = load_sources(env_json=json.dumps(data))
        assert sources == DEFAULT_SOURCES


class TestFilterSources:
    def test_filters_inactive(self):
        active = DEFAULT_SOURCES[0]
        inactive_source = DEFAULT_SOURCES[0].__class__(
            id="inactive",
            platform="web",
            handle="x",
            url="https://x.com",
            language_hint="english",
            active=False,
        )
        result = filter_sources([active, inactive_source], active_only=True)
        assert all(s.active for s in result)
        assert inactive_source not in result

    def test_filters_by_ids(self):
        sources = DEFAULT_SOURCES
        first_id = sources[0].id
        result = filter_sources(sources, ids=[first_id])
        assert all(s.id == first_id for s in result)

    def test_empty_ids_returns_all_active(self):
        result = filter_sources(DEFAULT_SOURCES, ids=None)
        assert len(result) == len([s for s in DEFAULT_SOURCES if s.active])

    def test_load_sources_from_file(self, tmp_path):
        data = [
            {
                "id": "file-source",
                "platform": "web",
                "handle": "filesite",
                "url": "https://file.example.com",
                "language_hint": "english",
            }
        ]
        f = tmp_path / "sources.json"
        f.write_text(json.dumps(data))
        sources = load_sources_from_file(f)
        assert len(sources) == 1
        assert sources[0].id == "file-source"

    def test_load_sources_from_missing_file_returns_defaults(self, tmp_path):
        sources = load_sources_from_file(tmp_path / "nonexistent.json")
        assert sources == DEFAULT_SOURCES
