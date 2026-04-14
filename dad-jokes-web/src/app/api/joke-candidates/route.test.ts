import { beforeEach, describe, expect, it, vi } from "vitest";
import { computeSessionToken } from "@/lib/dashboard-auth";

const cookiesMock = vi.fn();
const hasSupabaseAdminConfig = vi.fn();
const listPendingJokeCandidates = vi.fn();

vi.mock("next/headers", () => ({
  cookies: cookiesMock,
}));

vi.mock("@/lib/supabase-admin", () => ({
  hasSupabaseAdminConfig,
  listPendingJokeCandidates,
}));

function makeCookieStore(session?: string) {
  return {
    get: vi.fn((name: string) => {
      if (name !== "dash_session" || !session) return undefined;
      return { value: session };
    }),
  };
}

describe("GET /api/joke-candidates", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    hasSupabaseAdminConfig.mockReturnValue(true);
    listPendingJokeCandidates.mockResolvedValue([
      {
        id: "cand-12345678",
        question: "Why did dad bring a ladder?",
        answer: "To reach new heights.",
        language: "english",
        category: "general",
        difficulty: 1,
        wrongAnswers: ["To nap", "To dance", "No idea"],
        tags: ["general"],
        reviewStatus: "pending",
        reviewNotes: null,
        sourcePlatform: "instagram",
        sourceHandle: "bekarobar",
        sourceUrl: "https://example.com/post",
        transcriptSnippet: null,
        promotedJokeId: null,
        createdAt: "2026-04-13T00:00:00.000Z",
      },
    ]);
  });

  it("returns 401 when dashboard session is missing", async () => {
    cookiesMock.mockResolvedValue(makeCookieStore());
    vi.stubEnv("DASHBOARD_PIN", "1234");
    const { GET } = await import("./route");

    const res = await GET();

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({ ok: false, error: "Unauthorized" });
  });

  it("returns 503 when supabase config is missing", async () => {
    const pin = "1234";
    vi.stubEnv("DASHBOARD_PIN", pin);
    cookiesMock.mockResolvedValue(makeCookieStore(computeSessionToken(pin)));
    hasSupabaseAdminConfig.mockReturnValue(false);
    const { GET } = await import("./route");

    const res = await GET();

    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toMatchObject({
      ok: false,
      error: "Database configuration missing",
    });
  });

  it("returns pending candidates on success", async () => {
    const pin = "1234";
    vi.stubEnv("DASHBOARD_PIN", pin);
    cookiesMock.mockResolvedValue(makeCookieStore(computeSessionToken(pin)));
    const { GET } = await import("./route");

    const res = await GET();

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      ok: true,
      candidates: [
        expect.objectContaining({
          id: "cand-12345678",
          question: "Why did dad bring a ladder?",
        }),
      ],
    });
    expect(listPendingJokeCandidates).toHaveBeenCalledTimes(1);
  });

  it("returns 401 when DASHBOARD_PIN is not configured", async () => {
    // Route calls isValidSession(token, undefined) — must fail-closed
    vi.stubEnv("DASHBOARD_PIN", "");
    const pin = "1234";
    cookiesMock.mockResolvedValue(makeCookieStore(computeSessionToken(pin)));
    const { GET } = await import("./route");

    const res = await GET();

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({ ok: false, error: "Unauthorized" });
    expect(listPendingJokeCandidates).not.toHaveBeenCalled();
  });

  it("returns 401 when session token is tampered (right length, wrong value)", async () => {
    const pin = "1234";
    vi.stubEnv("DASHBOARD_PIN", pin);
    // Build a valid-length hex string that differs from the real token
    const tamperedToken = "a".repeat(64);
    cookiesMock.mockResolvedValue(makeCookieStore(tamperedToken));
    const { GET } = await import("./route");

    const res = await GET();

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({ ok: false, error: "Unauthorized" });
    expect(listPendingJokeCandidates).not.toHaveBeenCalled();
  });

  it("returns 500 when candidate query fails", async () => {
    const pin = "1234";
    vi.stubEnv("DASHBOARD_PIN", pin);
    cookiesMock.mockResolvedValue(makeCookieStore(computeSessionToken(pin)));
    listPendingJokeCandidates.mockRejectedValue(new Error("Supabase query failed"));
    const { GET } = await import("./route");

    const res = await GET();

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toMatchObject({
      ok: false,
      error: "Supabase query failed",
    });
  });
});
