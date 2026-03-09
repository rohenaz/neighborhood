import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import { getAlerts } from "./tools/get-alerts.ts";
import { getCrimeStats } from "./tools/get-crime-stats.ts";
import { getIncidents } from "./tools/get-incidents.ts";
import { getMapHtml } from "./tools/get-map-html.ts";
import { listSources } from "./tools/list-sources.ts";
import type { IncidentSource } from "./types.ts";

// ---------------------------------------------------------------------------
// Input schemas
// ---------------------------------------------------------------------------

const GetIncidentsSchema = z.object({
  zipCode: z.string().min(5).max(10).describe("US ZIP code (e.g. 78701)"),
  radius: z
    .number()
    .positive()
    .max(50)
    .optional()
    .default(5)
    .describe("Search radius in miles (default: 5)"),
  sources: z
    .array(z.enum(["arcgis", "fbi", "news"]))
    .optional()
    .describe("Data sources to query (default: all)"),
  days: z
    .number()
    .int()
    .positive()
    .max(365)
    .optional()
    .default(30)
    .describe("Number of days to look back (default: 30)"),
});

const GetCrimeStatsSchema = z.object({
  zipCode: z.string().min(5).max(10).describe("US ZIP code"),
  days: z
    .number()
    .int()
    .positive()
    .max(365)
    .optional()
    .default(30)
    .describe("Number of days for recent trend analysis (default: 30)"),
});

const GetMapHtmlSchema = z.object({
  zipCode: z.string().min(5).max(10).describe("US ZIP code"),
  radius: z
    .number()
    .positive()
    .max(50)
    .optional()
    .default(5)
    .describe("Search radius in miles (default: 5)"),
  days: z
    .number()
    .int()
    .positive()
    .max(365)
    .optional()
    .default(30)
    .describe("Number of days to include (default: 30)"),
});

const GetAlertsSchema = z.object({
  zipCode: z.string().min(5).max(10).describe("US ZIP code"),
  keywords: z
    .array(z.string())
    .optional()
    .describe(
      "Keywords to filter crime news (default: broad crime-related terms)"
    ),
});

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

const TOOLS = [
  {
    name: "get_incidents",
    description:
      "Fetch recent crime incidents near a US ZIP code. Queries all connected sources in parallel and returns a unified GeoJSON FeatureCollection. Free sources (CrimeMapping, ArcGIS, NSOPW, news) work out of the box. Add FBI_API_KEY and SPOTCRIME_API_KEY for significantly more data. Run list_sources first to see what's connected.",
    inputSchema: {
      type: "object" as const,
      properties: {
        zipCode: {
          type: "string",
          description: "US ZIP code (e.g. 78701 for Austin, TX)",
        },
        radius: {
          type: "number",
          description: "Search radius in miles (default: 5, max: 50)",
          default: 5,
        },
        sources: {
          type: "array",
          items: {
            type: "string",
            enum: ["arcgis", "fbi", "news"],
          },
          description: "Specific data sources to query (default: all)",
        },
        days: {
          type: "number",
          description: "Days to look back (default: 30, max: 365)",
          default: 30,
        },
      },
      required: ["zipCode"],
    },
  },
  {
    name: "get_crime_stats",
    description:
      "Get aggregated crime statistics for a ZIP code: incident counts by type and severity, trend analysis, and historical FBI data. Best for understanding patterns. Add FBI_API_KEY for annual offense breakdowns from nearby agencies.",
    inputSchema: {
      type: "object" as const,
      properties: {
        zipCode: {
          type: "string",
          description: "US ZIP code",
        },
        days: {
          type: "number",
          description: "Days to include in recent trend (default: 30)",
          default: 30,
        },
      },
      required: ["zipCode"],
    },
  },
  {
    name: "list_sources",
    description:
      "Show all data sources with connection status, what each one provides, and which API keys you can add for more coverage. Returns a summary with actionable next steps.",
    inputSchema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "get_map_html",
    description:
      "Generate an interactive crime map as a self-contained HTML page. Uses OpenStreetMap tiles with color-coded markers by crime type, popups with incident details, a legend, and a dark UI. Save to a file and open in a browser, or render inline.",
    inputSchema: {
      type: "object" as const,
      properties: {
        zipCode: {
          type: "string",
          description: "US ZIP code",
        },
        radius: {
          type: "number",
          description: "Search radius in miles (default: 5)",
          default: 5,
        },
        days: {
          type: "number",
          description: "Days to include (default: 30)",
          default: 30,
        },
      },
      required: ["zipCode"],
    },
  },
  {
    name: "get_alerts",
    description:
      "Fetch recent crime news and alerts for a ZIP code from RSS feeds (Google News, Patch.com local). Returns article titles, links, and snippets. Optionally filter by keywords.",
    inputSchema: {
      type: "object" as const,
      properties: {
        zipCode: {
          type: "string",
          description: "US ZIP code",
        },
        keywords: {
          type: "array",
          items: { type: "string" },
          description:
            "Keywords to filter results (e.g. ['shooting', 'robbery'])",
        },
      },
      required: ["zipCode"],
    },
  },
] as const;

// ---------------------------------------------------------------------------
// Server setup
// ---------------------------------------------------------------------------

const server = new Server(
  {
    name: "neighborhood",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "get_incidents": {
        const input = GetIncidentsSchema.parse(args);
        const result = await getIncidents({
          zipCode: input.zipCode,
          radius: input.radius,
          sources: input.sources as IncidentSource[] | undefined,
          days: input.days,
        });
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "get_crime_stats": {
        const input = GetCrimeStatsSchema.parse(args);
        const result = await getCrimeStats(input);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "list_sources": {
        const result = await listSources();
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "get_map_html": {
        const input = GetMapHtmlSchema.parse(args);
        const html = await getMapHtml(input);
        return {
          content: [
            {
              type: "text" as const,
              text: html,
            },
          ],
        };
      }

      case "get_alerts": {
        const input = GetAlertsSchema.parse(args);
        const result = await getAlerts(input);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ error: message }, null, 2),
        },
      ],
      isError: true,
    };
  }
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("neighborhood MCP server running on stdio");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
