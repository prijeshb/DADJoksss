import { NextRequest, NextResponse } from "next/server";

// In a real app, this would connect to a database
// For now, analytics are stored client-side via zustand persist
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { event, jokeId, data } = body;

    // Log analytics event (in production, write to DB)
    console.log(`[Analytics] ${event} - Joke: ${jokeId}`, data);

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}

export async function GET() {
  // In production, this would return aggregated analytics from DB
  return NextResponse.json({
    message: "Analytics are stored client-side. Visit /dashboard to view.",
  });
}
