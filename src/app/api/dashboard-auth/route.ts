import { NextRequest, NextResponse } from "next/server";

// In-memory rate limiter: max 5 attempts per IP per 15 minutes
const attempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;
// Periodic cleanup to prevent unbounded Map growth
let lastCleanup = Date.now();
const CLEANUP_INTERVAL_MS = 60 * 1000; // Clean up every minute

function cleanupStaleEntries() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;
  for (const [ip, record] of attempts) {
    if (now > record.resetAt) {
      attempts.delete(ip);
    }
  }
}

function getIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const record = attempts.get(ip);
  if (!record || now > record.resetAt) {
    // Cleanup stale entries periodically
    cleanupStaleEntries();
    attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  record.count += 1;
  return record.count > MAX_ATTEMPTS;
}

function clearAttempts(ip: string) {
  attempts.delete(ip);
}

export async function POST(req: NextRequest) {
  const correct = process.env.DASHBOARD_PIN;

  // Fail-closed: if no PIN is configured the dashboard is inaccessible
  if (!correct) {
    return NextResponse.json(
      { ok: false, error: "Dashboard not configured" },
      { status: 503 }
    );
  }

  const ip = getIp(req);
  if (isRateLimited(ip)) {
    return NextResponse.json(
      { ok: false, error: "Too many attempts. Try again later." },
      { status: 429 }
    );
  }

  let pin: string;
  try {
    const body = await req.json();
    pin = String(body.pin ?? "").trim();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body" }, { status: 400 });
  }

  if (pin === correct) {
    clearAttempts(ip);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: false }, { status: 401 });
}
