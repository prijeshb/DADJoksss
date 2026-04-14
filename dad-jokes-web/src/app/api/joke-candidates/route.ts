import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { isValidSession } from "@/lib/dashboard-auth";
import { hasSupabaseAdminConfig, listPendingJokeCandidates } from "@/lib/supabase-admin";

export async function GET() {
  const cookieStore = await cookies();
  const session = cookieStore.get("dash_session")?.value;
  const pin = process.env.DASHBOARD_PIN;

  if (!isValidSession(session, pin)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  if (!hasSupabaseAdminConfig()) {
    return NextResponse.json({ ok: false, error: "Database configuration missing" }, { status: 503 });
  }

  try {
    const candidates = await listPendingJokeCandidates();
    return NextResponse.json({ ok: true, candidates });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown candidate query error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
