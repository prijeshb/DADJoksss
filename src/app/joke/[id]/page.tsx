import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { jokes } from "@/data/jokes";

interface Props {
  params: Promise<{ id: string }>;
}

// Sanitize joke ID — only allow alphanumeric and hyphens, max 20 chars
function sanitizeId(raw: string): string {
  return raw.replace(/[^a-z0-9-]/gi, "").slice(0, 20);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const safeId = sanitizeId(id);
  const joke = jokes.find((j) => j.id === safeId);

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

  // Validate the ID exists before redirecting — prevents open redirect on unknown IDs
  const exists = jokes.some((j) => j.id === safeId);
  if (!exists) {
    redirect("/");
  }

  // Redirect to home with the joke ID so the feed opens to that joke
  redirect(`/?joke=${safeId}`);
}
