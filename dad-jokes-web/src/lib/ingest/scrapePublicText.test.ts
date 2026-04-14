import { beforeEach, describe, expect, it, vi } from "vitest";
import { scrapePublicText } from "./scrapePublicText";
import type { ScrapeSource } from "./sourceRegistry";

function makeSource(url: string): ScrapeSource {
  return {
    id: "test-source",
    platform: "instagram",
    label: "test",
    url,
    language: "english",
    active: true,
  };
}

function mockFetchOk(html = "<html><body>Dad joke here</body></html>"): void {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      text: async () => html,
    })
  );
}

describe("scrapePublicText — SSRF guard", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects http:// URLs", async () => {
    await expect(scrapePublicText(makeSource("http://example.com"))).rejects.toThrow(
      "Blocked unsafe URL"
    );
  });

  it("rejects file:// URLs", async () => {
    await expect(scrapePublicText(makeSource("file:///etc/passwd"))).rejects.toThrow(
      "Blocked unsafe URL"
    );
  });

  it("rejects ftp:// URLs", async () => {
    await expect(scrapePublicText(makeSource("ftp://example.com/data"))).rejects.toThrow(
      "Blocked unsafe URL"
    );
  });

  it("rejects localhost", async () => {
    await expect(scrapePublicText(makeSource("https://localhost/admin"))).rejects.toThrow(
      "Blocked unsafe URL"
    );
  });

  it("rejects 127.0.0.1 (IPv4 loopback)", async () => {
    await expect(scrapePublicText(makeSource("https://127.0.0.1/"))).rejects.toThrow(
      "Blocked unsafe URL"
    );
  });

  it("rejects ::1 (IPv6 loopback)", async () => {
    await expect(scrapePublicText(makeSource("https://[::1]/"))).rejects.toThrow(
      "Blocked unsafe URL"
    );
  });

  it("rejects ::ffff:127.0.0.1 (IPv4-mapped IPv6 loopback bypass)", async () => {
    await expect(
      scrapePublicText(makeSource("https://[::ffff:127.0.0.1]/"))
    ).rejects.toThrow("Blocked unsafe URL");
  });

  it("rejects fc00:: (ULA private IPv6)", async () => {
    await expect(scrapePublicText(makeSource("https://[fc00::1]/"))).rejects.toThrow(
      "Blocked unsafe URL"
    );
  });

  it("rejects fe80:: (IPv6 link-local)", async () => {
    await expect(scrapePublicText(makeSource("https://[fe80::1]/"))).rejects.toThrow(
      "Blocked unsafe URL"
    );
  });

  it("rejects ff02:: (IPv6 multicast)", async () => {
    await expect(scrapePublicText(makeSource("https://[ff02::1]/"))).rejects.toThrow(
      "Blocked unsafe URL"
    );
  });

  it("rejects 169.254.x.x (AWS IMDS / link-local)", async () => {
    await expect(
      scrapePublicText(makeSource("https://169.254.169.254/latest/meta-data/"))
    ).rejects.toThrow("Blocked unsafe URL");
  });

  it("rejects 10.x.x.x (RFC-1918 private range)", async () => {
    await expect(scrapePublicText(makeSource("https://10.0.0.1/internal"))).rejects.toThrow(
      "Blocked unsafe URL"
    );
  });

  it("rejects 192.168.x.x (RFC-1918 private range)", async () => {
    await expect(scrapePublicText(makeSource("https://192.168.1.100/"))).rejects.toThrow(
      "Blocked unsafe URL"
    );
  });

  it("rejects 172.16.x.x (RFC-1918 private range)", async () => {
    await expect(scrapePublicText(makeSource("https://172.16.0.1/"))).rejects.toThrow(
      "Blocked unsafe URL"
    );
  });

  it("rejects GCP metadata endpoint", async () => {
    await expect(
      scrapePublicText(makeSource("https://metadata.google.internal/computeMetadata/v1/"))
    ).rejects.toThrow("Blocked unsafe URL");
  });

  it("rejects malformed / non-parseable URLs", async () => {
    await expect(scrapePublicText(makeSource("not-a-url"))).rejects.toThrow("Blocked unsafe URL");
  });

  it("allows https:// public URLs and fetches them", async () => {
    mockFetchOk();
    const result = await scrapePublicText(makeSource("https://example.com/jokes"));
    expect(result.text).toContain("Dad joke");
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith(
      "https://example.com/jokes",
      expect.objectContaining({ cache: "no-store" })
    );
  });

  it("throws when fetch returns non-ok status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 403 })
    );
    await expect(scrapePublicText(makeSource("https://example.com/jokes"))).rejects.toThrow(
      "Fetch failed"
    );
  });
});
