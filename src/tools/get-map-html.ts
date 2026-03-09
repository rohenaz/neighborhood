import { zipToCoordinates } from "../geocode.ts";
import type { IncidentFeature } from "../types.ts";
import { getIncidents } from "./get-incidents.ts";

export interface GetMapHtmlInput {
  zipCode: string;
  radius?: number;
  days?: number;
}

// shadcn/ui-inspired color palette
const colors = {
  // Severity-based
  high: "#ef4444", // red-500
  medium: "#f97316", // orange-500
  low: "#22c55e", // green-500

  // Type-based
  theft: "#3b82f6", // blue-500
  assault: "#ef4444", // red-500
  vehicle: "#a855f7", // purple-500
  drugs: "#ec4899", // pink-500
  vandalism: "#f59e0b", // amber-500
  sexOffender: "#7c3aed", // violet-500
  news: "#64748b", // slate-500
  other: "#06b6d4", // cyan-500

  // UI
  background: "#09090b", // zinc-950
  card: "#18181b", // zinc-900
  cardForeground: "#fafafa", // zinc-50
  border: "#27272a", // zinc-800
  muted: "#71717a", // zinc-500
  mutedForeground: "#a1a1aa", // zinc-400
  accent: "#3b82f6", // blue-500
  ring: "#3b82f6", // blue-500
};

function pinColor(type: string, severity?: string): string {
  if (severity === "high") return colors.high;
  if (severity === "medium") return colors.medium;

  const lower = type.toLowerCase();
  if (lower.includes("theft") || lower.includes("burglary"))
    return colors.theft;
  if (lower.includes("assault") || lower.includes("robbery"))
    return colors.assault;
  if (lower.includes("auto") || lower.includes("vehicle"))
    return colors.vehicle;
  if (lower.includes("drug") || lower.includes("narcotic")) return colors.drugs;
  if (lower.includes("vandal")) return colors.vandalism;
  if (lower.includes("sex") || lower.includes("offender"))
    return colors.sexOffender;
  if (lower.includes("news") || lower.includes("alert")) return colors.news;
  return colors.other;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function featureToMarkerJs(feature: IncidentFeature): string {
  const { coordinates } = feature.geometry;
  const lat = coordinates[1];
  const lng = coordinates[0];
  const p = feature.properties;
  const color = pinColor(p.type, p.severity);
  const date = new Date(p.date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  const linkHtml = p.url
    ? `<a href="${escapeHtml(p.url)}" target="_blank" rel="noopener noreferrer" class="popup-link">View source &rarr;</a>`
    : "";
  const severityBadge = p.severity
    ? `<span class="badge badge-${p.severity}">${p.severity}</span>`
    : "";
  const popupContent = `
    <div class="popup">
      <div class="popup-header">
        <span class="popup-dot" style="background:${color}"></span>
        <strong>${escapeHtml(p.type)}</strong>
        ${severityBadge}
      </div>
      <p class="popup-desc">${escapeHtml(p.description)}</p>
      <div class="popup-meta">
        <span>${escapeHtml(p.address)}</span>
        <span>${date}</span>
        <span class="popup-source">${escapeHtml(p.source)}</span>
      </div>
      ${linkHtml}
    </div>
  `.trim();

  return `
  (function() {
    var m = L.circleMarker([${lat}, ${lng}], {
      radius: 6,
      fillColor: "${color}",
      color: "${colors.background}",
      weight: 1.5,
      opacity: 1,
      fillOpacity: 0.9
    }).addTo(markers);
    m.bindPopup(${JSON.stringify(popupContent)}, {className:'dark-popup',maxWidth:300});
  })();`.trim();
}

function buildLegendItems(features: IncidentFeature[]): string {
  const types = new Map<string, string>();
  for (const f of features) {
    if (!types.has(f.properties.type)) {
      types.set(
        f.properties.type,
        pinColor(f.properties.type, f.properties.severity)
      );
    }
  }

  return Array.from(types.entries())
    .slice(0, 12)
    .map(
      ([type, color]) =>
        `<div class="legend-item">
          <span class="legend-dot" style="background:${color}"></span>
          <span>${escapeHtml(type)}</span>
        </div>`
    )
    .join("\n");
}

export async function getMapHtml(input: GetMapHtmlInput): Promise<string> {
  const { zipCode, radius = 5, days = 30 } = input;

  const [coords, collection] = await Promise.all([
    zipToCoordinates(zipCode),
    getIncidents({ zipCode, radius, days }),
  ]);

  const { lat, lng } = coords;
  const features = collection.features;
  const markersJs = features.map(featureToMarkerJs).join("\n");
  const legendItems = buildLegendItems(features);
  const sourceCount = new Set(features.map((f) => f.properties.source)).size;

  const errorMessages = collection.sourceErrors
    .map(
      (e) =>
        `<div class="error-item"><span class="error-source">${escapeHtml(e.source)}</span> ${escapeHtml(e.error)}</div>`
    )
    .join("");
  const errorBanner =
    collection.sourceErrors.length > 0
      ? `<div class="error-banner">${errorMessages}</div>`
      : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Crime Map — ${escapeHtml(zipCode)}</title>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin="" />
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --background: ${colors.background};
      --card: ${colors.card};
      --card-fg: ${colors.cardForeground};
      --border: ${colors.border};
      --muted: ${colors.muted};
      --muted-fg: ${colors.mutedForeground};
      --accent: ${colors.accent};
      --radius: 8px;
      --font: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', system-ui, sans-serif;
    }

    body {
      font-family: var(--font);
      background: var(--background);
      color: var(--card-fg);
      height: 100vh;
      display: flex;
      flex-direction: column;
      -webkit-font-smoothing: antialiased;
    }

    /* Header */
    .header {
      padding: 14px 20px;
      background: var(--card);
      border-bottom: 1px solid var(--border);
      flex-shrink: 0;
      display: flex;
      align-items: baseline;
      gap: 16px;
    }
    .header h1 {
      font-size: 15px;
      font-weight: 600;
      letter-spacing: -0.01em;
      white-space: nowrap;
    }
    .header .meta {
      font-size: 13px;
      color: var(--muted-fg);
      display: flex;
      gap: 12px;
    }
    .header .meta span { white-space: nowrap; }
    .header .stat {
      font-variant-numeric: tabular-nums;
      color: var(--card-fg);
      font-weight: 500;
    }

    /* Map */
    #map { flex: 1; }

    /* Legend card */
    .legend {
      position: absolute;
      bottom: 24px;
      right: 12px;
      z-index: 1000;
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 12px 14px;
      max-height: 300px;
      overflow-y: auto;
      min-width: 150px;
      backdrop-filter: blur(8px);
    }
    .legend h3 {
      font-size: 11px;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      margin-bottom: 10px;
      color: var(--muted);
    }
    .legend-item {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 6px;
      font-size: 12px;
      color: var(--muted-fg);
    }
    .legend-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      flex-shrink: 0;
      border: 1.5px solid var(--background);
    }

    /* Error banner */
    .error-banner {
      position: absolute;
      top: 64px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 1000;
      max-width: 480px;
      width: 90%;
      background: hsl(24 94% 10%);
      border: 1px solid hsl(24 94% 20%);
      border-radius: var(--radius);
      padding: 10px 14px;
      font-size: 12px;
      color: hsl(24 94% 70%);
    }
    .error-item { margin-bottom: 2px; }
    .error-source {
      font-weight: 600;
      text-transform: uppercase;
      font-size: 10px;
      letter-spacing: 0.04em;
      margin-right: 4px;
    }

    /* Popup overrides */
    .dark-popup .leaflet-popup-content-wrapper {
      background: var(--card);
      color: var(--card-fg);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      box-shadow: 0 4px 12px rgba(0,0,0,0.4);
    }
    .dark-popup .leaflet-popup-tip { background: var(--card); }
    .dark-popup .leaflet-popup-close-button { color: var(--muted); }
    .dark-popup .leaflet-popup-close-button:hover { color: var(--card-fg); }

    .popup { font-family: var(--font); min-width: 200px; }
    .popup-header {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 6px;
      font-size: 13px;
    }
    .popup-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      flex-shrink: 0;
    }
    .popup-desc {
      font-size: 12px;
      color: var(--muted-fg);
      line-height: 1.4;
      margin-bottom: 8px;
    }
    .popup-meta {
      display: flex;
      flex-direction: column;
      gap: 2px;
      font-size: 11px;
      color: var(--muted);
    }
    .popup-source {
      text-transform: uppercase;
      letter-spacing: 0.04em;
      font-size: 10px;
      font-weight: 500;
    }
    .popup-link {
      display: inline-block;
      margin-top: 8px;
      font-size: 12px;
      color: var(--accent);
      text-decoration: none;
    }
    .popup-link:hover { text-decoration: underline; }

    /* Badges */
    .badge {
      font-size: 10px;
      font-weight: 500;
      padding: 1px 6px;
      border-radius: 9999px;
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }
    .badge-high { background: hsl(0 84% 15%); color: hsl(0 84% 70%); }
    .badge-medium { background: hsl(24 94% 15%); color: hsl(24 94% 70%); }
    .badge-low { background: hsl(142 72% 12%); color: hsl(142 72% 65%); }

    /* Leaflet tile filter */
    .leaflet-tile-pane { filter: brightness(0.75) saturate(0.6) contrast(1.1); }
  </style>
</head>
<body>
  <div class="header">
    <h1>${escapeHtml(zipCode)}</h1>
    <div class="meta">
      <span><span class="stat">${features.length}</span> incidents</span>
      <span><span class="stat">${sourceCount}</span> sources</span>
      <span><span class="stat">${radius}</span>mi radius</span>
      <span>last <span class="stat">${days}</span> days</span>
    </div>
  </div>
  <div id="map"></div>
  <div class="legend">
    <h3>Crime Types</h3>
    ${legendItems || '<div class="legend-item" style="color:var(--muted)">No incidents found</div>'}
  </div>
  ${errorBanner}

  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV/XN/WLs=" crossorigin=""></script>
  <script>
    var map = L.map('map', { zoomControl: false }).setView([${lat}, ${lng}], 13);

    L.control.zoom({ position: 'topright' }).addTo(map);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
      maxZoom: 19
    }).addTo(map);

    // Search area
    L.circle([${lat}, ${lng}], {
      radius: ${radius * 1609.34},
      color: '${colors.accent}',
      fillColor: '${colors.accent}',
      fillOpacity: 0.04,
      weight: 1,
      dashArray: '6 4'
    }).addTo(map);

    // Center pin
    L.circleMarker([${lat}, ${lng}], {
      radius: 8,
      fillColor: '${colors.accent}',
      color: '${colors.background}',
      weight: 2,
      fillOpacity: 0.6
    }).addTo(map).bindPopup('<div class="popup"><strong>ZIP ${escapeHtml(zipCode)}</strong></div>', {className:'dark-popup'});

    // Incident markers
    var markers = L.layerGroup().addTo(map);
    ${markersJs}
  </script>
</body>
</html>`;
}
