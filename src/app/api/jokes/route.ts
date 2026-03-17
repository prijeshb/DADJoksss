import { NextRequest, NextResponse } from "next/server";
import { jokes, getJokesByLanguage, getDailyJoke, getShuffledJokes } from "@/data/jokes";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const language = searchParams.get("language") as "english" | "hinglish" | "mix" | null;
  const daily = searchParams.get("daily");
  const shuffle = searchParams.get("shuffle");
  const isSmart = searchParams.get("ab") === "true";
  const limit = parseInt(searchParams.get("limit") || "50");

  if (daily === "true") {
    return NextResponse.json({ joke: getDailyJoke() });
  }

  let feed = language ? getJokesByLanguage(language) : jokes;

  if (shuffle === "true") {
    feed = getShuffledJokes(language || "mix", [], Date.now());
  }

  // Smart algo (A/B test simulation)
  if (isSmart) {
    feed = [...feed].sort((a, b) => (b.likes ?? 0) * 2 + (b.shares ?? 0) * 3 - ((a.likes ?? 0) * 2 + (a.shares ?? 0) * 3));
  }

  return NextResponse.json({
    jokes: feed.slice(0, limit),
    total: feed.length,
    ab: isSmart ? "smart" : "default",
  });
}
