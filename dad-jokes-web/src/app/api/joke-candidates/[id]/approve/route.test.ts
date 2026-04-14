import { beforeEach, describe, expect, it, vi } from "vitest";
import { computeSessionToken } from "@/lib/dashboard-auth";

const cookiesMock = vi.fn();
const hasSupabaseAdminConfig = vi.fn();
const promoteJokeCandidate = vi.fn();

vi.mock("next/headers", () => ({
  cookies: cookiesMock,
}));

vi.mock("@/lib/supabase-admin", () => ({
  hasSupabaseAdminConfig,
  promoteJokeCandidate,
}));

function makeCookieStore(session?: string) {
  return {
    get: vi.fn((name: string) => {
      if (name !== "dash_session" || !session) return undefined;
      return { value: session };
    }),
  };
}

function makeRequest(): Request {
  return new Request("http://localhost/api/joke-candidates/cand-12345678/approve", {
    method: "POST",
  });
}

describe("POST /api/joke-candidates/[id]/approve", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    hasSupabaseAdminConfig.mockReturnValue(true);
    promoteJokeCandidate.mockResolvedValue(101);
  });

  it("returns 401 when dashboard session is missing", async () => {
    cookiesMock.mockResolvedValue(makeCookieStore());
    vi.stubEnv("DASHBOARD_PIN", "1234");
    const { POST } = await import("./route");

    const res = await POST(makeRequest() as never, {
      params: Promise.resolve({ id: "cand-12345678" }),
    });

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({ ok: false, error: "Unauthorized" });
  });

  it("returns 503 when supabase admin config is missing", async () => {
    const pin = "1234";
    vi.stubEnv("DASHBOARD_PIN", pin);
    cookiesMock.mockResolvedValue(makeCookieStore(computeSessionToken(pin)));
    hasSupabaseAdminConfig.mockReturnValue(false);
    const { POST } = await import("./route");

    const res = await POST(makeRequest() as never, {
      params: Promise.resolve({ id: "cand-12345678" }),
    });

    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toMatchObject({
      ok: false,
      error: "Database configuration missing",
    });
  });

  it("returns 400 for malformed candidate ids", async () => {
    const pin = "1234";
    vi.stubEnv("DASHBOARD_PIN", pin);
    cookiesMock.mockResolvedValue(makeCookieStore(computeSessionToken(pin)));
    const { POST } = await import("./route");

    const res = await POST(makeRequest() as never, {
      params: Promise.resolve({ id: "bad!" }),
    });

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ ok: false, error: "Invalid candidate id" });
    expect(promoteJokeCandidate).not.toHaveBeenCalled();
  });

  it("returns the promoted joke id on success", async () => {
    const pin = "1234";
    vi.stubEnv("DASHBOARD_PIN", pin);
    cookiesMock.mockResolvedValue(makeCookieStore(computeSessionToken(pin)));
    const { POST } = await import("./route");

    const res = await POST(makeRequest() as never, {
      params: Promise.resolve({ id: "cand-12345678" }),
    });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ ok: true, jokeId: 101 });
    expect(promoteJokeCandidate).toHaveBeenCalledWith("cand-12345678");
  });

  it("returns 401 when DASHBOARD_PIN is not configured (fail-closed)", async () => {
    vi.stubEnv("DASHBOARD_PIN", "");
    cookiesMock.mockResolvedValue(makeCookieStore(computeSessionToken("1234")));
    const { POST } = await import("./route");

    const res = await POST(makeRequest() as never, {
      params: Promise.resolve({ id: "cand-12345678" }),
    });

    expect(res.status).toBe(401);
    expect(promoteJokeCandidate).not.toHaveBeenCalled();
  });

  it("returns 401 when session token is tampered (right length, wrong value)", async () => {
    vi.stubEnv("DASHBOARD_PIN", "1234");
    cookiesMock.mockResolvedValue(makeCookieStore("b".repeat(64)));
    const { POST } = await import("./route");

    const res = await POST(makeRequest() as never, {
      params: Promise.resolve({ id: "cand-12345678" }),
    });

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({ ok: false, error: "Unauthorized" });
    expect(promoteJokeCandidate).not.toHaveBeenCalled();
  });

  it("returns 400 for an id shorter than 8 characters", async () => {
    const pin = "1234";
    vi.stubEnv("DASHBOARD_PIN", pin);
    cookiesMock.mockResolvedValue(makeCookieStore(computeSessionToken(pin)));
    const { POST } = await import("./route");

    const res = await POST(makeRequest() as never, {
      params: Promise.resolve({ id: "short" }),
    });

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ ok: false, error: "Invalid candidate id" });
    expect(promoteJokeCandidate).not.toHaveBeenCalled();
  });

  it("returns 500 when promotion fails", async () => {
    const pin = "1234";
    vi.stubEnv("DASHBOARD_PIN", pin);
    cookiesMock.mockResolvedValue(makeCookieStore(computeSessionToken(pin)));
    promoteJokeCandidate.mockRejectedValue(new Error("Supabase RPC failed"));
    const { POST } = await import("./route");

    const res = await POST(makeRequest() as never, {
      params: Promise.resolve({ id: "cand-12345678" }),
    });

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toMatchObject({
      ok: false,
      error: "Supabase RPC failed",
    });
  });
});
