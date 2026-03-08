import type {
  IncidentFeature,
  IncidentFeatureCollection,
  IncidentSeverity,
  IncidentSource,
  RawIncident,
  SourceError,
} from "./types.ts";

const HIGH_SEVERITY_TYPES = new Set([
  "murder",
  "homicide",
  "rape",
  "robbery",
  "assault",
  "aggravated assault",
  "carjacking",
  "kidnapping",
  "shooting",
  "stabbing",
  "sex offense",
  "arson",
]);

const MEDIUM_SEVERITY_TYPES = new Set([
  "burglary",
  "breaking and entering",
  "auto theft",
  "vehicle theft",
  "theft from vehicle",
  "drug",
  "narcotics",
  "dui",
  "vandalism",
  "hit and run",
  "weapons",
  "fraud",
  "identity theft",
]);

export function classifySeverity(type: string): IncidentSeverity {
  const normalized = type.toLowerCase();
  for (const keyword of HIGH_SEVERITY_TYPES) {
    if (normalized.includes(keyword)) return "high";
  }
  for (const keyword of MEDIUM_SEVERITY_TYPES) {
    if (normalized.includes(keyword)) return "medium";
  }
  return "low";
}

export function normalizeToFeature(incident: RawIncident): IncidentFeature {
  return {
    type: "Feature",
    geometry: {
      type: "Point",
      coordinates: [incident.lng, incident.lat],
    },
    properties: {
      id: incident.id,
      source: incident.source,
      type: incident.type,
      description: incident.description,
      date: incident.date,
      address: incident.address,
      url: incident.url,
      severity: incident.severity ?? classifySeverity(incident.type),
    },
  };
}

export function buildFeatureCollection(
  zipCode: string,
  radius: number,
  days: number,
  incidents: RawIncident[],
  sourceErrors: SourceError[]
): IncidentFeatureCollection {
  const features = incidents.map(normalizeToFeature);

  const countBySource = {} as Record<IncidentSource, number>;
  const countByType: Record<string, number> = {};

  for (const incident of incidents) {
    countBySource[incident.source] = (countBySource[incident.source] ?? 0) + 1;
    const t = incident.type;
    countByType[t] = (countByType[t] ?? 0) + 1;
  }

  return {
    type: "FeatureCollection",
    features,
    metadata: {
      zipCode,
      radius,
      days,
      generatedAt: new Date().toISOString(),
      totalCount: features.length,
      countBySource,
      countByType,
    },
    sourceErrors,
  };
}
