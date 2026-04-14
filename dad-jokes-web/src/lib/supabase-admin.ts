import type { DadJoke, JokeCandidate, JokeCategory, Language } from "./types";

// ---------------------------------------------------------------------------
// Output sanitization — applied to every DB row before it leaves this module.
//
// Defense-in-depth layer 3 (after ingest normalizer.py and Postgres CHECK).
// Covers: manual Supabase dashboard inserts, future pipelines that bypass
// normalizer.py, and any ingest bug that lets a bad string through.
//
// Strips C0/C1 control chars and Unicode format characters (Cf category) —
// the same set that normalizer.py _sanitize_text() removes in Python.
// ---------------------------------------------------------------------------

const CONTROL_CHAR_RE =
  /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g;

function sanitizeDbText(raw: unknown, maxLen: number): string {
  if (typeof raw !== "string") return "";
  return raw
    .replace(CONTROL_CHAR_RE, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen);
}

const VALID_LANGUAGES  = new Set<string>(["english", "hinglish"]);
const VALID_CATEGORIES = new Set<string>([
  "pun", "wordplay", "classic", "science",
  "food", "animal", "tech", "general", "adult",
]);
const VALID_DIFFICULTIES = new Set<number>([1, 2, 3]);

/**
 * Validate and sanitize a raw Supabase `jokes` row (with PostgREST joins)
 * into a typed DadJoke. Returns null when any invariant fails.
 *
 * Expected joined shape from PostgREST:
 *   joke_options: [{text, is_correct}]   — wrong answers are is_correct=false
 *   joke_tags:    [{tag}]
 *   joke_stats:   {likes, shares}        — 1:1, may come as object or array
 */
function normalizeJokeRow(row: Record<string, unknown>): DadJoke | null {
  // id is BIGINT in the DB — JSON serialises it as a number
  const id = typeof row.id === "number"
    ? String(row.id)
    : sanitizeDbText(row.id, 64);

  const question   = sanitizeDbText(row.question, 300);
  const answer     = sanitizeDbText(row.answer, 300);
  const language   = typeof row.language === "string" ? row.language : "";
  const category   = typeof row.category === "string" ? row.category : "";
  const difficulty = Number(row.difficulty);

  // Hard invariants — reject the row entirely if any fail
  if (!id || question.length < 8 || answer.length < 3) return null;
  if (!VALID_LANGUAGES.has(language))      return null;
  if (!VALID_CATEGORIES.has(category))     return null;
  if (!VALID_DIFFICULTIES.has(difficulty)) return null;

  // wrong_answers — from joined joke_options (is_correct = false)
  const options = Array.isArray(row.joke_options)
    ? (row.joke_options as Record<string, unknown>[])
    : [];
  const wrongAnswers = options
    .filter((o) => o.is_correct === false)
    .slice(0, 3)
    .map((o) => sanitizeDbText(o.text, 200))
    .filter((v) => v.length >= 1);

  // tags — from joined joke_tags
  const tagRows = Array.isArray(row.joke_tags)
    ? (row.joke_tags as Record<string, unknown>[])
    : [];
  const tags = tagRows
    .slice(0, 10)
    .map((t) => sanitizeDbText(t.tag, 50))
    .filter(Boolean);

  // stats — joke_stats is 1:1; PostgREST may return object or single-item array
  const statsRaw = Array.isArray(row.joke_stats)
    ? ((row.joke_stats as Record<string, unknown>[])[0] ?? {})
    : (typeof row.joke_stats === "object" && row.joke_stats !== null
        ? (row.joke_stats as Record<string, unknown>)
        : {});
  const likes  = typeof statsRaw.likes  === "number" ? Math.max(0, Math.floor(statsRaw.likes))  : 0;
  const shares = typeof statsRaw.shares === "number" ? Math.max(0, Math.floor(statsRaw.shares)) : 0;

  return {
    id,
    question,
    answer,
    language:   language as Language,
    category:   category as JokeCategory,
    difficulty: difficulty as 1 | 2 | 3,
    wrongAnswers,
    tags,
    featured: row.featured === true,
    likes,
    shares,
  };
}

// ---------------------------------------------------------------------------
// Public joke fetch functions — server-side only (service role key)
// ---------------------------------------------------------------------------

export async function listPublishedJokes(params?: {
  language?: "english" | "hinglish";
  limit?: number;
}): Promise<DadJoke[]> {
  const supabaseUrl    = getSupabaseUrl();
  const serviceRoleKey = getServiceRoleKey();
  if (!supabaseUrl || !serviceRoleKey) throw new Error("Supabase admin configuration is missing");

  const limit = Math.min(params?.limit ?? 100, 200);
  const query = new URLSearchParams({
    select: "id,question,answer,language,category,difficulty,featured,joke_options(text,is_correct),joke_tags(tag),joke_stats(likes,shares)",
    status:     "eq.approved",
    is_deleted: "eq.false",
    order:      "created_at.desc",
    limit:      String(limit),
  });
  if (params?.language) query.set("language", `eq.${params.language}`);

  const res = await fetch(`${supabaseUrl}/rest/v1/jokes?${query.toString()}`, {
    headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Jokes query failed (status ${res.status})`);
  }

  const rows = await res.json();
  if (!Array.isArray(rows)) throw new Error("Jokes query returned invalid payload");

  return rows
    .map((r) => normalizeJokeRow(r as Record<string, unknown>))
    .filter((j): j is DadJoke => j !== null);
}

export async function getPublishedJokeById(id: string): Promise<DadJoke | null> {
  const supabaseUrl    = getSupabaseUrl();
  const serviceRoleKey = getServiceRoleKey();
  if (!supabaseUrl || !serviceRoleKey) return null;

  const query = new URLSearchParams({
    select: "id,question,answer,language,category,difficulty,featured,joke_options(text,is_correct),joke_tags(tag),joke_stats(likes,shares)",
    id:         `eq.${id}`,
    status:     "eq.approved",
    is_deleted: "eq.false",
    limit:      "1",
  });

  const res = await fetch(`${supabaseUrl}/rest/v1/jokes?${query.toString()}`, {
    headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
    next: { revalidate: 300 },
  });

  if (!res.ok) return null;
  const rows = await res.json();
  if (!Array.isArray(rows) || rows.length === 0) return null;
  return normalizeJokeRow(rows[0] as Record<string, unknown>);
}

function getSupabaseUrl(): string {
  return process.env.SUPABASE_URL ?? "";
}

function getServiceRoleKey(): string {
  return process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
}

export function hasSupabaseAdminConfig(): boolean {
  return Boolean(getSupabaseUrl() && getServiceRoleKey());
}

export async function promoteJokeCandidate(candidateId: string): Promise<number> {
  const supabaseUrl = getSupabaseUrl();
  const serviceRoleKey = getServiceRoleKey();

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase admin configuration is missing");
  }

  const res = await fetch(`${supabaseUrl}/rest/v1/rpc/fn_promote_joke_candidate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
    body: JSON.stringify({ p_candidate_id: candidateId }),
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Promote operation failed (status ${res.status})`);
  }

  const result = await res.json();
  if (typeof result !== "number") {
    throw new Error("Promote operation returned an invalid joke id");
  }

  return result;
}

export async function rejectJokeCandidate(candidateId: string, reviewNotes?: string): Promise<void> {
  const supabaseUrl = getSupabaseUrl();
  const serviceRoleKey = getServiceRoleKey();

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase admin configuration is missing");
  }

  const res = await fetch(`${supabaseUrl}/rest/v1/rpc/fn_reject_joke_candidate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
    body: JSON.stringify({
      p_candidate_id: candidateId,
      p_review_notes: reviewNotes ?? null,
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Reject operation failed (status ${res.status})`);
  }
}

const VALID_REVIEW_STATUSES = new Set<string>(["pending", "approved", "rejected"]);
const VALID_SOURCE_PLATFORMS = new Set<string>(["instagram", "youtube", "twitter", "other"]);
const VALID_CANDIDATE_DIFFICULTIES = new Set<number>([1, 2, 3]);

function normalizeCandidate(row: Record<string, unknown>): JokeCandidate {
  const difficulty = Number(row.difficulty ?? 1);
  const reviewStatusRaw = typeof row.review_status === "string" ? row.review_status : "pending";
  const sourcePlatformRaw = typeof row.source_platform === "string" ? row.source_platform : "other";

  const question = sanitizeDbText(row.question, 300);
  const answer = sanitizeDbText(row.answer, 300);
  // Mirror normalizeJokeRow's minimum-length invariant for defense-in-depth
  if (question.length < 8 || answer.length < 3) {
    // Return a placeholder rather than crashing — candidates are admin-reviewed anyway
    return {
      id: sanitizeDbText(row.id, 64) || String(row.id),
      question: question || "(empty question)",
      answer: answer || "(empty answer)",
      language: row.language === "hinglish" ? "hinglish" : "english",
      category: "general",
      difficulty: 1,
      wrongAnswers: [],
      tags: [],
      reviewStatus: "pending",
      reviewNotes: "Warning: question or answer too short — review before approving",
      sourcePlatform: "other",
      sourceHandle: null,
      sourceUrl: sanitizeDbText(row.source_url, 500),
      transcriptSnippet: null,
      promotedJokeId: null,
      createdAt: sanitizeDbText(row.created_at, 64),
    };
  }

  return {
    id: sanitizeDbText(row.id, 64) || String(row.id),
    question,
    answer,
    language: row.language === "hinglish" ? "hinglish" : "english",
    category: VALID_CATEGORIES.has(String(row.category ?? "")) ? (String(row.category) as JokeCandidate["category"]) : "general",
    difficulty: (VALID_CANDIDATE_DIFFICULTIES.has(difficulty) ? difficulty : 1) as 1 | 2 | 3,
    wrongAnswers: Array.isArray(row.wrong_answers)
      ? row.wrong_answers.map((value) => sanitizeDbText(value, 200)).filter(Boolean)
      : [],
    tags: Array.isArray(row.tags)
      ? row.tags.map((value) => sanitizeDbText(value, 50)).filter(Boolean)
      : [],
    reviewStatus: (VALID_REVIEW_STATUSES.has(reviewStatusRaw) ? reviewStatusRaw : "pending") as JokeCandidate["reviewStatus"],
    reviewNotes: row.review_notes == null ? null : sanitizeDbText(row.review_notes, 1000),
    sourcePlatform: (VALID_SOURCE_PLATFORMS.has(sourcePlatformRaw) ? sourcePlatformRaw : "other") as JokeCandidate["sourcePlatform"],
    sourceHandle: row.source_handle == null ? null : sanitizeDbText(row.source_handle, 100),
    sourceUrl: sanitizeDbText(row.source_url, 500),
    transcriptSnippet: row.transcript_snippet == null ? null : sanitizeDbText(row.transcript_snippet, 500),
    promotedJokeId: typeof row.promoted_joke_id === "number" ? row.promoted_joke_id : null,
    createdAt: sanitizeDbText(row.created_at, 64),
  };
}

export async function listPendingJokeCandidates(limit = 25): Promise<JokeCandidate[]> {
  const supabaseUrl = getSupabaseUrl();
  const serviceRoleKey = getServiceRoleKey();

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase admin configuration is missing");
  }

  const query = new URLSearchParams({
    select: [
      "id",
      "question",
      "answer",
      "language",
      "category",
      "difficulty",
      "wrong_answers",
      "tags",
      "review_status",
      "review_notes",
      "source_platform",
      "source_handle",
      "source_url",
      "transcript_snippet",
      "promoted_joke_id",
      "created_at",
    ].join(","),
    review_status: "eq.pending",
    order: "created_at.desc",
    limit: String(limit),
  });

  const res = await fetch(`${supabaseUrl}/rest/v1/joke_candidates?${query.toString()}`, {
    method: "GET",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Candidate query failed (status ${res.status})`);
  }

  const rows = await res.json();
  if (!Array.isArray(rows)) {
    throw new Error("Candidate query returned an invalid payload");
  }

  return rows.map((row) => normalizeCandidate(row as Record<string, unknown>));
}

export async function updateJokeCandidate(
  candidateId: string,
  updates: Pick<JokeCandidate, "question" | "answer" | "category" | "difficulty" | "wrongAnswers" | "tags">
): Promise<JokeCandidate> {
  const supabaseUrl = getSupabaseUrl();
  const serviceRoleKey = getServiceRoleKey();

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase admin configuration is missing");
  }

  const query = new URLSearchParams({
    id: `eq.${candidateId}`,
    select: [
      "id",
      "question",
      "answer",
      "language",
      "category",
      "difficulty",
      "wrong_answers",
      "tags",
      "review_status",
      "review_notes",
      "source_platform",
      "source_handle",
      "source_url",
      "transcript_snippet",
      "promoted_joke_id",
      "created_at",
    ].join(","),
  });

  const res = await fetch(`${supabaseUrl}/rest/v1/joke_candidates?${query.toString()}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Prefer: "return=representation",
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
    body: JSON.stringify({
      question: updates.question,
      answer: updates.answer,
      category: updates.category,
      difficulty: updates.difficulty,
      wrong_answers: updates.wrongAnswers,
      tags: updates.tags,
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Candidate update failed (status ${res.status})`);
  }

  const rows = await res.json();
  if (!Array.isArray(rows) || rows.length !== 1) {
    throw new Error("Candidate update returned an invalid payload");
  }

  return normalizeCandidate(rows[0] as Record<string, unknown>);
}
