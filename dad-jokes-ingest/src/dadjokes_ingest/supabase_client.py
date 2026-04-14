"""Supabase REST API client — writes ingest runs, source items, and candidates."""
from __future__ import annotations

import json
import os
from dataclasses import asdict
from datetime import datetime, timezone

import httpx

from .models import IngestRunSummary, JokeCandidate, ScrapeSource

_TIMEOUT = 30.0


class SupabaseError(RuntimeError):
    """Raised when a Supabase REST call fails."""


class SupabaseClient:
    def __init__(self, url: str, service_role_key: str) -> None:
        if not url or not service_role_key:
            raise SupabaseError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required")
        self._base = url.rstrip("/")
        self._headers = {
            "apikey": service_role_key,
            "Authorization": f"Bearer {service_role_key}",
            "Content-Type": "application/json",
        }

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _post(self, path: str, body: object, prefer: str = "") -> object:
        headers = {**self._headers}
        if prefer:
            headers["Prefer"] = prefer
        with httpx.Client(timeout=_TIMEOUT) as client:
            resp = client.post(
                f"{self._base}{path}",
                headers=headers,
                content=json.dumps(body),
            )
        if not resp.is_success:
            raise SupabaseError(f"POST {path} failed [{resp.status_code}]: {resp.text}")
        return resp.json() if resp.text else None

    def _patch(self, path: str, body: object) -> None:
        with httpx.Client(timeout=_TIMEOUT) as client:
            resp = client.patch(
                f"{self._base}{path}",
                headers=self._headers,
                content=json.dumps(body),
            )
        if not resp.is_success:
            raise SupabaseError(f"PATCH {path} failed [{resp.status_code}]: {resp.text}")

    def _rpc(self, fn: str, params: object) -> object:
        return self._post(f"/rest/v1/rpc/{fn}", params)

    # ------------------------------------------------------------------
    # Ingest run lifecycle
    # ------------------------------------------------------------------

    def create_ingest_run(self, source_scope: str = "all") -> str:
        """Insert a new ingest_run row and return its UUID."""
        rows = self._post(
            "/rest/v1/ingest_runs",
            {"trigger_type": "manual", "status": "running", "source_scope": source_scope},
            prefer="return=representation",
        )
        if not isinstance(rows, list) or not rows:
            raise SupabaseError("ingest_runs insert returned no row")
        return str(rows[0]["id"])

    def finish_ingest_run(
        self,
        run_id: str,
        *,
        status: str,
        items_discovered: int,
        candidates_extracted: int,
        candidates_inserted: int,
        duplicates_skipped: int,
        error: str | None = None,
    ) -> None:
        now = datetime.now(timezone.utc).isoformat()
        payload: dict[str, object] = {
            "status": status,
            "finished_at": now,
            "items_discovered": items_discovered,
            "candidates_extracted": candidates_extracted,
            "candidates_inserted": candidates_inserted,
            "duplicates_skipped": duplicates_skipped,
        }
        if error:
            payload["error"] = error[:2000]
        self._patch(f"/rest/v1/ingest_runs?id=eq.{run_id}", payload)

    # ------------------------------------------------------------------
    # Source registration
    # ------------------------------------------------------------------

    def upsert_ingest_source(self, source: ScrapeSource) -> str:
        """Upsert an ingest_sources row and return its UUID."""
        rows = self._post(
            "/rest/v1/ingest_sources",
            {
                "platform": source.platform,
                "handle": source.handle,
                "source_url": source.url,
                "language_hint": source.language_hint,
                "priority": source.priority,
                "fetch_mode": source.fetch_mode,
                "status": "active",
            },
            prefer="return=representation,resolution=ignore-duplicates",
        )
        # If ignored (already exists), fetch it
        if not isinstance(rows, list) or not rows:
            return self._get_source_id(source.handle, source.platform)
        return str(rows[0]["id"])

    def _get_source_id(self, handle: str, platform: str) -> str:
        with httpx.Client(timeout=_TIMEOUT) as client:
            resp = client.get(
                f"{self._base}/rest/v1/ingest_sources",
                headers=self._headers,
                params={"handle": f"eq.{handle}", "platform": f"eq.{platform}", "select": "id"},
            )
        if not resp.is_success:
            raise SupabaseError(f"ingest_sources fetch failed [{resp.status_code}]: {resp.text}")
        rows = resp.json()
        if not isinstance(rows, list) or not rows:
            raise SupabaseError(f"ingest_source not found for {platform}/{handle}")
        return str(rows[0]["id"])

    # ------------------------------------------------------------------
    # Source items
    # ------------------------------------------------------------------

    def insert_source_item(
        self,
        *,
        run_id: str,
        source_id: str,
        platform_item_id: str,
        source_url: str,
        content_type: str,
        caption: str | None,
    ) -> str | None:
        """Insert an ingest_source_items row; returns its ID or None if duplicate."""
        try:
            rows = self._post(
                "/rest/v1/ingest_source_items",
                {
                    "ingest_run_id": run_id,
                    "ingest_source_id": source_id,
                    "platform_item_id": platform_item_id,
                    "source_url": source_url,
                    "content_type": content_type,
                    "caption": caption,
                    "processing_status": "discovered",
                },
                prefer="return=representation,resolution=ignore-duplicates",
            )
        except SupabaseError:
            return None
        if not isinstance(rows, list) or not rows:
            return None
        return str(rows[0]["id"])

    # ------------------------------------------------------------------
    # Candidates
    # ------------------------------------------------------------------

    def insert_candidate(self, candidate: JokeCandidate) -> bool:
        """
        Insert a joke_candidates row.
        Returns True if inserted, False if skipped (content_hash duplicate).
        """
        body = {
            "ingest_run_id": candidate.ingest_run_id,
            "ingest_source_id": candidate.ingest_source_id,
            "ingest_source_item_id": candidate.ingest_source_item_id,
            "question": candidate.question,
            "answer": candidate.answer,
            "language": candidate.language,
            "category": candidate.category,
            "difficulty": candidate.difficulty,
            "wrong_answers": json.dumps(candidate.wrong_answers),
            "tags": json.dumps(candidate.tags),
            "review_status": "pending",
            "content_hash": candidate.content_hash,
            "source_platform": candidate.source_platform,
            "source_handle": candidate.source_handle,
            "source_url": candidate.source_url,
            "transcript_snippet": candidate.transcript_snippet or None,
        }
        try:
            rows = self._post(
                "/rest/v1/joke_candidates",
                body,
                prefer="return=representation,resolution=ignore-duplicates",
            )
        except SupabaseError:
            return False
        # Empty list = duplicate skipped
        return isinstance(rows, list) and len(rows) > 0


def client_from_env() -> SupabaseClient:
    """Build a SupabaseClient from environment variables."""
    url = os.environ.get("SUPABASE_URL") or ""
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or ""
    return SupabaseClient(url, key)


def has_supabase_config() -> bool:
    url = os.environ.get("SUPABASE_URL") or ""
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or ""
    return bool(url and key)
