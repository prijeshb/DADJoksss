import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { isValidSession } from "@/lib/dashboard-auth";
import { hasSupabaseAdminConfig, rejectJokeCandidate, updateJokeCandidate } from "@/lib/supabase-admin";
import type { JokeCategory } from "@/lib/types";

const CANDIDATE_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REVIEW_NOTES_MAX_LEN = 1000;
const ALLOWED_CATEGORIES: JokeCategory[] = [
  "pun",
  "wordplay",
  "classic",
  "science",
  "food",
  "animal",
  "tech",
  "general",
  "adult",
];

async function authorize() {
  const cookieStore = await cookies();
  const session = cookieStore.get("dash_session")?.value;
  const pin = process.env.DASHBOARD_PIN;

  if (!isValidSession(session, pin)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  if (!hasSupabaseAdminConfig()) {
    return NextResponse.json({ ok: false, error: "Database configuration missing" }, { status: 503 });
  }

  return null;
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const authError = await authorize();
  if (authError) return authError;

  const { id } = await context.params;
  if (!CANDIDATE_ID_RE.test(id)) {
    return NextResponse.json({ ok: false, error: "Invalid candidate id" }, { status: 400 });
  }

  let body: {
    question?: string;
    answer?: string;
    category?: JokeCategory;
    difficulty?: number;
    wrongAnswers?: string[];
    tags?: string[];
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body" }, { status: 400 });
  }

  const question = typeof body.question === "string" ? body.question.trim() : "";
  const answer = typeof body.answer === "string" ? body.answer.trim() : "";
  const category = body.category;
  const difficulty = body.difficulty;
  const wrongAnswers = Array.isArray(body.wrongAnswers) ? body.wrongAnswers.map((value) => String(value).trim()) : [];
  const tags = Array.isArray(body.tags) ? body.tags.map((value) => String(value).trim().toLowerCase()).filter(Boolean) : [];

  if (!question || !answer) {
    return NextResponse.json({ ok: false, error: "Question and answer are required" }, { status: 400 });
  }

  if (!category || !ALLOWED_CATEGORIES.includes(category)) {
    return NextResponse.json({ ok: false, error: "Invalid category" }, { status: 400 });
  }

  if (difficulty !== 1 && difficulty !== 2 && difficulty !== 3) {
    return NextResponse.json({ ok: false, error: "Invalid difficulty" }, { status: 400 });
  }

  if (wrongAnswers.length !== 3 || wrongAnswers.some((value) => !value)) {
    return NextResponse.json({ ok: false, error: "Exactly 3 wrong answers are required" }, { status: 400 });
  }

  if (wrongAnswers.includes(answer)) {
    return NextResponse.json({ ok: false, error: "Wrong answers cannot match the answer" }, { status: 400 });
  }

  try {
    const candidate = await updateJokeCandidate(id, {
      question,
      answer,
      category,
      difficulty,
      wrongAnswers,
      tags,
    });
    return NextResponse.json({ ok: true, candidate });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown candidate update error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const authError = await authorize();
  if (authError) return authError;

  const { id } = await context.params;
  if (!CANDIDATE_ID_RE.test(id)) {
    return NextResponse.json({ ok: false, error: "Invalid candidate id" }, { status: 400 });
  }

  let reviewNotes: string | undefined;
  const reviewNotesParam = new URL(request.url).searchParams.get("reviewNotes");
  if (reviewNotesParam) {
    const trimmed = reviewNotesParam.trim();
    if (trimmed.length > REVIEW_NOTES_MAX_LEN) {
      return NextResponse.json({ ok: false, error: "reviewNotes too long" }, { status: 400 });
    }
    reviewNotes = trimmed;
  }

  try {
    await rejectJokeCandidate(id, reviewNotes);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown candidate rejection error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
