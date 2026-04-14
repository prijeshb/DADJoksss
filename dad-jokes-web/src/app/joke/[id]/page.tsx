import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getPublishedJokeById } from "@/lib/supabase-admin";

interface Props {
  params: Promise<{ id: string }>;
}

// Accept UUID (36 chars) and legacy alphanumeric IDs (up to 64 chars)
function sanitizeId(raw: string): string {
  return raw.replace(/[^a-z0-9-]/gi, "").slice(0, 64);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const safeId = sanitizeId(id);
  const joke = await getPublishedJokeById(safeId);

  if (!joke) {
    return { title: "DADjoksss 😂" };
  }

  return {
    title: `${joke.question} — DADjoksss`,
    description: "Tap to reveal the answer 😂 — DADjoksss",
    openGraph: {
      title: joke.question,
      description: "Tap to reveal the answer 😂",
      siteName: "DADjoksss",
      type: "website",
    },
    twitter: {
      card: "summary",
      title: joke.question,
      description: "Tap to reveal the answer 😂",
    },
  };
}

export default async function JokePermalinkPage({ params }: Props) {
  const { id } = await params;
  const safeId = sanitizeId(id);

  const joke = await getPublishedJokeById(safeId);
  if (!joke) redirect("/");

  redirect(`/?joke=${safeId}`);
}
