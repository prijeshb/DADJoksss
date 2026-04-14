export type SourcePlatform = "instagram" | "youtube" | "web";

export interface ScrapeSource {
  id: string;
  platform: SourcePlatform;
  label: string;
  url: string;
  language: "english" | "hinglish" | "mixed";
  active: boolean;
}

export const defaultSources: ScrapeSource[] = [
  {
    id: "ig-bekarobar",
    platform: "instagram",
    label: "bekarobar",
    url: "https://www.instagram.com/bekarobar/",
    language: "mixed",
    active: true,
  },
];

function isValidPlatform(value: unknown): value is SourcePlatform {
  return value === "instagram" || value === "youtube" || value === "web";
}

function toSource(raw: unknown): ScrapeSource | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;

  const id = typeof r.id === "string" ? r.id.trim() : "";
  const label = typeof r.label === "string" ? r.label.trim() : "";
  const url = typeof r.url === "string" ? r.url.trim() : "";
  const language = r.language;
  const platform = r.platform;
  const active = typeof r.active === "boolean" ? r.active : true;

  if (!id || !label || !url || !isValidPlatform(platform)) return null;
  if (language !== "english" && language !== "hinglish" && language !== "mixed") return null;

  return {
    id,
    platform,
    label,
    url,
    language,
    active,
  };
}

export function loadSourcesFromEnv(): ScrapeSource[] {
  const raw = process.env.SCRAPE_SOURCES_JSON;
  if (!raw) return defaultSources;

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return defaultSources;
    const sources = parsed.map(toSource).filter((v): v is ScrapeSource => v !== null);
    return sources.length > 0 ? sources : defaultSources;
  } catch {
    return defaultSources;
  }
}

