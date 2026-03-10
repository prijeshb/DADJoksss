import { NextRequest, NextResponse } from "next/server";

// A/B Test API - in production this would be backed by a database
export async function GET() {
  return NextResponse.json({
    message: "A/B tests are managed client-side. Visit /dashboard to manage tests.",
    endpoints: {
      "GET /api/ab-test": "List all tests (would return from DB)",
      "POST /api/ab-test": "Create a new test",
      "POST /api/ab-test/track": "Track an event for a variant",
    },
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    console.log("[A/B Test]", body);
    return NextResponse.json({ success: true, id: `test-${Date.now()}` });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
