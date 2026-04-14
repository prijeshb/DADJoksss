import { NextRequest, NextResponse } from "next/server";

const ALLOWED_EVENTS = new Set(["view", "like", "share", "answer", "swipe"]);
const JOKE_ID_RE = /^[a-z0-9-]{1,20}$/i;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate event type against allowlist — prevents log injection
    const event = typeof body.event === "string" ? body.event : "";
    if (!ALLOWED_EVENTS.has(event)) {
      return NextResponse.json({ error: "Invalid event" }, { status: 400 });
    }

    // Validate joke ID format
    const jokeId = typeof body.jokeId === "string" ? body.jokeId : "";
    if (jokeId && !JOKE_ID_RE.test(jokeId)) {
      return NextResponse.json({ error: "Invalid jokeId" }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}

export async function GET() {
  return NextResponse.json({
    message: "Analytics are stored client-side. Visit /dashboard to view.",
  });
}
