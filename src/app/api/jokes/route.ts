import { NextRequest, NextResponse } from "next/server";
import { jokes, getJokesByLanguage, getDailyJoke, getShuffledJokes } from "@/data/jokes";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const language = searchParams.get("language") as "english" | "hinglish" | "mix" | null;
  const daily = searchParams.get("daily");
  const shuffle = searchParams.get("shuffle");
  const limit = parseInt(searchParams.get("limit") || "50");

  if (daily === "true") {
    return NextResponse.json({ joke: getDailyJoke() });
  }

  let result = language ? getJokesByLanguage(language) : jokes;

  if (shuffle === "true") {
    result = getShuffledJokes(language || "mix", [], Date.now());
  }

  return NextResponse.json({
    jokes: result.slice(0, limit),
    total: result.length,
  });
}
