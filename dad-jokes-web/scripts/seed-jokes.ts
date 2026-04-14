/**
 * Seed static jokes into Supabase.
 * Idempotent — skips jokes whose content_hash already exists.
 *
 * Run:
 *   npm run db:seed
 */
import { createHash } from "crypto";
import { readFileSync } from "fs";
import { resolve } from "path";

// Load .env.local before reading process.env (tsx doesn't auto-load it)
try {
  const content = readFileSync(resolve(process.cwd(), ".env.local"), "utf-8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (key && !(key in process.env)) process.env[key] = val;
  }
} catch { /* .env.local is optional */ }

function contentHash(question: string, language: string): string {
  return createHash("sha256")
    .update(`${question.toLowerCase().trim()}|${language}`)
    .digest("hex");
}

function makeHeaders(key: string, extra: Record<string, string> = {}): Record<string, string> {
  return {
    "Content-Type": "application/json",
    apikey: key,
    Authorization: `Bearer ${key}`,
    ...extra,
  };
}

async function main() {
  const url = process.env.SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

  if (!url || !key) {
    console.error("❌  SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local");
    process.exit(1);
  }

  // Dynamic import so env vars are loaded before the module executes
  const { jokes } = await import("../src/data/jokes");

  console.log(`Seeding ${jokes.length} jokes into Supabase…\n`);

  let inserted = 0;
  let skipped  = 0;
  const errors: string[] = [];

  const post = (path: string, body: unknown, prefer: string) =>
    fetch(`${url}/rest/v1/${path}`, {
      method:  "POST",
      headers: makeHeaders(key, { Prefer: prefer }),
      body:    JSON.stringify(body),
    });

  for (const joke of jokes) {
    const hash = contentHash(joke.question, joke.language);

    // 1. Insert joke — ignore on content_hash conflict
    const jokeRes = await post("jokes", {
      question:     joke.question,
      answer:       joke.answer,
      language:     joke.language,
      category:     joke.category,
      source:       joke.source ?? "static",
      difficulty:   joke.difficulty,
      featured:     joke.featured ?? false,
      status:       "approved",
      content_hash: hash,
    }, "return=representation,resolution=ignore-duplicates");

    if (!jokeRes.ok) {
      errors.push(`[${joke.id}] ${jokeRes.status}: ${await jokeRes.text()}`);
      continue;
    }

    const rows = await jokeRes.json() as Record<string, unknown>[];
    if (!Array.isArray(rows) || rows.length === 0) {
      process.stdout.write("·");
      skipped++;
      continue;
    }

    const dbId = rows[0].id as number;

    // 2. Insert joke_options (correct answer + up to 3 wrong answers)
    const options = [
      { joke_id: dbId, text: joke.answer, is_correct: true, display_order: 0 },
      ...joke.wrongAnswers.slice(0, 3).map((w, i) => ({
        joke_id: dbId, text: w, is_correct: false, display_order: i + 1,
      })),
    ];

    const optRes = await post("joke_options", options, "resolution=ignore-duplicates,return=minimal");
    if (!optRes.ok) {
      errors.push(`[${joke.id}] options: ${await optRes.text()}`);
    }

    // 3. Insert joke_tags
    if (joke.tags.length > 0) {
      const tags = joke.tags
        .map((t) => t.toLowerCase().trim())
        .filter(Boolean)
        .map((tag) => ({ joke_id: dbId, tag }));

      const tagRes = await post("joke_tags", tags, "resolution=ignore-duplicates,return=minimal");
      if (!tagRes.ok) {
        errors.push(`[${joke.id}] tags: ${await tagRes.text()}`);
      }
    }

    // 4. Patch joke_stats with likes/shares from static data
    const likes  = joke.likes  ?? 0;
    const shares = joke.shares ?? 0;
    if (likes > 0 || shares > 0) {
      const statsRes = await fetch(`${url}/rest/v1/joke_stats?joke_id=eq.${dbId}`, {
        method:  "PATCH",
        headers: makeHeaders(key, { Prefer: "return=minimal" }),
        body:    JSON.stringify({ likes, shares }),
      });
      if (!statsRes.ok) {
        errors.push(`[${joke.id}] stats: ${await statsRes.text()}`);
      }
    }

    process.stdout.write("✓");
    inserted++;
  }

  console.log(`\n\nDone.  Inserted: ${inserted}  Skipped: ${skipped}`);

  if (errors.length > 0) {
    console.error(`\nErrors (${errors.length}):`);
    errors.forEach((e) => console.error(" ", e));
    process.exit(1);
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
