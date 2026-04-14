import { beforeEach, describe, expect, it, vi } from "vitest";
import { computeSessionToken } from "@/lib/dashboard-auth";

const cookiesMock = vi.fn();
const hasSupabaseAdminConfig = vi.fn();
const rejectJokeCandidate = vi.fn();
const updateJokeCandidate = vi.fn();

vi.mock("next/headers", () => ({
  cookies: cookiesMock,
}));

vi.mock("@/lib/supabase-admin", () => ({
  hasSupabaseAdminConfig,
  rejectJokeCandidate,
  updateJokeCandidate,
}));

function makeCookieStore(session?: string) {
  return {
    get: vi.fn((name: string) => {
      if (name !== "dash_session" || !session) return undefined;
      return { value: session };
    }),
  };
}

function makePatchRequest(body: unknown): Request {
  return new Request("http://localhost/api/joke-candidates/550e8400-e29b-41d4-a716-446655440001", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

function makeDeleteRequest(): Request {
  return new Request("http://localhost/api/joke-candidates/550e8400-e29b-41d4-a716-446655440001?reviewNotes=duplicate", {
    method: "DELETE",
  });
}

describe("/api/joke-candidates/[id]", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    hasSupabaseAdminConfig.mockReturnValue(true);
    rejectJokeCandidate.mockResolvedValue(undefined);
    updateJokeCandidate.mockResolvedValue(undefined);
  });

  it("PATCH returns 401 without dashboard session", async () => {
    cookiesMock.mockResolvedValue(makeCookieStore());
    vi.stubEnv("DASHBOARD_PIN", "1234");
    const { PATCH } = await import("./route");

    const res = await PATCH(makePatchRequest({}) as never, {
      params: Promise.resolve({ id: "550e8400-e29b-41d4-a716-446655440001" }),
    });

    expect(res.status).toBe(401);
  });

  it("PATCH validates wrong answers and returns 400", async () => {
    const pin = "1234";
    vi.stubEnv("DASHBOARD_PIN", pin);
    cookiesMock.mockResolvedValue(makeCookieStore(computeSessionToken(pin)));
    const { PATCH } = await import("./route");

    const res = await PATCH(
      makePatchRequest({
        question: "Why did dad bring a ladder?",
        answer: "To reach new heights.",
        category: "general",
        difficulty: 1,
        wrongAnswers: ["To reach new heights.", "No clue", "For fun"],
        tags: ["general"],
      }) as never,
      { params: Promise.resolve({ id: "550e8400-e29b-41d4-a716-446655440001" }) }
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      ok: false,
      error: "Wrong answers cannot match the answer",
    });
  });

  it("PATCH updates and returns the candidate", async () => {
    const pin = "1234";
    vi.stubEnv("DASHBOARD_PIN", pin);
    cookiesMock.mockResolvedValue(makeCookieStore(computeSessionToken(pin)));
    updateJokeCandidate.mockResolvedValue({
      id: "550e8400-e29b-41d4-a716-446655440001",
      question: "Why did dad bring a ladder?",
      answer: "To reach new heights.",
      language: "english",
      category: "general",
      difficulty: 1,
      wrongAnswers: ["For painting", "To nap", "No clue"],
      tags: ["general"],
      reviewStatus: "pending",
      reviewNotes: null,
      sourcePlatform: "instagram",
      sourceHandle: "bekarobar",
      sourceUrl: "https://example.com/post",
      transcriptSnippet: null,
      promotedJokeId: null,
      createdAt: "2026-04-13T00:00:00.000Z",
    });
    const { PATCH } = await import("./route");

    const res = await PATCH(
      makePatchRequest({
        question: "Why did dad bring a ladder?",
        answer: "To reach new heights.",
        category: "general",
        difficulty: 1,
        wrongAnswers: ["For painting", "To nap", "No clue"],
        tags: ["General", "Fun"],
      }) as never,
      { params: Promise.resolve({ id: "550e8400-e29b-41d4-a716-446655440001" }) }
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      ok: true,
      candidate: expect.objectContaining({
        id: "550e8400-e29b-41d4-a716-446655440001",
        answer: "To reach new heights.",
      }),
    });
    expect(updateJokeCandidate).toHaveBeenCalledWith(
      "550e8400-e29b-41d4-a716-446655440001",
      expect.objectContaining({
        tags: ["general", "fun"],
      })
    );
  });

  it("PATCH returns 400 for a non-UUID candidate id", async () => {
    const pin = "1234";
    vi.stubEnv("DASHBOARD_PIN", pin);
    cookiesMock.mockResolvedValue(makeCookieStore(computeSessionToken(pin)));
    const { PATCH } = await import("./route");

    const res = await PATCH(
      new Request("http://localhost/api/joke-candidates/not-a-uuid", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }) as never,
      { params: Promise.resolve({ id: "not-a-uuid" }) }
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ ok: false, error: "Invalid candidate id" });
  });

  it("DELETE returns 400 when reviewNotes exceeds 1000 chars", async () => {
    const pin = "1234";
    vi.stubEnv("DASHBOARD_PIN", pin);
    cookiesMock.mockResolvedValue(makeCookieStore(computeSessionToken(pin)));
    const { DELETE } = await import("./route");

    const longNotes = "x".repeat(1001);
    const res = await DELETE(
      new Request(
        `http://localhost/api/joke-candidates/550e8400-e29b-41d4-a716-446655440001?reviewNotes=${longNotes}`,
        { method: "DELETE" }
      ) as never,
      { params: Promise.resolve({ id: "550e8400-e29b-41d4-a716-446655440001" }) }
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ ok: false, error: "reviewNotes too long" });
  });

  it("DELETE returns 400 for a non-UUID candidate id", async () => {
    const pin = "1234";
    vi.stubEnv("DASHBOARD_PIN", pin);
    cookiesMock.mockResolvedValue(makeCookieStore(computeSessionToken(pin)));
    const { DELETE } = await import("./route");

    const res = await DELETE(
      new Request("http://localhost/api/joke-candidates/legacy-001?reviewNotes=dup", {
        method: "DELETE",
      }) as never,
      { params: Promise.resolve({ id: "legacy-001" }) }
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ ok: false, error: "Invalid candidate id" });
  });

  it("PATCH returns 401 when DASHBOARD_PIN is not configured", async () => {
    vi.stubEnv("DASHBOARD_PIN", "");
    cookiesMock.mockResolvedValue(makeCookieStore(computeSessionToken("1234")));
    const { PATCH } = await import("./route");

    const res = await PATCH(makePatchRequest({}) as never, {
      params: Promise.resolve({ id: "550e8400-e29b-41d4-a716-446655440001" }),
    });

    expect(res.status).toBe(401);
    expect(updateJokeCandidate).not.toHaveBeenCalled();
  });

  it("PATCH returns 401 when session token is tampered", async () => {
    vi.stubEnv("DASHBOARD_PIN", "1234");
    cookiesMock.mockResolvedValue(makeCookieStore("a".repeat(64)));
    const { PATCH } = await import("./route");

    const res = await PATCH(makePatchRequest({}) as never, {
      params: Promise.resolve({ id: "550e8400-e29b-41d4-a716-446655440001" }),
    });

    expect(res.status).toBe(401);
    expect(updateJokeCandidate).not.toHaveBeenCalled();
  });

  it("PATCH returns 503 when Supabase config is missing", async () => {
    const pin = "1234";
    vi.stubEnv("DASHBOARD_PIN", pin);
    cookiesMock.mockResolvedValue(makeCookieStore(computeSessionToken(pin)));
    hasSupabaseAdminConfig.mockReturnValue(false);
    const { PATCH } = await import("./route");

    const res = await PATCH(makePatchRequest({}) as never, {
      params: Promise.resolve({ id: "550e8400-e29b-41d4-a716-446655440001" }),
    });

    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toMatchObject({ ok: false, error: "Database configuration missing" });
  });

  it("PATCH returns 500 when updateJokeCandidate throws", async () => {
    const pin = "1234";
    vi.stubEnv("DASHBOARD_PIN", pin);
    cookiesMock.mockResolvedValue(makeCookieStore(computeSessionToken(pin)));
    updateJokeCandidate.mockRejectedValue(new Error("DB write failed"));
    const { PATCH } = await import("./route");

    const res = await PATCH(
      makePatchRequest({
        question: "Why?",
        answer: "Because.",
        category: "general",
        difficulty: 1,
        wrongAnswers: ["A", "B", "C"],
        tags: [],
      }) as never,
      { params: Promise.resolve({ id: "550e8400-e29b-41d4-a716-446655440001" }) }
    );

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toMatchObject({ ok: false, error: "DB write failed" });
  });

  it("PATCH returns 400 for malformed JSON body", async () => {
    const pin = "1234";
    vi.stubEnv("DASHBOARD_PIN", pin);
    cookiesMock.mockResolvedValue(makeCookieStore(computeSessionToken(pin)));
    const { PATCH } = await import("./route");

    const req = new Request("http://localhost/api/joke-candidates/550e8400-e29b-41d4-a716-446655440001", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: "not-json",
    });

    const res = await PATCH(req as never, {
      params: Promise.resolve({ id: "550e8400-e29b-41d4-a716-446655440001" }),
    });

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ ok: false, error: "Invalid request body" });
  });

  it("PATCH returns 400 when question is empty", async () => {
    const pin = "1234";
    vi.stubEnv("DASHBOARD_PIN", pin);
    cookiesMock.mockResolvedValue(makeCookieStore(computeSessionToken(pin)));
    const { PATCH } = await import("./route");

    const res = await PATCH(
      makePatchRequest({ question: "", answer: "Because.", category: "general", difficulty: 1, wrongAnswers: ["A", "B", "C"], tags: [] }) as never,
      { params: Promise.resolve({ id: "550e8400-e29b-41d4-a716-446655440001" }) }
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ ok: false, error: "Question and answer are required" });
  });

  it("PATCH returns 400 when answer is empty", async () => {
    const pin = "1234";
    vi.stubEnv("DASHBOARD_PIN", pin);
    cookiesMock.mockResolvedValue(makeCookieStore(computeSessionToken(pin)));
    const { PATCH } = await import("./route");

    const res = await PATCH(
      makePatchRequest({ question: "Why?", answer: "", category: "general", difficulty: 1, wrongAnswers: ["A", "B", "C"], tags: [] }) as never,
      { params: Promise.resolve({ id: "550e8400-e29b-41d4-a716-446655440001" }) }
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ ok: false, error: "Question and answer are required" });
  });

  it("PATCH returns 400 for invalid category", async () => {
    const pin = "1234";
    vi.stubEnv("DASHBOARD_PIN", pin);
    cookiesMock.mockResolvedValue(makeCookieStore(computeSessionToken(pin)));
    const { PATCH } = await import("./route");

    const res = await PATCH(
      makePatchRequest({ question: "Why?", answer: "Because.", category: "memes", difficulty: 1, wrongAnswers: ["A", "B", "C"], tags: [] }) as never,
      { params: Promise.resolve({ id: "550e8400-e29b-41d4-a716-446655440001" }) }
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ ok: false, error: "Invalid category" });
  });

  it("PATCH returns 400 for difficulty 0 (out of range)", async () => {
    const pin = "1234";
    vi.stubEnv("DASHBOARD_PIN", pin);
    cookiesMock.mockResolvedValue(makeCookieStore(computeSessionToken(pin)));
    const { PATCH } = await import("./route");

    const res = await PATCH(
      makePatchRequest({ question: "Why?", answer: "Because.", category: "general", difficulty: 0, wrongAnswers: ["A", "B", "C"], tags: [] }) as never,
      { params: Promise.resolve({ id: "550e8400-e29b-41d4-a716-446655440001" }) }
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ ok: false, error: "Invalid difficulty" });
  });

  it("PATCH returns 400 for difficulty 4 (out of range)", async () => {
    const pin = "1234";
    vi.stubEnv("DASHBOARD_PIN", pin);
    cookiesMock.mockResolvedValue(makeCookieStore(computeSessionToken(pin)));
    const { PATCH } = await import("./route");

    const res = await PATCH(
      makePatchRequest({ question: "Why?", answer: "Because.", category: "general", difficulty: 4, wrongAnswers: ["A", "B", "C"], tags: [] }) as never,
      { params: Promise.resolve({ id: "550e8400-e29b-41d4-a716-446655440001" }) }
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ ok: false, error: "Invalid difficulty" });
  });

  it("PATCH returns 400 when fewer than 3 wrong answers are provided", async () => {
    const pin = "1234";
    vi.stubEnv("DASHBOARD_PIN", pin);
    cookiesMock.mockResolvedValue(makeCookieStore(computeSessionToken(pin)));
    const { PATCH } = await import("./route");

    const res = await PATCH(
      makePatchRequest({ question: "Why?", answer: "Because.", category: "general", difficulty: 1, wrongAnswers: ["A", "B"], tags: [] }) as never,
      { params: Promise.resolve({ id: "550e8400-e29b-41d4-a716-446655440001" }) }
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ ok: false, error: "Exactly 3 wrong answers are required" });
  });

  it("PATCH returns 400 when more than 3 wrong answers are provided", async () => {
    const pin = "1234";
    vi.stubEnv("DASHBOARD_PIN", pin);
    cookiesMock.mockResolvedValue(makeCookieStore(computeSessionToken(pin)));
    const { PATCH } = await import("./route");

    const res = await PATCH(
      makePatchRequest({ question: "Why?", answer: "Because.", category: "general", difficulty: 1, wrongAnswers: ["A", "B", "C", "D"], tags: [] }) as never,
      { params: Promise.resolve({ id: "550e8400-e29b-41d4-a716-446655440001" }) }
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ ok: false, error: "Exactly 3 wrong answers are required" });
  });

  it("PATCH returns 400 when one wrong answer is an empty string", async () => {
    const pin = "1234";
    vi.stubEnv("DASHBOARD_PIN", pin);
    cookiesMock.mockResolvedValue(makeCookieStore(computeSessionToken(pin)));
    const { PATCH } = await import("./route");

    const res = await PATCH(
      makePatchRequest({ question: "Why?", answer: "Because.", category: "general", difficulty: 1, wrongAnswers: ["A", "", "C"], tags: [] }) as never,
      { params: Promise.resolve({ id: "550e8400-e29b-41d4-a716-446655440001" }) }
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ ok: false, error: "Exactly 3 wrong answers are required" });
  });

  it("DELETE returns 401 without dashboard session", async () => {
    cookiesMock.mockResolvedValue(makeCookieStore());
    vi.stubEnv("DASHBOARD_PIN", "1234");
    const { DELETE } = await import("./route");

    const res = await DELETE(makeDeleteRequest() as never, {
      params: Promise.resolve({ id: "550e8400-e29b-41d4-a716-446655440001" }),
    });

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({ ok: false, error: "Unauthorized" });
    expect(rejectJokeCandidate).not.toHaveBeenCalled();
  });

  it("DELETE returns 401 when DASHBOARD_PIN is not configured", async () => {
    vi.stubEnv("DASHBOARD_PIN", "");
    cookiesMock.mockResolvedValue(makeCookieStore(computeSessionToken("1234")));
    const { DELETE } = await import("./route");

    const res = await DELETE(makeDeleteRequest() as never, {
      params: Promise.resolve({ id: "550e8400-e29b-41d4-a716-446655440001" }),
    });

    expect(res.status).toBe(401);
    expect(rejectJokeCandidate).not.toHaveBeenCalled();
  });

  it("DELETE returns 503 when Supabase config is missing", async () => {
    const pin = "1234";
    vi.stubEnv("DASHBOARD_PIN", pin);
    cookiesMock.mockResolvedValue(makeCookieStore(computeSessionToken(pin)));
    hasSupabaseAdminConfig.mockReturnValue(false);
    const { DELETE } = await import("./route");

    const res = await DELETE(makeDeleteRequest() as never, {
      params: Promise.resolve({ id: "550e8400-e29b-41d4-a716-446655440001" }),
    });

    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toMatchObject({ ok: false, error: "Database configuration missing" });
  });

  it("DELETE returns 500 when rejectJokeCandidate throws", async () => {
    const pin = "1234";
    vi.stubEnv("DASHBOARD_PIN", pin);
    cookiesMock.mockResolvedValue(makeCookieStore(computeSessionToken(pin)));
    rejectJokeCandidate.mockRejectedValue(new Error("Supabase write failed"));
    const { DELETE } = await import("./route");

    const res = await DELETE(makeDeleteRequest() as never, {
      params: Promise.resolve({ id: "550e8400-e29b-41d4-a716-446655440001" }),
    });

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toMatchObject({ ok: false, error: "Supabase write failed" });
  });

  it("DELETE accepts reviewNotes at exactly the 1000-char boundary", async () => {
    const pin = "1234";
    vi.stubEnv("DASHBOARD_PIN", pin);
    cookiesMock.mockResolvedValue(makeCookieStore(computeSessionToken(pin)));
    const { DELETE } = await import("./route");

    const boundary = "x".repeat(1000);
    const res = await DELETE(
      new Request(
        `http://localhost/api/joke-candidates/550e8400-e29b-41d4-a716-446655440001?reviewNotes=${boundary}`,
        { method: "DELETE" }
      ) as never,
      { params: Promise.resolve({ id: "550e8400-e29b-41d4-a716-446655440001" }) }
    );

    expect(res.status).toBe(200);
    expect(rejectJokeCandidate).toHaveBeenCalledWith("550e8400-e29b-41d4-a716-446655440001", boundary);
  });

  it("DELETE rejects the candidate", async () => {
    const pin = "1234";
    vi.stubEnv("DASHBOARD_PIN", pin);
    cookiesMock.mockResolvedValue(makeCookieStore(computeSessionToken(pin)));
    const { DELETE } = await import("./route");

    const res = await DELETE(makeDeleteRequest() as never, {
      params: Promise.resolve({ id: "550e8400-e29b-41d4-a716-446655440001" }),
    });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ ok: true });
    expect(rejectJokeCandidate).toHaveBeenCalledWith("550e8400-e29b-41d4-a716-446655440001", "duplicate");
  });
});
