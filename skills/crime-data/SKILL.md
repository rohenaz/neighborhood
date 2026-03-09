---
name: crime-data
description: Use when a user asks about crime data, crime maps, neighborhood safety, crime reports, incident data, crime statistics, local crime, safety of an area, "is this zip code safe", "what crimes happened near me", crime trends, or safety assessments for any U.S. zip code. Queries live crime incidents, statistics, alerts, and interactive maps using the neighborhood MCP tools.
---

# Crime Data

Query, interpret, and present crime data for U.S. zip codes using the neighborhood MCP tools.

## Available MCP Tools

These are MCP tools — call them directly by name. Do NOT write scripts or simulate calls.

| Tool | Purpose | Required Args | Optional Args |
|------|---------|---------------|---------------|
| `get_incidents` | Raw incident points as GeoJSON | zipCode | radius (mi, default 5), sources (arcgis/fbi/news), days (default 30) |
| `get_crime_stats` | Aggregated counts, severity, trends | zipCode | days (default 30) |
| `get_alerts` | Recent news and RSS crime alerts | zipCode | keywords |
| `get_map_html` | Interactive Leaflet map rendered inline | zipCode | radius (mi, default 5), days (default 30) |
| `list_sources` | Status of all data sources | none | none |

## Data Sources

Three sources are available:

| Source | Best For | Notes |
|--------|---------|-------|
| ArcGIS | Official city/county GIS crime data | Dynamic service discovery per location |
| FBI | Annual/historical crime statistics | Requires FBI_API_KEY env var; slow, historical only |
| News RSS | Breaking crime news and alerts | Google News + Patch.com feeds |

## Quick Reference: What to Call

| User Wants | Tools to Call |
|------------|-------------|
| Crime map | `get_map_html` — renders inline via MCP Apps |
| Recent incidents | `get_incidents` with days: 7-14 |
| Full safety report | `get_map_html` + `get_crime_stats` + `get_alerts` |
| Crime trends | `get_crime_stats` with days: 90 or 365 |
| Just the news | `get_alerts` |
| Compare two areas | Run `get_crime_stats` for each zip, compare side-by-side |

## The Map Renders Inline

`get_map_html` is an MCP App tool. The interactive Leaflet map renders directly in the chat via a sandboxed iframe. You do NOT need to:
- Save HTML to a file
- Tell the user to open anything in a browser
- Extract or reformat the map data

Just call `get_map_html` and the host renders it automatically. The tool also returns a text summary for the model.

## Interpreting Results

### GeoJSON from `get_incidents`

Each feature has: id, type, description, date, address, source, severity, url. Summarize — don't dump raw JSON.

### Stats from `get_crime_stats`

Returns: countByType, severityBreakdown (high/medium/low), trend (increasing/decreasing/stable), totalIncidents.

### sourceErrors

Both `get_incidents` and `get_crime_stats` include `sourceErrors`. Always check it. If sources failed, tell the user which ones are missing.

## Severity Classification

| Severity | Crime Types |
|----------|------------|
| high | Homicide, assault, robbery, rape, shooting, carjacking, kidnapping |
| medium | Burglary, theft, auto theft, vandalism, arson, fraud |
| low | News items, alerts, unclassified reports |

## Parameter Defaults

- `radius`: 5 miles (increase to 10 for rural areas with sparse data)
- `days`: 30
- `sources`: all available (restrict only when the use case calls for it)

If fewer than 5 incidents returned, offer to expand radius or time window.
