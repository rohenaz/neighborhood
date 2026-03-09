import { geocodeCache } from "./cache.ts";
import type { Coordinates } from "./types.ts";

const NOMINATIM_BASE = "https://nominatim.openstreetmap.org";
const USER_AGENT = "neighborhood-mcp/1.0 (crime-data-aggregator)";

// State abbreviation/name → capital city ZIP code
const STATE_TO_ZIP: Record<string, string> = {
  AL: "36104", AK: "99801", AZ: "85001", AR: "72201", CA: "95814",
  CO: "80202", CT: "06103", DE: "19901", FL: "32301", GA: "30303",
  HI: "96813", ID: "83702", IL: "62701", IN: "46204", IA: "50309",
  KS: "66603", KY: "40601", LA: "70802", ME: "04330", MD: "21401",
  MA: "02201", MI: "48933", MN: "55101", MS: "39201", MO: "65101",
  MT: "59601", NE: "68502", NV: "89701", NH: "03301", NJ: "08608",
  NM: "87501", NY: "12207", NC: "27601", ND: "58501", OH: "43215",
  OK: "73102", OR: "97301", PA: "17101", RI: "02903", SC: "29201",
  SD: "57501", TN: "37219", TX: "78701", UT: "84111", VT: "05602",
  VA: "23219", WA: "98501", WV: "25301", WI: "53703", WY: "82001",
  DC: "20001",
};

const STATE_NAMES: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA",
  colorado: "CO", connecticut: "CT", delaware: "DE", florida: "FL", georgia: "GA",
  hawaii: "HI", idaho: "ID", illinois: "IL", indiana: "IN", iowa: "IA",
  kansas: "KS", kentucky: "KY", louisiana: "LA", maine: "ME", maryland: "MD",
  massachusetts: "MA", michigan: "MI", minnesota: "MN", mississippi: "MS", missouri: "MO",
  montana: "MT", nebraska: "NE", nevada: "NV", "new hampshire": "NH", "new jersey": "NJ",
  "new mexico": "NM", "north carolina": "NC", "north dakota": "ND", ohio: "OH",
  oklahoma: "OK", oregon: "OR", pennsylvania: "PA", "rhode island": "RI", "south carolina": "SC",
  "south dakota": "SD", tennessee: "TN", texas: "TX", utah: "UT", vermont: "VT",
  virginia: "VA", washington: "WA", "west virginia": "WV", wisconsin: "WI", wyoming: "WY",
  "district of columbia": "DC", dc: "DC",
};

// State capital display names for context
const STATE_CAPITALS: Record<string, string> = {
  AL: "Montgomery", AK: "Juneau", AZ: "Phoenix", AR: "Little Rock", CA: "Sacramento",
  CO: "Denver", CT: "Hartford", DE: "Dover", FL: "Tallahassee", GA: "Atlanta",
  HI: "Honolulu", ID: "Boise", IL: "Springfield", IN: "Indianapolis", IA: "Des Moines",
  KS: "Topeka", KY: "Frankfort", LA: "Baton Rouge", ME: "Augusta", MD: "Annapolis",
  MA: "Boston", MI: "Lansing", MN: "Saint Paul", MS: "Jackson", MO: "Jefferson City",
  MT: "Helena", NE: "Lincoln", NV: "Carson City", NH: "Concord", NJ: "Trenton",
  NM: "Santa Fe", NY: "Albany", NC: "Raleigh", ND: "Bismarck", OH: "Columbus",
  OK: "Oklahoma City", OR: "Salem", PA: "Harrisburg", RI: "Providence", SC: "Columbia",
  SD: "Pierre", TN: "Nashville", TX: "Austin", UT: "Salt Lake City", VT: "Montpelier",
  VA: "Richmond", WA: "Olympia", WV: "Charleston", WI: "Madison", WY: "Cheyenne",
  DC: "Washington",
};

/**
 * Resolve a location string to a ZIP code.
 * Accepts: ZIP code, state abbreviation ("AL"), state name ("Alabama"), or city name ("Birmingham, AL").
 * Returns { zip, label } where label is a human-friendly description.
 * For city names, falls back to Nominatim geocoding (async).
 */
export function resolveLocationSync(input: string): { zip: string; label: string } | null {
  const trimmed = input.trim();

  // Already a ZIP code
  if (/^\d{5}$/.test(trimmed)) {
    return { zip: trimmed, label: trimmed };
  }

  // State abbreviation (case-insensitive)
  const upper = trimmed.toUpperCase();
  if (STATE_TO_ZIP[upper]) {
    const capital = STATE_CAPITALS[upper] ?? "";
    return { zip: STATE_TO_ZIP[upper], label: `${capital}, ${upper}` };
  }

  // Full state name (case-insensitive)
  const lower = trimmed.toLowerCase();
  const abbr = STATE_NAMES[lower];
  if (abbr && STATE_TO_ZIP[abbr]) {
    const capital = STATE_CAPITALS[abbr] ?? "";
    return { zip: STATE_TO_ZIP[abbr], label: `${capital}, ${abbr}` };
  }

  return null;
}

/**
 * Resolve any location string to a ZIP code — tries local lookup first,
 * then falls back to Nominatim for city/place names.
 */
export async function resolveLocation(input: string): Promise<{ zip: string; label: string } | null> {
  // Try local (states + ZIP codes) first
  const local = resolveLocationSync(input);
  if (local) return local;

  // Fall back to Nominatim free-text geocoding for city names
  const trimmed = input.trim();
  if (trimmed.length < 2) return null;

  const cacheKey = `resolve:${trimmed.toLowerCase()}`;
  const cached = geocodeCache.get(cacheKey);
  if (cached) {
    // We stored the resolved zip in displayName for cache reuse
    return { zip: (cached as Coordinates & { resolvedZip?: string }).resolvedZip ?? "", label: cached.displayName ?? trimmed };
  }

  try {
    // Step 1: Forward geocode to get coordinates
    const searchUrl = new URL(`${NOMINATIM_BASE}/search`);
    searchUrl.searchParams.set("q", `${trimmed}, United States`);
    searchUrl.searchParams.set("format", "json");
    searchUrl.searchParams.set("limit", "1");
    searchUrl.searchParams.set("addressdetails", "1");

    const searchResponse = await fetch(searchUrl.toString(), {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    });

    if (!searchResponse.ok) return null;

    const results = (await searchResponse.json()) as Array<NominatimResult & {
      address?: { postcode?: string; city?: string; town?: string; state?: string; country_code?: string };
    }>;
    if (!results.length || !results[0]) return null;

    const result = results[0];

    // Only accept US results
    if (result.address?.country_code && result.address.country_code !== "us") return null;

    const city = result.address?.city ?? result.address?.town ?? trimmed;
    const state = result.address?.state ?? "";

    // If forward geocode returned a postcode, use it
    let zip = result.address?.postcode;
    if (zip && /^\d{5}/.test(zip)) {
      zip = zip.slice(0, 5);
    } else {
      // Step 2: Reverse geocode the center point to get a ZIP
      const lat = result.lat;
      const lon = result.lon;
      const reverseUrl = new URL(`${NOMINATIM_BASE}/reverse`);
      reverseUrl.searchParams.set("lat", lat);
      reverseUrl.searchParams.set("lon", lon);
      reverseUrl.searchParams.set("format", "json");
      reverseUrl.searchParams.set("addressdetails", "1");
      reverseUrl.searchParams.set("zoom", "18");

      const reverseResponse = await fetch(reverseUrl.toString(), {
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      });

      if (!reverseResponse.ok) return null;

      const reverseResult = (await reverseResponse.json()) as {
        address?: { postcode?: string };
      };

      zip = reverseResult.address?.postcode;
      if (!zip || !/^\d{5}/.test(zip)) return null;
      zip = zip.slice(0, 5);
    }

    const label = state ? `${city}, ${state}` : city;

    // Cache the result
    const coords: Coordinates & { resolvedZip?: string } = {
      lat: Number.parseFloat(result.lat),
      lng: Number.parseFloat(result.lon),
      displayName: label,
      resolvedZip: zip,
    };
    geocodeCache.set(cacheKey, coords);

    return { zip, label };
  } catch {
    return null;
  }
}

interface NominatimResult {
  lat: string;
  lon: string;
  display_name: string;
  boundingbox: [string, string, string, string]; // [minLat, maxLat, minLng, maxLng]
}

export async function zipToCoordinates(zipCode: string): Promise<Coordinates> {
  const cacheKey = `zip:${zipCode}`;
  const cached = geocodeCache.get(cacheKey);
  if (cached) return cached;

  const url = new URL(`${NOMINATIM_BASE}/search`);
  url.searchParams.set("postalcode", zipCode);
  url.searchParams.set("country", "US");
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");

  const response = await fetch(url.toString(), {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(
      `Nominatim geocoding failed: HTTP ${response.status} ${response.statusText}`
    );
  }

  const results = (await response.json()) as NominatimResult[];

  if (!results.length) {
    throw new Error(`No coordinates found for zip code: ${zipCode}`);
  }

  const result = results[0];
  if (!result) {
    throw new Error(`No coordinates found for zip code: ${zipCode}`);
  }

  const coords: Coordinates = {
    lat: Number.parseFloat(result.lat),
    lng: Number.parseFloat(result.lon),
    displayName: result.display_name,
    boundingBox: {
      minLat: Number.parseFloat(result.boundingbox[0]),
      maxLat: Number.parseFloat(result.boundingbox[1]),
      minLng: Number.parseFloat(result.boundingbox[2]),
      maxLng: Number.parseFloat(result.boundingbox[3]),
    },
  };

  geocodeCache.set(cacheKey, coords);
  return coords;
}

/**
 * Convert radius in miles to approximate degrees (for bounding box queries).
 * 1 degree latitude ≈ 69 miles. Longitude varies by latitude.
 */
export function milesToDegrees(
  miles: number,
  lat: number
): { latDelta: number; lngDelta: number } {
  const latDelta = miles / 69.0;
  const lngDelta = miles / (69.0 * Math.cos((lat * Math.PI) / 180));
  return { latDelta, lngDelta };
}

/**
 * Build a bounding box [minLng, minLat, maxLng, maxLat] from center + radius in miles.
 */
export function buildBoundingBox(
  lat: number,
  lng: number,
  radiusMiles: number
): { minLat: number; maxLat: number; minLng: number; maxLng: number } {
  const { latDelta, lngDelta } = milesToDegrees(radiusMiles, lat);
  return {
    minLat: lat - latDelta,
    maxLat: lat + latDelta,
    minLng: lng - lngDelta,
    maxLng: lng + lngDelta,
  };
}

/**
 * Convert radius in miles to degrees (used by SpotCrime which takes a radius in degrees).
 */
export function milesToDegreesSimple(miles: number): number {
  return miles / 69.0;
}
