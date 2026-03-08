---
name: crime-report
description: Generate a comprehensive crime report for any US zip code
argument-hint: "<zip-code>"
allowed-tools:
  - mcp
  - Read
---

Parse the zip code from `$ARGUMENTS`. If no argument was provided, ask the user to supply a zip code before proceeding.

Call the following MCP tools in parallel:
- `get_incidents` with the zip code, a 30-day window, and a 5-mile radius
- `get_crime_stats` with the zip code and a 30-day window
- `get_alerts` with the zip code

After those return, call `get_map_html` with the zip code. Write the returned HTML to `/tmp/crime-map-[zip].html`, substituting the actual zip code. Tell the user the exact file path so they can open it in a browser.

Present the results using this structure:

```
## Crime Report: [Zip Code]
**Generated**: [current date and time]
**Radius**: 5 miles | **Period**: Last 30 days

### Summary
- Total incidents: X
- Trend: [increasing / decreasing / stable] (compare first half vs second half of the period)
- Top crime types: [ranked list]

### Severity Breakdown
- High (violent crimes): X
- Medium (property crimes): X
- Low (other): X

### Recent Alerts
[Top 5 items from get_alerts, each on its own line with date and headline]

### Data Sources
[For each of the four MCP calls, note whether it returned data or failed. Example: "get_incidents: OK", "get_alerts: unavailable"]

### Interactive Map
Saved to: /tmp/crime-map-[zip].html
Open this file in a browser to explore incident locations.
```

Rules to follow:
- If any source returned a `sourceErrors` field or failed, name the affected sources explicitly in the Data Sources section. Do not silently omit failures.
- State data freshness: note the timestamp or age of the most recent incident in the dataset.
- Do not fabricate incident counts or trend directions. If the data is insufficient to determine a trend, say so.
- Keep the report factual and neutral. Do not editorialize about neighborhood quality.
- If `get_incidents` returns zero results, state that clearly rather than showing empty fields.
