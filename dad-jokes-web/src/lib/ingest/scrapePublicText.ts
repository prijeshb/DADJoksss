import { isIP } from "net";
import type { ScrapeSource } from "./sourceRegistry";

export interface ScrapeResult {
  source: ScrapeSource;
  title?: string;
  description?: string;
  text: string;
  fetchedAt: string;
}

function decodeHtml(input: string): string {
  return input
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function compactWhitespace(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

function extractMeta(html: string, name: string): string | undefined {
  const re = new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i");
  const match = html.match(re);
  return match?.[1] ? decodeHtml(compactWhitespace(match[1])) : undefined;
}

function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ");
}

function extractVisibleText(html: string): string {
  const jsonLdMatches = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  const jsonLdText = jsonLdMatches
    .map((m) => compactWhitespace(m[1] ?? ""))
    .filter(Boolean)
    .join(" ");

  const text = compactWhitespace(decodeHtml(stripTags(html)));
  return compactWhitespace(`${jsonLdText} ${text}`).slice(0, 20000);
}

/**
 * SSRF guard — only allow HTTPS to public routable hosts.
 * Blocks: http, file, ftp, localhost, link-local (169.254.x.x),
 * and all RFC-1918 private ranges.
 */
function isSafeUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;

  const host = url.hostname.toLowerCase();
  // URL API wraps IPv6 addresses in brackets (e.g. "[::1]") — strip them for isIP()
  const rawHost = host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;

  // Reject bare IPs in private/loopback/link-local ranges
  if (isIP(rawHost)) {
    // IPv4 block list
    if (
      rawHost === "127.0.0.1" ||
      rawHost.startsWith("10.") ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(rawHost) ||
      rawHost.startsWith("192.168.") ||
      rawHost.startsWith("169.254.") || // AWS IMDS & link-local
      rawHost === "0.0.0.0"
    ) return false;
    // IPv6 loopback and unspecified
    if (rawHost === "::1" || rawHost === "::") return false;
    // IPv4-mapped IPv6 (e.g. ::ffff:127.0.0.1 reaches loopback)
    if (/^::ffff:/i.test(rawHost)) return false;
    // fc00::/7 (Unique Local), fe80::/10 (link-local), ff00::/8 (multicast)
    if (/^f[cd]/i.test(rawHost)) return false;       // fc00::/7 → fc** and fd**
    if (/^fe[89ab]/i.test(rawHost)) return false;    // fe80::/10 → fe8*..feb*
    if (/^ff/i.test(rawHost)) return false;          // multicast
  }

  // Reject localhost by name
  if (host === "localhost") return false;

  // Reject metadata endpoints commonly exploited in SSRF
  if (host === "metadata.google.internal") return false;

  return true;
}

export async function scrapePublicText(source: ScrapeSource): Promise<ScrapeResult> {
  if (!isSafeUrl(source.url)) {
    throw new Error(`Blocked unsafe URL for source ${source.id}: ${source.url}`);
  }

  const res = await fetch(source.url, {
    headers: {
      "User-Agent": "dadjoksss-ingest/1.0 (+public-text-scan)",
      Accept: "text/html,application/xhtml+xml",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000), // 10s timeout — prevents slow-loris / hung connections
  });

  if (!res.ok) {
    throw new Error(`Fetch failed for ${source.url}: ${res.status}`);
  }

  const html = await res.text();
  const title = extractMeta(html, "og:title");
  const description = extractMeta(html, "description") ?? extractMeta(html, "og:description");
  const text = extractVisibleText(html);

  return {
    source,
    title,
    description,
    text,
    fetchedAt: new Date().toISOString(),
  };
}

