import { zipToCoordinates } from "../geocode.ts";
import { fetchNewsAlerts } from "../sources/news.ts";
import type { AlertsResult, SourceError } from "../types.ts";

export interface GetAlertsInput {
  zipCode: string;
  keywords?: string[];
}

export async function getAlerts(input: GetAlertsInput): Promise<AlertsResult> {
  const { zipCode, keywords = [] } = input;
  const sourceErrors: SourceError[] = [];

  // Geocode to get the display name for location-aware news queries
  let locationName: string | undefined;
  try {
    const coords = await zipToCoordinates(zipCode);
    locationName = coords.displayName;
  } catch {
    // If geocoding fails, we'll still search by zip code alone
  }

  let alerts: Awaited<ReturnType<typeof fetchNewsAlerts>> = [];

  try {
    alerts = await fetchNewsAlerts(zipCode, keywords, locationName);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[news] alerts fetch failed: ${msg}`);
    sourceErrors.push({
      source: "news",
      error: msg,
      timestamp: new Date().toISOString(),
    });
  }

  return {
    zipCode,
    alerts,
    totalCount: alerts.length,
    generatedAt: new Date().toISOString(),
    sourceErrors,
  };
}
