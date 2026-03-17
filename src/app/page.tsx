import { jokes } from "@/data/jokes";
import HomeClient from "./HomeClient";

interface Props {
  searchParams: Promise<{ joke?: string }>;
}

// Sanitize joke ID — only allow alphanumeric and hyphens, max 20 chars
function sanitizeJokeId(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const clean = raw.replace(/[^a-z0-9-]/gi, "").slice(0, 20);
  // Validate it actually exists in the dataset — prevents open redirect / unknown IDs
  return jokes.some((j) => j.id === clean) ? clean : undefined;
}

export default async function Home({ searchParams }: Props) {
  const { joke } = await searchParams;
  const initialJokeId = sanitizeJokeId(joke);

  return <HomeClient initialJokeId={initialJokeId} />;
}
