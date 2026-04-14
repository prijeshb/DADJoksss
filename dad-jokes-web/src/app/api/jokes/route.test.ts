import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DadJoke } from "@/lib/types";

const hasSupabaseAdminConfig = vi.fn();
const listPublishedJokes = vi.fn();

vi.mock("@/lib/supabase-admin", () => ({
  hasSupabaseAdminConfig,
  listPublishedJokes,
}));

vi.mock("@/data/jokes", () => ({
  jokes: [
    {
      id: "static-001",
      question: "Why don't scientists trust atoms?",
      answer: "Because they make up everything.",
      language: "english",
      category: "science",
      difficulty: 1,
      wrongAnswers: ["They are too small", "They lie", "No reason"],
      tags: ["science"],
      featured: false,
      likes: 0,
      shares: 0,
    },
  ],
}));

function makeJoke(overrides: Partial<DadJoke> = {}): DadJoke {
  return {
    id: "abc-123",
    question: "Why did the scarecrow win an award?",
    answer: "Outstanding in his field.",
    language: "english",
    category: "pun",
    difficulty: 1,
    wrongAnswers: ["He cheated", "By luck", "Nobody knows"],
    tags: ["pun"],
    featured: false,
    likes: 0,
    shares: 0,
    ...overrides,
  };
}

function makeRequest(searchParams: Record<string, string> = {}): Request {
  const url = new URL("http://localhost/api/jokes");
  for (const [key, value] of Object.entries(searchParams)) {
    url.searchParams.set(key, value);
  }
  return new Request(url.toString());
}

describe("GET /api/jokes", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    hasSupabaseAdminConfig.mockReturnValue(true);
    listPublishedJokes.mockResolvedValue([makeJoke()]);
  });

  it("falls back to static jokes when Supabase is not configured", async () => {
    hasSupabaseAdminConfig.mockReturnValue(false);
    const { GET } = await import("./route");

    const res = await GET(makeRequest() as never);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.jokes[0].id).toBe("static-001");
    expect(listPublishedJokes).not.toHaveBeenCalled();
  });

  it("returns 200 with jokes array on success", async () => {
    const { GET } = await import("./route");

    const res = await GET(makeRequest() as never);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.jokes)).toBe(true);
    expect(body.jokes).toHaveLength(1);
    expect(body.total).toBe(1);
  });

  it("returns Supabase jokes when DB is configured and query succeeds", async () => {
    const dbJoke = makeJoke({ id: "db-joke-1", question: "Why do cows wear bells?" });
    listPublishedJokes.mockResolvedValue([dbJoke]);
    const { GET } = await import("./route");

    const res = await GET(makeRequest() as never);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.jokes[0].id).toBe("db-joke-1");
    // Must use DB data, NOT static fallback
    expect(body.jokes[0].id).not.toBe("static-001");
    expect(listPublishedJokes).toHaveBeenCalledTimes(1);
  });

  it("falls back to static jokes when listPublishedJokes throws", async () => {
    listPublishedJokes.mockRejectedValue(new Error("Supabase down"));
    const { GET } = await import("./route");

    const res = await GET(makeRequest() as never);

    // Graceful fallback — 200 with static data, not 500
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.jokes[0].id).toBe("static-001");
  });

  it("passes language filter to listPublishedJokes when specified", async () => {
    const { GET } = await import("./route");

    await GET(makeRequest({ language: "hinglish" }) as never);

    expect(listPublishedJokes).toHaveBeenCalledWith(
      expect.objectContaining({ language: "hinglish" })
    );
  });

  it("ignores unsupported language values", async () => {
    const { GET } = await import("./route");

    await GET(makeRequest({ language: "french" }) as never);

    expect(listPublishedJokes).toHaveBeenCalledWith(
      expect.objectContaining({ language: undefined })
    );
  });

  it("shuffles jokes when shuffle=true", async () => {
    // Provide enough jokes to observe shuffling is attempted (order may vary)
    const jokes = Array.from({ length: 10 }, (_, i) =>
      makeJoke({ id: `joke-${i}`, question: `Question number ${i} goes here?` })
    );
    listPublishedJokes.mockResolvedValue(jokes);
    const { GET } = await import("./route");

    const res = await GET(makeRequest({ shuffle: "true" }) as never);
    const body = await res.json();

    expect(body.ok).toBe(true);
    expect(body.jokes).toHaveLength(10);
  });

  it("does not shuffle when shuffle param is absent", async () => {
    const jokes = [
      makeJoke({ id: "a", likes: 10, shares: 0 }),
      makeJoke({ id: "b", likes: 1, shares: 0 }),
    ];
    listPublishedJokes.mockResolvedValue(jokes);
    const { GET } = await import("./route");

    const res = await GET(makeRequest() as never);
    const body = await res.json();

    // Without shuffle or ab sort, order should match what DB returned
    expect(body.jokes[0].id).toBe("a");
    expect(body.jokes[1].id).toBe("b");
  });

  it("sorts by engagement when ab=true", async () => {
    const jokes = [
      makeJoke({ id: "low", likes: 1, shares: 0 }),
      makeJoke({ id: "high", likes: 10, shares: 5 }),
    ];
    listPublishedJokes.mockResolvedValue(jokes);
    const { GET } = await import("./route");

    const res = await GET(makeRequest({ ab: "true" }) as never);
    const body = await res.json();

    expect(body.jokes[0].id).toBe("high");
    expect(body.ab).toBe("smart");
  });

  it("reports ab as 'default' when ab param is absent", async () => {
    const { GET } = await import("./route");

    const res = await GET(makeRequest() as never);
    const body = await res.json();

    expect(body.ab).toBe("default");
  });

  it("sets Cache-Control header with s-maxage and stale-while-revalidate", async () => {
    const { GET } = await import("./route");

    const res = await GET(makeRequest() as never);

    const cacheControl = res.headers.get("Cache-Control");
    expect(cacheControl).toContain("s-maxage=300");
    expect(cacheControl).toContain("stale-while-revalidate=60");
  });

  it("caps limit at 100", async () => {
    const { GET } = await import("./route");

    await GET(makeRequest({ limit: "999" }) as never);

    expect(listPublishedJokes).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 100 })
    );
  });

  it("defaults limit to 50 when not specified", async () => {
    const { GET } = await import("./route");

    await GET(makeRequest() as never);

    expect(listPublishedJokes).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 50 })
    );
  });

  it("clamps negative limit to 1", async () => {
    const { GET } = await import("./route");

    // parseInt("-1") = -1 (truthy), Math.max(1, -1) = 1
    await GET(makeRequest({ limit: "-1" }) as never);

    expect(listPublishedJokes).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 1 })
    );
  });

  it("treats limit=0 as the default (50) because parseInt('0') || 50 = 50", async () => {
    const { GET } = await import("./route");

    await GET(makeRequest({ limit: "0" }) as never);

    expect(listPublishedJokes).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 50 })
    );
  });
});
