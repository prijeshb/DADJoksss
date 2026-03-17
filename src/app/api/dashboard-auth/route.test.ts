import { describe, it, expect, beforeEach, vi } from "vitest";
import { POST } from "./route";
import { computeSessionToken } from "@/lib/dashboard-auth";

function makeRequest(body: unknown, ip = "1.2.3.4"): Request {
  return new Request("http://localhost/api/dashboard-auth", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": ip,
    },
    body: JSON.stringify(body),
  });
}

// Reset rate limit map between tests by re-importing the module freshly
// We use vi.resetModules() in beforeEach to clear in-memory state
beforeEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
});

describe("POST /api/dashboard-auth", () => {
  describe("when DASHBOARD_PIN is not set (fail-closed)", () => {
    it("returns 503", async () => {
      vi.stubEnv("DASHBOARD_PIN", "");
      const { POST: handler } = await import("./route");
      const res = await handler(makeRequest({ pin: "1234" }) as never);
      expect(res.status).toBe(503);
      const body = await res.json();
      expect(body.ok).toBe(false);
    });
  });

  describe("when DASHBOARD_PIN is configured", () => {
    const PIN = "test1234";

    beforeEach(() => {
      vi.stubEnv("DASHBOARD_PIN", PIN);
    });

    it("returns 200 and sets HttpOnly cookie for correct PIN", async () => {
      const { POST: handler } = await import("./route");
      const res = await handler(makeRequest({ pin: PIN }, "10.0.0.1") as never);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);

      const setCookie = res.headers.get("set-cookie");
      expect(setCookie).toContain("dash_session=");
      expect(setCookie).toContain("HttpOnly");
      expect(setCookie?.toLowerCase()).toContain("samesite=strict");
      expect(setCookie).toContain("Path=/dashboard");
    });

    it("cookie value matches expected HMAC token", async () => {
      const { POST: handler } = await import("./route");
      const res = await handler(makeRequest({ pin: PIN }, "10.0.0.2") as never);
      const setCookie = res.headers.get("set-cookie") ?? "";
      const match = setCookie.match(/dash_session=([a-f0-9]+)/);
      expect(match).not.toBeNull();
      expect(match![1]).toBe(computeSessionToken(PIN));
    });

    it("returns 401 for incorrect PIN", async () => {
      const { POST: handler } = await import("./route");
      const res = await handler(makeRequest({ pin: "wrong" }, "10.0.0.3") as never);
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.ok).toBe(false);
    });

    it("returns 400 for malformed JSON body", async () => {
      const { POST: handler } = await import("./route");
      const req = new Request("http://localhost/api/dashboard-auth", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": "10.0.0.4" },
        body: "not-json",
      });
      const res = await handler(req as never);
      expect(res.status).toBe(400);
    });

    it("returns 401 when pin field is missing from body", async () => {
      const { POST: handler } = await import("./route");
      const res = await handler(makeRequest({}, "10.0.0.5") as never);
      expect(res.status).toBe(401);
    });

    it("rate limits after 5 failed attempts from same IP", async () => {
      const { POST: handler } = await import("./route");
      const ip = "10.0.0.6";

      // 5 failed attempts
      for (let i = 0; i < 5; i++) {
        await handler(makeRequest({ pin: "wrong" }, ip) as never);
      }

      // 6th attempt should be rate limited
      const res = await handler(makeRequest({ pin: PIN }, ip) as never);
      expect(res.status).toBe(429);
      const body = await res.json();
      expect(body.ok).toBe(false);
    });

    it("does not rate limit different IPs independently", async () => {
      const { POST: handler } = await import("./route");

      // Exhaust rate limit on ip A
      const ipA = "10.0.0.7";
      for (let i = 0; i < 6; i++) {
        await handler(makeRequest({ pin: "wrong" }, ipA) as never);
      }

      // IP B should still work
      const ipB = "10.0.0.8";
      const res = await handler(makeRequest({ pin: PIN }, ipB) as never);
      expect(res.status).toBe(200);
    });

    it("clears rate limit on successful auth", async () => {
      const { POST: handler } = await import("./route");
      const ip = "10.0.0.9";

      // 4 failed attempts (below limit)
      for (let i = 0; i < 4; i++) {
        await handler(makeRequest({ pin: "wrong" }, ip) as never);
      }

      // Correct PIN clears the counter
      const ok = await handler(makeRequest({ pin: PIN }, ip) as never);
      expect(ok.status).toBe(200);

      // Should be able to attempt again (counter was cleared)
      const again = await handler(makeRequest({ pin: "wrong" }, ip) as never);
      expect(again.status).toBe(401); // 401, not 429
    });
  });
});
