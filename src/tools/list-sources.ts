import type { IncidentSource, SourceStatus } from "../types.ts";

interface SourceMeta {
  name: IncidentSource;
  label: string;
  coverage: string;
  updateFrequency: string;
  requiresApiKey: boolean;
  apiKeyEnvVar?: string;
  signupUrl?: string;
  unlocks: string;
  testUrl: string;
}

export const SOURCE_METADATA: SourceMeta[] = [
  {
    name: "arcgis",
    label: "ArcGIS Open Data",
    coverage: "County/city GIS portals with public crime layers",
    updateFrequency: "Varies by agency — typically daily to weekly",
    requiresApiKey: false,
    unlocks: "GIS-sourced crime data from local government open data portals",
    testUrl: "https://www.arcgis.com/",
  },
  {
    name: "news",
    label: "Crime News (RSS)",
    coverage: "Google News + Patch.com local feeds",
    updateFrequency: "Real-time (RSS)",
    requiresApiKey: false,
    unlocks: "Local crime news headlines and alerts from RSS feeds",
    testUrl: "https://news.google.com/rss/search?q=crime",
  },
  {
    name: "socrata",
    label: "Socrata Open Data (SODA API)",
    coverage:
      "Hundreds of US city police department open data portals with real-time crime incident data",
    updateFrequency: "Varies by city — typically daily",
    requiresApiKey: false,
    unlocks:
      "Point-level crime incident data from city open data portals (Chicago, NYC, Austin, etc.)",
    testUrl: "https://api.us.socrata.com/api/catalog/v1?limit=1",
  },
  {
    name: "fbi",
    label: "FBI Crime Data Explorer",
    coverage: "National — NIBRS data for 18,000+ law enforcement agencies",
    updateFrequency: "Annual (prior-year aggregate data)",
    requiresApiKey: true,
    apiKeyEnvVar: "FBI_API_KEY",
    signupUrl: "https://api.data.gov/signup",
    unlocks:
      "Historical crime statistics by offense type for nearby agencies — adds trend context to real-time data",
    testUrl: "https://api.usa.gov/crime/fbi/cde/",
  },
];

async function checkSourceOnline(testUrl: string): Promise<boolean> {
  try {
    const response = await fetch(testUrl, {
      method: "HEAD",
      signal: AbortSignal.timeout(5000),
      headers: { "User-Agent": "neighborhood-mcp/1.0" },
    });
    return response.ok || response.status < 500;
  } catch {
    return false;
  }
}

export async function listSources(): Promise<{
  sources: SourceStatus[];
  summary: {
    active: number;
    available: number;
    total: number;
    missingKeys: string[];
    tip: string;
  };
}> {
  const checks = await Promise.allSettled(
    SOURCE_METADATA.map(async (meta) => {
      const online = await checkSourceOnline(meta.testUrl);
      const hasApiKey = meta.requiresApiKey
        ? Boolean(meta.apiKeyEnvVar && process.env[meta.apiKeyEnvVar])
        : true;

      const status: SourceStatus = {
        name: meta.name,
        label: meta.label,
        online,
        coverage: meta.coverage,
        updateFrequency: meta.updateFrequency,
        requiresApiKey: meta.requiresApiKey,
        apiKeyEnvVar: meta.apiKeyEnvVar,
        hasApiKey,
        lastChecked: new Date().toISOString(),
      };

      if (meta.requiresApiKey && !hasApiKey) {
        status.error = `Add ${meta.apiKeyEnvVar} to unlock: ${meta.unlocks}`;
      }

      return status;
    })
  );

  const sources = checks.map((result, i): SourceStatus => {
    const meta = SOURCE_METADATA[i];
    if (result.status === "fulfilled") return result.value;

    return {
      name: meta?.name ?? ("unknown" as IncidentSource),
      label: meta?.label ?? "Unknown",
      online: false,
      coverage: meta?.coverage ?? "Unknown",
      updateFrequency: meta?.updateFrequency ?? "Unknown",
      requiresApiKey: meta?.requiresApiKey ?? false,
      hasApiKey: false,
      lastChecked: new Date().toISOString(),
      error:
        result.reason instanceof Error
          ? result.reason.message
          : String(result.reason),
    };
  });

  const active = sources.filter((s) => s.online && s.hasApiKey).length;
  const available = sources.filter(
    (s) => s.online && !s.hasApiKey && s.requiresApiKey
  ).length;

  const missingKeys = SOURCE_METADATA.filter(
    (m) => m.requiresApiKey && m.apiKeyEnvVar && !process.env[m.apiKeyEnvVar]
  ).map((m) => `${m.apiKeyEnvVar} — ${m.unlocks} (free: ${m.signupUrl})`);

  const tip =
    missingKeys.length > 0
      ? `Connect ${missingKeys.length} more API${missingKeys.length > 1 ? "s" : ""} for broader coverage. Add keys to ~/.config/neighborhood/.env`
      : "All available sources are connected.";

  return {
    sources,
    summary: {
      active,
      available,
      total: sources.length,
      missingKeys,
      tip,
    },
  };
}
