import HomeClient from "./HomeClient";

interface Props {
  searchParams: Promise<{ joke?: string }>;
}

// Accept both UUID (DB) and legacy alphanumeric IDs.
// Existence is validated lazily by SwipeStack after the feed loads —
// an unknown ID simply results in no auto-scroll rather than a hard error.
const JOKE_ID_RE = /^[a-z0-9-]{4,64}$/i;

function sanitizeJokeId(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const clean = raw.replace(/[^a-z0-9-]/gi, "").slice(0, 64);
  return JOKE_ID_RE.test(clean) ? clean : undefined;
}

export default async function Home({ searchParams }: Props) {
  const { joke } = await searchParams;
  const initialJokeId = sanitizeJokeId(joke);

  return <HomeClient initialJokeId={initialJokeId} />;
}
