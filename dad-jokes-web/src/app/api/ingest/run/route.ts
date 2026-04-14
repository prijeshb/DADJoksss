import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { kv } from "@vercel/kv";
import { extractJokeCandidates } from "@/lib/ingest/extractJokeCandidates";
import { scrapePublicText } from "@/lib/ingest/scrapePublicText";
import { loadSourcesFromEnv } from "@/lib/ingest/sourceRegistry";

interface InMemoryState {
  lastRunAt?: string;
}

const memoryState: InMemoryState = {};

function parseBoolean(raw: string | null): boolean {
  return raw === "true" || raw === "1" || raw === "yes";
}

function parseInterval(raw: string | null): 1 | 2 | 3 {
  if (raw === "1" || raw === "2" || raw === "3") return Number(raw) as 1 | 2 | 3;
  const env = process.env.INGEST_INTERVAL_DAYS;
  if (env === "1" || env === "2" || env === "3") return Number(env) as 1 | 2 | 3;
  return 2;
}

async function readLastRunAt(): Promise<string | undefined> {
  try {
    const value = await kv.get<string>("ingest:lastRunAt");
    return value ?? memoryState.lastRunAt;
  } catch {
    return memoryState.lastRunAt;
  }
}

async function writeLastRunAt(iso: string): Promise<void> {
  memoryState.lastRunAt = iso;
  try {
    await kv.set("ingest:lastRunAt", iso);
  } catch {
    // Local fallback already set in memory.
  }
}

async function writeRunPayload(payload: unknown): Promise<void> {
  try {
    await kv.set("ingest:lastPayload", payload);
  } catch {
    // Best-effort persistence.
  }
}

function shouldRun(lastRunAt: string | undefined, intervalDays: 1 | 2 | 3): boolean {
  if (!lastRunAt) return true;
  const last = new Date(lastRunAt).getTime();
  if (Number.isNaN(last)) return true;
  const intervalMs = intervalDays * 24 * 60 * 60 * 1000;
  return Date.now() - last >= intervalMs;
}

function hasValidSecret(request: NextRequest): boolean {
  const secret = process.env.INGEST_CRON_SECRET;
  if (!secret) return false; // fail-closed: deny if not configured
  const received = request.headers.get("x-ingest-secret");
  if (!received) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(received), Buffer.from(secret));
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
  if (!hasValidSecret(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const manual = parseBoolean(searchParams.get("manual"));
  const force = parseBoolean(searchParams.get("force"));
  const dryRun = parseBoolean(searchParams.get("dryRun"));
  const intervalDays = parseInterval(searchParams.get("interval"));
  const onlySource = searchParams.get("source");

  const lastRunAt = await readLastRunAt();
  const runAllowed = force || manual || shouldRun(lastRunAt, intervalDays);
  if (!runAllowed) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "Interval gate not reached",
      intervalDays,
      lastRunAt,
    });
  }

  const allSources = loadSourcesFromEnv().filter((s) => s.active);
  const sources = onlySource && onlySource !== "all"
    ? allSources.filter((s) => s.id === onlySource || s.platform === onlySource || s.label === onlySource)
    : allSources;

  const scanResults = await Promise.all(
    sources.map(async (source) => {
      try {
        const scraped = await scrapePublicText(source);
        const candidates = extractJokeCandidates(scraped);
        return {
          sourceId: source.id,
          source: source.label,
          platform: source.platform,
          ok: true,
          candidates,
          error: null as string | null,
        };
      } catch (error) {
        return {
          sourceId: source.id,
          source: source.label,
          platform: source.platform,
          ok: false,
          candidates: [],
          error: error instanceof Error ? error.message : "Unknown scrape error",
        };
      }
    })
  );

  const candidates = scanResults.flatMap((r) => r.candidates);
  const runAt = new Date().toISOString();
  const payload = {
    runAt,
    intervalDays,
    manual,
    force,
    dryRun,
    sourceCount: sources.length,
    totalCandidates: candidates.length,
    scans: scanResults.map((r) => ({
      sourceId: r.sourceId,
      source: r.source,
      platform: r.platform,
      ok: r.ok,
      count: r.candidates.length,
      error: r.error,
    })),
    candidates,
  };

  if (!dryRun) {
    await writeLastRunAt(runAt);
    await writeRunPayload(payload);
  }

  return NextResponse.json({
    ok: true,
    skipped: false,
    runAt,
    persisted: !dryRun,
    summary: {
      intervalDays,
      sourceCount: sources.length,
      totalCandidates: candidates.length,
      successSources: scanResults.filter((r) => r.ok).length,
      failedSources: scanResults.filter((r) => !r.ok).length,
    },
    scans: payload.scans,
    candidates: candidates.slice(0, 50),
  });
}

