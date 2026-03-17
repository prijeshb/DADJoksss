import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { computeSessionToken } from "@/lib/dashboard-auth";

// In-memory rate limiter: 5 attempts per 15 minutes per IP
const attempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;

function getIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
}

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = attempts.get(ip);
  if (!entry || now > entry.resetAt) {
    attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  entry.count++;
  return entry.count > MAX_ATTEMPTS;
}

function clearRateLimit(ip: string) {
  attempts.delete(ip);
}

export async function POST(req: NextRequest) {
  const configuredPin = process.env.DASHBOARD_PIN;

  // Fail-closed: deny access if PIN is not configured
  if (!configuredPin) {
    return NextResponse.json({ ok: false }, { status: 503 });
  }

  const ip = getIp(req);
  if (checkRateLimit(ip)) {
    return NextResponse.json({ ok: false }, { status: 429 });
  }

  let body: { pin?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const submitted = body.pin ?? "";
  const expectedToken = computeSessionToken(configuredPin);
  const submittedToken = computeSessionToken(submitted);

  let match = false;
  try {
    match =
      submittedToken.length === expectedToken.length &&
      timingSafeEqual(Buffer.from(submittedToken, "hex"), Buffer.from(expectedToken, "hex"));
  } catch {
    match = false;
  }

  if (!match) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  clearRateLimit(ip);

  const res = NextResponse.json({ ok: true });
  res.cookies.set("dash_session", expectedToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/dashboard",
    maxAge: 60 * 60 * 8, // 8 hours
  });
  return res;
}
