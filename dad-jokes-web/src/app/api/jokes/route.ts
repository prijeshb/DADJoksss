import { NextRequest, NextResponse } from "next/server";
import { hasSupabaseAdminConfig, listPublishedJokes } from "@/lib/supabase-admin";
import { jokes as staticJokes } from "@/data/jokes";
import type { DadJoke } from "@/lib/types";

function shuffleInPlace<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const rawLanguage = searchParams.get("language");
  const language =
    rawLanguage === "english" || rawLanguage === "hinglish" ? rawLanguage : undefined;

  const limit = Math.min(Math.max(1, parseInt(searchParams.get("limit") || "50") || 50), 100);
  const isSmart  = searchParams.get("ab") === "true";
  const doShuffle = searchParams.get("shuffle") === "true";

  let jokes: DadJoke[];

  if (!hasSupabaseAdminConfig()) {
    // No DB credentials — serve static fallback so local dev works without Supabase
    jokes = language
      ? staticJokes.filter((j) => j.language === language)
      : staticJokes;
    jokes = jokes.slice(0, limit);
  } else {
    try {
      jokes = await listPublishedJokes({ language, limit });
    } catch (error) {
      // Supabase unreachable or credentials invalid — fall back to static data
      jokes = language
        ? staticJokes.filter((j) => j.language === language)
        : staticJokes;
      jokes = jokes.slice(0, limit);
    }
  }

  if (doShuffle) {
    shuffleInPlace(jokes);
  } else if (isSmart) {
    jokes.sort(
      (a, b) =>
        (b.likes ?? 0) * 2 + (b.shares ?? 0) * 3 -
        ((a.likes ?? 0) * 2 + (a.shares ?? 0) * 3)
    );
  }

  const response = NextResponse.json({
    ok: true,
    jokes,
    total: jokes.length,
    ab: isSmart ? "smart" : "default",
  });

  // Cache 5 min at CDN edge; serve stale for 60 s while revalidating
  response.headers.set(
    "Cache-Control",
    "public, s-maxage=300, stale-while-revalidate=60"
  );
  return response;
}
