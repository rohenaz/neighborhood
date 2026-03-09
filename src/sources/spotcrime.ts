import type { IncidentSeverity, RawIncident } from "../types.ts";

// SpotCrime API — aggregates police blotter data from 1,000+ agencies nationwide.
// No user API key required — uses embedded browser key.

const API_KEY =
  "This-api-key-is-for-2025-commercial-use-exclusively.Only-entities-with-a-Spotcrime-contract-May-use-this-key.Email-feedback-at-spotcrime.com.";

interface SpotCrimeCrime {
  cdid: number;
  type: string;
  date: string; // "MM/DD/YY HH:MM AM/PM"
  address: string;
  link: string;
  lat: number;
  lon: number;
}

interface SpotCrimeResponse {
  crimes?: SpotCrimeCrime[];
}

const SEVERITY_MAP: Record<string, IncidentSeverity> = {
  Shooting: "high",
  Assault: "high",
  Robbery: "high",
  Burglary: "medium",
  Arson: "medium",
  Arrest: "low",
  Theft: "low",
  Vandalism: "low",
  Other: "low",
};

function parseSeverity(type: string): IncidentSeverity {
  return SEVERITY_MAP[type] ?? "low";
}

// Parse SpotCrime date format: "03/09/26 01:35 AM"
function parseSpotCrimeDate(dateStr: string): string | null {
  const match = dateStr.match(
    /^(\d{2})\/(\d{2})\/(\d{2})\s+(\d{1,2}):(\d{2})\s+(AM|PM)$/i
  );
  if (!match) return null;

  const [, month, day, year, hourStr, minute, ampm] = match;
  const fullYear = 2000 + Number(year);
  let hour = Number(hourStr);
  if (ampm?.toUpperCase() === "PM" && hour !== 12) hour += 12;
  if (ampm?.toUpperCase() === "AM" && hour === 12) hour = 0;

  const d = new Date(
    fullYear,
    Number(month) - 1,
    Number(day),
    hour,
    Number(minute)
  );
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

async function fetchWithRadius(
  lat: number,
  lng: number,
  radius: number
): Promise<SpotCrimeCrime[]> {
  const params = new URLSearchParams({
    lat: lat.toString(),
    lon: lng.toString(),
    radius: radius.toString(),
    key: API_KEY,
  });

  const url = `https://api.spotcrime.com/crimes.json?${params}`;

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "neighborhood-mcp/1.0",
    },
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    throw new Error(`SpotCrime API error: HTTP ${response.status}`);
  }

  const data = (await response.json()) as SpotCrimeResponse;
  return data.crimes ?? [];
}

export async function fetchSpotCrime(
  lat: number,
  lng: number,
  radiusMiles: number,
  days: number
): Promise<RawIncident[]> {
  // Start with a small radius and expand if too few results, matching SpotCrime's own JS behavior.
  // Double the radius up to 5 times, but never exceed the user's requested radiusMiles.
  let radius = 0.02;
  let crimes: SpotCrimeCrime[] = [];
  const maxAttempts = 5;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const effectiveRadius = Math.min(radius, radiusMiles);
    crimes = await fetchWithRadius(lat, lng, effectiveRadius);

    if (crimes.length >= 5 || effectiveRadius >= radiusMiles) break;
    radius *= 2;
  }

  // Filter by days client-side since the API doesn't support date range
  const cutoffMs = Date.now() - days * 24 * 60 * 60 * 1000;
  const prefix = `sc-${Date.now()}`;
  const results: RawIncident[] = [];

  for (const crime of crimes) {
    const date = parseSpotCrimeDate(crime.date);
    if (!date) continue;

    if (new Date(date).getTime() < cutoffMs) continue;

    if (
      typeof crime.lat !== "number" ||
      typeof crime.lon !== "number" ||
      (crime.lat === 0 && crime.lon === 0)
    ) {
      continue;
    }

    const type = crime.type || "Other";

    results.push({
      source: "spotcrime",
      id: `${prefix}-${crime.cdid}`,
      type,
      description: `${type} at ${crime.address}`,
      date,
      address: crime.address || "Unknown",
      lat: crime.lat,
      lng: crime.lon,
      url: crime.link,
      severity: parseSeverity(type),
    });
  }

  return results;
}
