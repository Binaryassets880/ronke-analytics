/**
 * GET /api/v1/openapi.json
 *
 * Machine-readable spec, generated from the same config/apiDocs.ts catalog the
 * /developers page renders. Generated rather than hand-written for the usual
 * reason: a spec maintained separately from the docs is a spec that is wrong.
 */

import { API_BASE, ENDPOINTS, ERROR_REFERENCE } from "@/config/apiDocs";
import { API_VERSION } from "@/lib/api/version";
import { apiMeta, ok, fail, preflight, CACHE } from "@/lib/api/respond";

const ERROR_SCHEMA = {
  type: "object",
  properties: {
    error: {
      type: "object",
      properties: {
        code: { type: "string", enum: ERROR_REFERENCE.map((e) => e.code) },
        message: { type: "string" },
      },
      required: ["code", "message"],
    },
  },
  required: ["error"],
};

/** Build the OpenAPI 3.1 document. Pure; exported so a test can assert on it. */
export function buildOpenApiDocument(): Record<string, unknown> {
  const paths: Record<string, unknown> = {};

  for (const e of ENDPOINTS) {
    // Distinct error statuses this endpoint's params can actually produce.
    const statuses = new Set<number>([400, 500]);
    if (e.params.some((p) => p.name === "address")) statuses.add(404).add(503);
    if (e.path.startsWith("/nft")) statuses.add(404);

    paths[`${API_BASE}${e.path}`] = {
      get: {
        summary: e.summary,
        description: e.description,
        parameters: e.params.map((p) => ({
          name: p.name,
          in: p.in,
          required: p.required,
          description: p.description,
          schema: p.schema,
        })),
        responses: {
          "200": {
            description: `Success. Cached for ${e.cacheSeconds}s at the edge.`,
            headers: {
              "Cache-Control": {
                description: "Edge cache directive.",
                schema: { type: "string" },
              },
            },
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { data: {}, meta: { $ref: "#/components/schemas/Meta" } },
                  required: ["data", "meta"],
                },
                example: e.example,
              },
            },
          },
          ...Object.fromEntries(
            [...statuses].sort().map((status) => [
              String(status),
              {
                description:
                  ERROR_REFERENCE.filter((r) => r.status === status)
                    .map((r) => `${r.code}: ${r.meaning}`)
                    .join(" ") || "Error.",
                content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
              },
            ]),
          ),
        },
      },
    };
  }

  return {
    openapi: "3.1.0",
    info: {
      title: "Ronke Score API",
      version: API_VERSION,
      description:
        "Public, free, read-only API for the Ronke ecosystem. Data is a daily snapshot rebuilt " +
        "at 07:00 UTC - see meta.as_of. Every response carries score, rank and percentile; raw " +
        "score magnitudes shift if the scoring weights are retuned, while rank and percentile " +
        "positions do not (meta.score_version changes with the weights, so a retune is " +
        "detectable). An unknown wallet returns 200 with found:false and score 0, never a 404.",
    },
    servers: [{ url: "/", description: "Same origin as this document." }],
    paths,
    components: {
      schemas: {
        Meta: {
          type: "object",
          description: "Freshness and versioning attached to every successful response.",
          properties: {
            as_of: {
              type: ["string", "null"],
              format: "date-time",
              description: "Timestamp of the nightly rebuild this data came from.",
            },
            api_version: { type: "string" },
            score_version: {
              type: "string",
              description: "Changes whenever the scoring weights are retuned.",
            },
            population: {
              type: "integer",
              description: "Wallets carrying a non-zero Ronke Score; the percentile denominator.",
            },
          },
          required: ["as_of", "api_version", "score_version"],
        },
        Error: ERROR_SCHEMA,
      },
    },
  };
}

export async function GET() {
  try {
    const meta = await apiMeta();
    return ok(buildOpenApiDocument(), { meta, ttl: CACHE.config });
  } catch (e) {
    console.error("GET /api/v1/openapi.json failed", e);
    return fail("internal", "Spec generation failed.", 500);
  }
}

export const OPTIONS = preflight;
