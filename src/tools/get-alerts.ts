import { fetchNewsAlerts } from "../sources/news.ts";
import type { AlertsResult, SourceError } from "../types.ts";

export interface GetAlertsInput {
  zipCode: string;
  keywords?: string[];
}

export async function getAlerts(input: GetAlertsInput): Promise<AlertsResult> {
  const { zipCode, keywords = [] } = input;
  const sourceErrors: SourceError[] = [];

  let alerts: Awaited<ReturnType<typeof fetchNewsAlerts>> = [];

  try {
    alerts = await fetchNewsAlerts(zipCode, keywords);
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
