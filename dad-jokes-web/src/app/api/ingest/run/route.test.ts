import { beforeEach, describe, expect, it, vi } from "vitest";

const kvGet = vi.fn();
const kvSet = vi.fn();
const loadSourcesFromEnv = vi.fn();
const scrapePublicText = vi.fn();
const extractJokeCandidates = vi.fn();

vi.mock("@vercel/kv", () => ({
  kv: {
    get: kvGet,
    set: kvSet,
  },
}));

vi.mock("@/lib/ingest/sourceRegistry", () => ({
  loadSourcesFromEnv,
}));

vi.mock("@/lib/ingest/scrapePublicText", () => ({
  scrapePublicText,
}));

vi.mock("@/lib/ingest/extractJokeCandidates", () => ({
  extractJokeCandidates,
}));

function makeRequest(path = "http://localhost/api/ingest/run", headers?: HeadersInit): Request {
  return new Request(path, {
    method: "GET",
    headers,
  });
}

describe("GET /api/ingest/run", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.unstubAllEnvs();

    kvGet.mockResolvedValue(undefined);
    kvSet.mockResolvedValue(undefined);
    loadSourcesFromEnv.mockReturnValue([
      {
        id: "ig-bekarobar",
        platform: "instagram",
        label: "bekarobar",
        url: "https://example.com/bekarobar",
        language: "mixed",
        active: true,
      },
    ]);
    scrapePublicText.mockResolvedValue({
      source: loadSourcesFromEnv.mock.results[0]?.value?.[0],
      title: "Why did dad do that?",
      description: "A setup and punchline",
      text: "Why did the dad bring a ladder?\nTo reach new heights.",
      fetchedAt: "2026-04-13T00:00:00.000Z",
    });
    extractJokeCandidates.mockReturnValue([
      {
        id: "cand-123",
        question: "Why did the dad bring a ladder?",
        answer: "To reach new heights.",
        language: "english",
        category: "general",
        wrongAnswers: ["For painting", "No clue", "To nap"],
        source: "instagram:bekarobar",
        difficulty: 1,
        tags: ["general", "instagram"],
        likes: 0,
        shares: 0,
        sourceUrl: "https://example.com/bekarobar",
        sourceHandle: "bekarobar",
        sourcePlatform: "instagram",
        transcriptSnippet: "Why did the dad bring a ladder? To reach new heights.",
      },
    ]);
  });

  it("returns 401 when INGEST_CRON_SECRET is not configured (fail-closed)", async () => {
    vi.stubEnv("INGEST_CRON_SECRET", "");
    const { GET } = await import("./route");

    // Even with a header value present, an unconfigured secret must deny
    const res = await GET(
      makeRequest("http://localhost/api/ingest/run", { "x-ingest-secret": "anything" }) as never
    );

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({ ok: false, error: "Unauthorized" });
    expect(scrapePublicText).not.toHaveBeenCalled();
  });

  it("returns 401 when INGEST_CRON_SECRET is configured and header is missing", async () => {
    vi.stubEnv("INGEST_CRON_SECRET", "secret-123");
    const { GET } = await import("./route");

    const res = await GET(makeRequest() as never);

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({ ok: false, error: "Unauthorized" });
  });

  it("returns 401 when the secret header value is wrong", async () => {
    vi.stubEnv("INGEST_CRON_SECRET", "correct-secret");
    const { GET } = await import("./route");

    const res = await GET(
      makeRequest("http://localhost/api/ingest/run", { "x-ingest-secret": "wrong-secret" }) as never
    );

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({ ok: false, error: "Unauthorized" });
    expect(scrapePublicText).not.toHaveBeenCalled();
  });

  it("returns 401 when the secret header is an empty string", async () => {
    vi.stubEnv("INGEST_CRON_SECRET", "correct-secret");
    const { GET } = await import("./route");

    const res = await GET(
      makeRequest("http://localhost/api/ingest/run", { "x-ingest-secret": "" }) as never
    );

    expect(res.status).toBe(401);
    expect(scrapePublicText).not.toHaveBeenCalled();
  });

  it("excludes inactive sources from scraping", async () => {
    vi.stubEnv("INGEST_CRON_SECRET", "secret-123");
    loadSourcesFromEnv.mockReturnValue([
      {
        id: "ig-active",
        platform: "instagram",
        label: "active-account",
        url: "https://example.com/active",
        language: "english",
        active: true,
      },
      {
        id: "ig-inactive",
        platform: "instagram",
        label: "inactive-account",
        url: "https://example.com/inactive",
        language: "english",
        active: false,
      },
    ]);
    const { GET } = await import("./route");

    await GET(
      makeRequest("http://localhost/api/ingest/run?force=true", {
        "x-ingest-secret": "secret-123",
      }) as never
    );

    // Only the active source should be scraped
    expect(scrapePublicText).toHaveBeenCalledTimes(1);
    expect(scrapePublicText).toHaveBeenCalledWith(expect.objectContaining({ id: "ig-active" }));
  });

  it("filters sources by the ?source param", async () => {
    vi.stubEnv("INGEST_CRON_SECRET", "secret-123");
    loadSourcesFromEnv.mockReturnValue([
      { id: "ig-a", platform: "instagram", label: "account-a", url: "https://example.com/a", language: "english", active: true },
      { id: "ig-b", platform: "instagram", label: "account-b", url: "https://example.com/b", language: "english", active: true },
    ]);
    const { GET } = await import("./route");

    await GET(
      makeRequest("http://localhost/api/ingest/run?force=true&source=ig-a", {
        "x-ingest-secret": "secret-123",
      }) as never
    );

    expect(scrapePublicText).toHaveBeenCalledTimes(1);
    expect(scrapePublicText).toHaveBeenCalledWith(expect.objectContaining({ id: "ig-a" }));
  });

  it("continues scraping other sources when one source fails", async () => {
    vi.stubEnv("INGEST_CRON_SECRET", "secret-123");
    loadSourcesFromEnv.mockReturnValue([
      { id: "ig-ok", platform: "instagram", label: "ok-account", url: "https://example.com/ok", language: "english", active: true },
      { id: "ig-fail", platform: "instagram", label: "fail-account", url: "https://example.com/fail", language: "english", active: true },
    ]);
    scrapePublicText
      .mockResolvedValueOnce({ text: "A joke here", fetchedAt: new Date().toISOString() })
      .mockRejectedValueOnce(new Error("Scrape timeout"));
    const { GET } = await import("./route");

    const res = await GET(
      makeRequest("http://localhost/api/ingest/run?force=true", {
        "x-ingest-secret": "secret-123",
      }) as never
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.summary.successSources).toBe(1);
    expect(body.summary.failedSources).toBe(1);
    expect(body.scans).toHaveLength(2);
    expect(body.scans.find((s: { sourceId: string }) => s.sourceId === "ig-fail").ok).toBe(false);
    expect(body.scans.find((s: { sourceId: string }) => s.sourceId === "ig-fail").error).toBe("Scrape timeout");
  });

  it("falls back to in-memory state when KV read fails", async () => {
    vi.stubEnv("INGEST_CRON_SECRET", "secret-123");
    kvGet.mockRejectedValue(new Error("KV unavailable"));
    const { GET } = await import("./route");

    // With no lastRunAt (KV failed, memory empty), shouldRun → true
    const res = await GET(
      makeRequest("http://localhost/api/ingest/run", {
        "x-ingest-secret": "secret-123",
      }) as never
    );

    // Should still run despite KV failure
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.skipped).toBe(false);
  });

  it("caps candidates returned in the response body at 50", async () => {
    vi.stubEnv("INGEST_CRON_SECRET", "secret-123");
    const manyJokes = Array.from({ length: 75 }, (_, i) => ({
      id: `cand-${i}`,
      question: `Why number ${i}?`,
      answer: `Because ${i}.`,
      language: "english",
      category: "general",
      wrongAnswers: ["A", "B", "C"],
      tags: [],
    }));
    extractJokeCandidates.mockReturnValue(manyJokes);
    const { GET } = await import("./route");

    const res = await GET(
      makeRequest("http://localhost/api/ingest/run?force=true", {
        "x-ingest-secret": "secret-123",
      }) as never
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.summary.totalCandidates).toBe(75);
    expect(body.candidates).toHaveLength(50);
  });

  it("skips runs when the interval gate has not been reached", async () => {
    vi.stubEnv("INGEST_CRON_SECRET", "secret-123");
    kvGet.mockResolvedValue(new Date(Date.now() - 60 * 60 * 1000).toISOString());
    const { GET } = await import("./route");

    const res = await GET(
      makeRequest("http://localhost/api/ingest/run?interval=2", {
        "x-ingest-secret": "secret-123",
      }) as never
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      ok: true,
      skipped: true,
      reason: "Interval gate not reached",
      intervalDays: 2,
    });
    expect(scrapePublicText).not.toHaveBeenCalled();
    expect(kvSet).not.toHaveBeenCalled();
  });

  it("allows manual dry runs without persisting metadata", async () => {
    vi.stubEnv("INGEST_CRON_SECRET", "secret-123");
    kvGet.mockResolvedValue(new Date().toISOString());
    const { GET } = await import("./route");

    const res = await GET(
      makeRequest("http://localhost/api/ingest/run?manual=true&dryRun=true", {
        "x-ingest-secret": "secret-123",
      }) as never
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.skipped).toBe(false);
    expect(body.persisted).toBe(false);
    expect(body.summary.totalCandidates).toBe(1);
    expect(scrapePublicText).toHaveBeenCalledTimes(1);
    expect(kvSet).not.toHaveBeenCalled();
  });

  it("persists run metadata on successful non-dry runs", async () => {
    vi.stubEnv("INGEST_CRON_SECRET", "secret-123");
    const { GET } = await import("./route");

    const res = await GET(
      makeRequest("http://localhost/api/ingest/run?force=true", {
        "x-ingest-secret": "secret-123",
      }) as never
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.persisted).toBe(true);
    expect(body.summary.successSources).toBe(1);
    expect(kvSet).toHaveBeenCalledTimes(2);
    expect(kvSet).toHaveBeenNthCalledWith(1, "ingest:lastRunAt", expect.any(String));
    expect(kvSet).toHaveBeenNthCalledWith(
      2,
      "ingest:lastPayload",
      expect.objectContaining({
        totalCandidates: 1,
        sourceCount: 1,
      })
    );
  });
});
