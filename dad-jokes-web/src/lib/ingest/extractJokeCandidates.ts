import { createHash } from "crypto";
import type { DadJoke, JokeCategory, Language } from "@/lib/types";
import type { ScrapeResult } from "./scrapePublicText";

export interface IngestedJokeCandidate extends DadJoke {
  sourceUrl: string;
  sourceHandle: string;
  sourcePlatform: "instagram" | "youtube" | "web";
  transcriptSnippet: string;
}

const HINGLISH_MARKERS = [
  "yaar",
  "bhai",
  "papa",
  "mummy",
  "nahi",
  "nahin",
  "kya",
  "kyu",
  "kyun",
  "beta",
  "desi",
  "wala",
  "matlab",
];

function cleanLine(line: string): string {
  return line
    .replace(/\s+/g, " ")
    .replace(/[|]{2,}/g, " ")
    .trim();
}

function detectLanguage(input: string, fallback: "english" | "hinglish" | "mixed"): Language {
  if (fallback !== "mixed") return fallback;
  const value = input.toLowerCase();
  return HINGLISH_MARKERS.some((m) => value.includes(m)) ? "hinglish" : "english";
}

function inferCategory(input: string): JokeCategory {
  const text = input.toLowerCase();
  if (/\bcomputer|code|wifi|internet|app|phone|bug\b/.test(text)) return "tech";
  if (/\bdog|cat|cow|goat|animal|bird\b/.test(text)) return "animal";
  if (/\bfood|pizza|chai|tea|coffee|burger\b/.test(text)) return "food";
  if (/\bscience|physics|chemistry|atom|gravity\b/.test(text)) return "science";
  if (/\bpun|wordplay\b/.test(text)) return "pun";
  return "general";
}

function inferDifficulty(question: string, answer: string): 1 | 2 | 3 {
  const total = question.length + answer.length;
  if (total < 90) return 1;
  if (total < 150) return 2;
  return 3;
}

function buildWrongAnswers(answer: string, language: Language): string[] {
  const generic = language === "hinglish"
    ? ["Bilkul nahi", "Kya pata", "Scene alag hai"]
    : ["Not really", "No idea", "Something else"];
  const alt = answer.length > 20 ? answer.slice(0, 20) + "..." : "Maybe this one";
  return [generic[0], generic[1], alt];
}

function candidateId(question: string, language: Language): string {
  const hash = createHash("sha1").update(`${language}|${question.toLowerCase()}`).digest("hex").slice(0, 10);
  return `cand-${hash}`;
}

function normalizePair(question: string, answer: string): string {
  return `${question.toLowerCase().trim()}|${answer.toLowerCase().trim()}`;
}

function parseQaPairs(text: string): Array<{ question: string; answer: string; snippet: string }> {
  const out: Array<{ question: string; answer: string; snippet: string }> = [];
  const qaRegex = /(?:^|\n)\s*(?:q(?:uestion)?)[\s:-]+(.{8,180}?)(?:\n|\r\n)\s*(?:a(?:nswer)?)[\s:-]+(.{4,180}?)(?=\n{2,}|$)/gim;
  let match: RegExpExecArray | null;
  while ((match = qaRegex.exec(text)) !== null) {
    const question = cleanLine(match[1]);
    const answer = cleanLine(match[2]);
    if (question.length > 7 && answer.length > 3) {
      out.push({ question, answer, snippet: cleanLine(match[0]).slice(0, 240) });
    }
  }
  return out;
}

function parseWhyPatterns(text: string): Array<{ question: string; answer: string; snippet: string }> {
  const out: Array<{ question: string; answer: string; snippet: string }> = [];
  const whyRegex = /(Why[^?\n]{6,180}\?)[\s\n]+([^\n]{4,180})(?=\n|$)/gi;
  let match: RegExpExecArray | null;
  while ((match = whyRegex.exec(text)) !== null) {
    const question = cleanLine(match[1]);
    const answer = cleanLine(match[2]);
    if (question.length > 8 && answer.length > 3) {
      out.push({ question, answer, snippet: cleanLine(`${question} ${answer}`).slice(0, 240) });
    }
  }
  return out;
}

function parseLinePairs(text: string): Array<{ question: string; answer: string; snippet: string }> {
  const lines = text
    .split(/\n+/)
    .map((l) => cleanLine(l))
    .filter((l) => l.length > 7 && l.length < 240);
  const out: Array<{ question: string; answer: string; snippet: string }> = [];

  for (let i = 0; i < lines.length - 1; i++) {
    const q = lines[i];
    const a = lines[i + 1];
    if (!q.endsWith("?")) continue;
    if (a.endsWith("?")) continue;
    out.push({ question: q, answer: a, snippet: cleanLine(`${q} ${a}`).slice(0, 240) });
  }
  return out;
}

export function extractJokeCandidates(result: ScrapeResult): IngestedJokeCandidate[] {
  const baseText = [result.title, result.description, result.text].filter(Boolean).join("\n");
  const rawPairs = [
    ...parseQaPairs(baseText),
    ...parseWhyPatterns(baseText),
    ...parseLinePairs(baseText),
  ];

  const seen = new Set<string>();
  const candidates: IngestedJokeCandidate[] = [];

  for (const pair of rawPairs) {
    const normalized = normalizePair(pair.question, pair.answer);
    if (seen.has(normalized)) continue;
    seen.add(normalized);

    const language = detectLanguage(`${pair.question} ${pair.answer}`, result.source.language);
    const source = `${result.source.platform}:${result.source.label}`;
    const category = inferCategory(`${pair.question} ${pair.answer}`);
    const difficulty = inferDifficulty(pair.question, pair.answer);
    const tags = [category, result.source.platform, result.source.label.toLowerCase()].slice(0, 5);
    const wrongAnswers = buildWrongAnswers(pair.answer, language);

    candidates.push({
      id: candidateId(pair.question, language),
      question: pair.question,
      answer: pair.answer,
      language,
      category,
      wrongAnswers,
      source,
      difficulty,
      tags,
      likes: 0,
      shares: 0,
      sourceUrl: result.source.url,
      sourceHandle: result.source.label,
      sourcePlatform: result.source.platform,
      transcriptSnippet: pair.snippet,
    });
  }

  return candidates.slice(0, 40);
}

