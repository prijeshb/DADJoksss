import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { isValidSession } from "@/lib/dashboard-auth";
import { hasSupabaseAdminConfig, promoteJokeCandidate } from "@/lib/supabase-admin";

const CANDIDATE_ID_RE = /^[a-z0-9-]{8,}$/i;

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const cookieStore = await cookies();
  const session = cookieStore.get("dash_session")?.value;
  const pin = process.env.DASHBOARD_PIN;

  if (!isValidSession(session, pin)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  if (!hasSupabaseAdminConfig()) {
    return NextResponse.json({ ok: false, error: "Database configuration missing" }, { status: 503 });
  }

  const { id } = await context.params;
  if (!CANDIDATE_ID_RE.test(id)) {
    return NextResponse.json({ ok: false, error: "Invalid candidate id" }, { status: 400 });
  }

  try {
    const jokeId = await promoteJokeCandidate(id);
    return NextResponse.json({ ok: true, jokeId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown promotion error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
