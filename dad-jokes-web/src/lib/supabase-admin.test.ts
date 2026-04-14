import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  hasSupabaseAdminConfig,
  listPublishedJokes,
  getPublishedJokeById,
  listPendingJokeCandidates,
} from "./supabase-admin";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Mirrors the PostgREST joined shape:
//   joke_options — array of {text, is_correct}
//   joke_tags    — array of {tag}
//   joke_stats   — object {likes, shares}  (1:1 relationship)
function validRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 42,                                          // BIGINT from DB
    question: "Why did the scarecrow win an award?",
    answer: "Outstanding in his field.",
    language: "english",
    category: "pun",
    difficulty: 1,
    featured: false,
    joke_options: [
      { text: "Outstanding in his field.", is_correct: true },
      { text: "He cheated",               is_correct: false },
      { text: "Nobody knows",             is_correct: false },
      { text: "By luck",                  is_correct: false },
    ],
    joke_tags:  [{ tag: "pun" }, { tag: "classic" }],
    joke_stats: { likes: 5, shares: 2 },
    ...overrides,
  };
}

function mockFetchOk(rows: unknown[]) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve(rows),
    text: () => Promise.resolve(""),
  });
}

function mockFetchError(status = 500, body = "Internal error") {
  return vi.fn().mockResolvedValue({
    ok: false,
    status,
    json: () => Promise.resolve({}),
    text: () => Promise.resolve(body),
  });
}

// ---------------------------------------------------------------------------
// hasSupabaseAdminConfig
// ---------------------------------------------------------------------------

describe("hasSupabaseAdminConfig", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns false when both vars are absent", () => {
    expect(hasSupabaseAdminConfig()).toBe(false);
  });

  it("returns false when only SUPABASE_URL is set", () => {
    vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
    expect(hasSupabaseAdminConfig()).toBe(false);
  });

  it("returns false when only SUPABASE_SERVICE_ROLE_KEY is set", () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "secret");
    expect(hasSupabaseAdminConfig()).toBe(false);
  });

  it("returns true when both vars are set", () => {
    vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "secret");
    expect(hasSupabaseAdminConfig()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// normalizeJokeRow — tested through listPublishedJokes
// ---------------------------------------------------------------------------

describe("normalizeJokeRow (via listPublishedJokes)", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "secret");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function normalize(row: Record<string, unknown>) {
    vi.stubGlobal("fetch", mockFetchOk([row]));
    const results = await listPublishedJokes();
    return results[0] ?? null;
  }

  it("returns a valid joke for a well-formed row", async () => {
    const joke = await normalize(validRow());
    expect(joke).not.toBeNull();
    expect(joke!.id).toBe("42");           // BIGINT coerced to string
    expect(joke!.question).toBe("Why did the scarecrow win an award?");
    expect(joke!.language).toBe("english");
    expect(joke!.category).toBe("pun");
    expect(joke!.difficulty).toBe(1);
    expect(joke!.likes).toBe(5);
    expect(joke!.shares).toBe(2);
    expect(joke!.wrongAnswers).toEqual(["He cheated", "Nobody knows", "By luck"]);
    expect(joke!.tags).toEqual(["pun", "classic"]);
  });

  it("rejects row with empty id string", async () => {
    expect(await normalize(validRow({ id: "" }))).toBeNull();
  });

  it("rejects row with question shorter than 8 chars", async () => {
    expect(await normalize(validRow({ question: "Short?" }))).toBeNull();
  });

  it("rejects row with answer shorter than 3 chars", async () => {
    expect(await normalize(validRow({ answer: "No" }))).toBeNull();
  });

  it("rejects row with invalid language", async () => {
    expect(await normalize(validRow({ language: "french" }))).toBeNull();
  });

  it("rejects row with invalid category", async () => {
    expect(await normalize(validRow({ category: "meme" }))).toBeNull();
  });

  it("rejects row with difficulty 0", async () => {
    expect(await normalize(validRow({ difficulty: 0 }))).toBeNull();
  });

  it("rejects row with difficulty 4", async () => {
    expect(await normalize(validRow({ difficulty: 4 }))).toBeNull();
  });

  it("accepts hinglish language", async () => {
    const joke = await normalize(validRow({ language: "hinglish" }));
    expect(joke).not.toBeNull();
    expect(joke!.language).toBe("hinglish");
  });

  it("accepts all valid difficulty levels", async () => {
    for (const d of [1, 2, 3]) {
      const joke = await normalize(validRow({ difficulty: d }));
      expect(joke?.difficulty).toBe(d);
    }
  });

  it("caps wrong_answers to 3 items (from joke_options)", async () => {
    const manyOptions = [
      { text: "Outstanding in his field.", is_correct: true },
      ...["A", "B", "C", "D", "E"].map((t) => ({ text: t, is_correct: false })),
    ];
    const joke = await normalize(validRow({ joke_options: manyOptions }));
    expect(joke!.wrongAnswers).toHaveLength(3);
  });

  it("caps tags to 10 items (from joke_tags)", async () => {
    const manyTags = Array.from({ length: 15 }, (_, i) => ({ tag: `tag${i}` }));
    const joke = await normalize(validRow({ joke_tags: manyTags }));
    expect(joke!.tags).toHaveLength(10);
  });

  it("sets featured to false when not provided", async () => {
    const joke = await normalize(validRow({ featured: undefined }));
    expect(joke!.featured).toBe(false);
  });

  it("sets likes to 0 when joke_stats is missing", async () => {
    const joke = await normalize(validRow({ joke_stats: undefined }));
    expect(joke!.likes).toBe(0);
  });

  it("sets shares to 0 when joke_stats is missing", async () => {
    const joke = await normalize(validRow({ joke_stats: undefined }));
    expect(joke!.shares).toBe(0);
  });

  it("floors fractional likes/shares from joke_stats", async () => {
    const joke = await normalize(validRow({ joke_stats: { likes: 3.9, shares: 1.1 } }));
    expect(joke!.likes).toBe(3);
    expect(joke!.shares).toBe(1);
  });

  it("clamps negative likes/shares to 0", async () => {
    const joke = await normalize(validRow({ joke_stats: { likes: -5, shares: -2 } }));
    expect(joke!.likes).toBe(0);
    expect(joke!.shares).toBe(0);
  });

  it("handles joke_stats returned as a single-item array (older PostgREST)", async () => {
    const joke = await normalize(validRow({ joke_stats: [{ likes: 7, shares: 3 }] }));
    expect(joke!.likes).toBe(7);
    expect(joke!.shares).toBe(3);
  });

  // ---- sanitizeDbText behaviour ----

  it("strips C0 control chars from question", async () => {
    // \x01 is a C0 control char — should be removed
    const joke = await normalize(validRow({ question: "Why\x01 does this\x02 work?" }));
    expect(joke!.question).toBe("Why does this work?");
  });

  it("strips Unicode format chars (Cf) from answer", async () => {
    // \u200B zero-width space, \u202E RTL override — both Cf category
    const joke = await normalize(validRow({ answer: "Be\u200Bcause\u202E field." }));
    expect(joke!.answer).not.toContain("\u200B");
    expect(joke!.answer).not.toContain("\u202E");
  });

  it("collapses multiple whitespace to single space", async () => {
    const joke = await normalize(validRow({ question: "Why  does   this    work?" }));
    expect(joke!.question).toBe("Why does this work?");
  });

  it("trims leading and trailing whitespace", async () => {
    const joke = await normalize(validRow({ answer: "  Because reasons.  " }));
    expect(joke!.answer).toBe("Because reasons.");
  });

  it("truncates question to 300 chars", async () => {
    const longQ = "Q".repeat(400) + "?";
    const joke = await normalize(validRow({ question: longQ }));
    expect(joke!.question.length).toBeLessThanOrEqual(300);
  });

  it("truncates answer to 300 chars", async () => {
    const longA = "A".repeat(400);
    const joke = await normalize(validRow({ answer: longA }));
    expect(joke!.answer.length).toBeLessThanOrEqual(300);
  });

  it("accepts numeric (BIGINT) id and converts to string", async () => {
    const joke = await normalize(validRow({ id: 99 }));
    expect(joke).not.toBeNull();
    expect(joke!.id).toBe("99");
  });

  it("rejects null id", async () => {
    expect(await normalize(validRow({ id: null }))).toBeNull();
  });

  it("strips XSS-style unicode tricks from question text", async () => {
    // RTL override + ZWJ are Cf chars and should be removed
    const xssQuestion = "Why\u202Edid\u200Dthe\u200Bhacker attack?";
    const joke = await normalize(validRow({ question: xssQuestion }));
    expect(joke!.question).not.toMatch(/[\u202E\u200D\u200B]/);
  });

  it("preserves normal question text and punctuation", async () => {
    const joke = await normalize(validRow({ question: "Why can't you trust an atom?" }));
    expect(joke!.question).toBe("Why can't you trust an atom?");
  });

  it("filters out null text entries from joke_options wrong answers", async () => {
    const options = [
      { text: "Outstanding in his field.", is_correct: true },
      { text: null, is_correct: false },
      { text: "Valid wrong answer", is_correct: false },
    ];
    const joke = await normalize(validRow({ joke_options: options }));
    // null → sanitizeDbText("") filtered out
    expect(joke!.wrongAnswers.every((a) => a.length >= 1)).toBe(true);
  });

  it("filters out all bad rows and returns only valid ones", async () => {
    const badRow  = validRow({ language: "klingon" });
    const goodRow = validRow({ id: 100 });
    vi.stubGlobal("fetch", mockFetchOk([badRow, goodRow]));
    const results = await listPublishedJokes();
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("100");
  });
});

// ---------------------------------------------------------------------------
// listPublishedJokes
// ---------------------------------------------------------------------------

describe("listPublishedJokes", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("throws when Supabase config is missing", async () => {
    await expect(listPublishedJokes()).rejects.toThrow("Supabase admin configuration is missing");
  });

  it("throws on non-ok HTTP response", async () => {
    vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "secret");
    vi.stubGlobal("fetch", mockFetchError(500, "Internal error"));
    await expect(listPublishedJokes()).rejects.toThrow("Jokes query failed (status 500)");
  });

  it("throws when response is not an array", async () => {
    vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "secret");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ data: [] }) })
    );
    await expect(listPublishedJokes()).rejects.toThrow("invalid payload");
  });

  it("returns empty array when DB returns no rows", async () => {
    vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "secret");
    vi.stubGlobal("fetch", mockFetchOk([]));
    expect(await listPublishedJokes()).toEqual([]);
  });

  it("passes language filter in query when specified", async () => {
    vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "secret");
    const fetchMock = mockFetchOk([validRow()]);
    vi.stubGlobal("fetch", fetchMock);
    await listPublishedJokes({ language: "hinglish" });
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain("language=eq.hinglish");
  });

  it("caps limit at 200", async () => {
    vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "secret");
    const fetchMock = mockFetchOk([]);
    vi.stubGlobal("fetch", fetchMock);
    await listPublishedJokes({ limit: 999 });
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain("limit=200");
  });

  it("sends Authorization and apikey headers", async () => {
    vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "my-service-key");
    const fetchMock = mockFetchOk([]);
    vi.stubGlobal("fetch", fetchMock);
    await listPublishedJokes();
    const opts = fetchMock.mock.calls[0][1] as RequestInit & { headers: Record<string, string> };
    expect(opts.headers["Authorization"]).toBe("Bearer my-service-key");
    expect(opts.headers["apikey"]).toBe("my-service-key");
  });
});

// ---------------------------------------------------------------------------
// getPublishedJokeById
// ---------------------------------------------------------------------------

describe("getPublishedJokeById", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns null when Supabase config is missing", async () => {
    expect(await getPublishedJokeById("some-id")).toBeNull();
  });

  it("returns null on non-ok HTTP response", async () => {
    vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "secret");
    vi.stubGlobal("fetch", mockFetchError(404));
    expect(await getPublishedJokeById("missing-id")).toBeNull();
  });

  it("returns null when row array is empty", async () => {
    vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "secret");
    vi.stubGlobal("fetch", mockFetchOk([]));
    expect(await getPublishedJokeById("ghost-id")).toBeNull();
  });

  it("returns null when the row fails normalization", async () => {
    vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "secret");
    vi.stubGlobal("fetch", mockFetchOk([validRow({ language: "klingon" })]));
    expect(await getPublishedJokeById("bad-row")).toBeNull();
  });

  it("returns a normalized DadJoke on success", async () => {
    vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "secret");
    vi.stubGlobal("fetch", mockFetchOk([validRow()]));
    const joke = await getPublishedJokeById("42");
    expect(joke).not.toBeNull();
    expect(joke!.id).toBe("42");    // BIGINT 42 → string "42"
  });

  it("sanitizes control chars in the fetched joke", async () => {
    vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "secret");
    vi.stubGlobal("fetch", mockFetchOk([validRow({ question: "Why\x01 does\x02 it work?" })]));
    const joke = await getPublishedJokeById("42");
    expect(joke!.question).toBe("Why does it work?");
  });
});

// ---------------------------------------------------------------------------
// listPendingJokeCandidates — normalizeCandidate sanitization
// ---------------------------------------------------------------------------

function validCandidateRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "cand-abcd1234",
    question: "Why did dad do it?",
    answer: "Because he could.",
    language: "english",
    category: "general",
    difficulty: 1,
    wrong_answers: ["A", "B", "C"],
    tags: ["general"],
    review_status: "pending",
    review_notes: null,
    source_platform: "instagram",
    source_handle: "bekarobar",
    source_url: "https://example.com/post",
    transcript_snippet: null,
    promoted_joke_id: null,
    created_at: "2026-04-14T00:00:00.000Z",
    ...overrides,
  };
}

describe("listPendingJokeCandidates", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("throws when Supabase config is missing", async () => {
    await expect(listPendingJokeCandidates()).rejects.toThrow("Supabase admin configuration is missing");
  });

  it("strips control characters from candidate fields", async () => {
    vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "secret");
    vi.stubGlobal(
      "fetch",
      mockFetchOk([validCandidateRow({ question: "Why\x01did\x02dad?", answer: "Because\x00." })])
    );
    const candidates = await listPendingJokeCandidates();
    // Control chars are stripped but surrounding text joins without spaces
    expect(candidates[0].question).toBe("Whydiddad?");
    expect(candidates[0].answer).toBe("Because.");
  });

  it("sanitizes wrong_answers items", async () => {
    vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "secret");
    vi.stubGlobal(
      "fetch",
      mockFetchOk([validCandidateRow({ wrong_answers: ["Good\x01answer", "Bad\x02one"] })])
    );
    const candidates = await listPendingJokeCandidates();
    expect(candidates[0].wrongAnswers).toEqual(["Goodanswer", "Badone"]);
  });

  it("falls back to 'english' for unknown language value", async () => {
    vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "secret");
    vi.stubGlobal("fetch", mockFetchOk([validCandidateRow({ language: "klingon" })]));
    const candidates = await listPendingJokeCandidates();
    expect(candidates[0].language).toBe("english");
  });

  it("falls back to 'general' for unknown category value", async () => {
    vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "secret");
    vi.stubGlobal("fetch", mockFetchOk([validCandidateRow({ category: "badcat" })]));
    const candidates = await listPendingJokeCandidates();
    expect(candidates[0].category).toBe("general");
  });

  it("falls back to 'pending' for unknown reviewStatus", async () => {
    vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "secret");
    vi.stubGlobal("fetch", mockFetchOk([validCandidateRow({ review_status: "unknown" })]));
    const candidates = await listPendingJokeCandidates();
    expect(candidates[0].reviewStatus).toBe("pending");
  });

  it("falls back to 'other' for unknown sourcePlatform", async () => {
    vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "secret");
    vi.stubGlobal("fetch", mockFetchOk([validCandidateRow({ source_platform: "tiktok" })]));
    const candidates = await listPendingJokeCandidates();
    expect(candidates[0].sourcePlatform).toBe("other");
  });

  it("falls back difficulty to 1 for out-of-range value", async () => {
    vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "secret");
    vi.stubGlobal("fetch", mockFetchOk([validCandidateRow({ difficulty: 99 })]));
    const candidates = await listPendingJokeCandidates();
    expect(candidates[0].difficulty).toBe(1);
  });

  it("returns parsed candidates on success", async () => {
    vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "secret");
    vi.stubGlobal("fetch", mockFetchOk([validCandidateRow()]));
    const candidates = await listPendingJokeCandidates();
    expect(candidates).toHaveLength(1);
    expect(candidates[0].id).toBe("cand-abcd1234");
    expect(candidates[0].question).toBe("Why did dad do it?");
  });

  it("throws on non-ok HTTP response", async () => {
    vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "secret");
    vi.stubGlobal("fetch", mockFetchError(503, "Overloaded"));
    await expect(listPendingJokeCandidates()).rejects.toThrow("Candidate query failed (status 503)");
  });
});
