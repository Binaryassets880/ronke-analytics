import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { readdirSync, existsSync } from "node:fs";
import { join, posix } from "node:path";
import { DeveloperDocsView } from "@/app/components/DeveloperDocsView";
import { buildOpenApiDocument } from "@/app/api/v1/openapi.json/route";
import { API_BASE, ENDPOINTS, ERROR_REFERENCE, CAVEATS } from "@/config/apiDocs";
import { sectionFor } from "@/app/components/EcosystemNav";
import { ERROR_CODES } from "@/lib/api/respond";

vi.mock("next/navigation", () => ({ usePathname: () => "/developers" }));

const API_ROOT = "app/api/v1";

/**
 * Endpoints that exist as routes but are intentionally absent from the catalog.
 * The spec documents the API; documenting the spec inside itself is noise.
 */
const UNDOCUMENTED_ROUTES = new Set(["/openapi.json"]);

/** Every route.ts under app/api/v1, as an OpenAPI-style path. */
function discoverRoutes(dir = API_ROOT, prefix = ""): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      // [address] -> {address}
      const segment = entry.name.replace(/^\[(.+)\]$/, "{$1}");
      out.push(...discoverRoutes(join(dir, entry.name), posix.join(prefix, segment)));
    } else if (entry.name === "route.ts") {
      out.push(prefix === "" ? "/" : `/${prefix}`);
    }
  }
  return out;
}

describe("API docs stay in sync with the routes", () => {
  const discovered = discoverRoutes().filter((p) => !UNDOCUMENTED_ROUTES.has(p));

  it("documents every route that exists (no undocumented endpoints)", () => {
    const documented = new Set(ENDPOINTS.map((e) => e.path));
    const missing = discovered.filter((p) => !documented.has(p));
    expect(missing, `undocumented routes: ${missing.join(", ")}`).toEqual([]);
  });

  it("documents no endpoint that does not exist (no phantom docs)", () => {
    const real = new Set(discovered);
    const phantom = ENDPOINTS.map((e) => e.path).filter((p) => !real.has(p));
    expect(phantom, `documented but missing: ${phantom.join(", ")}`).toEqual([]);
  });

  it("points each catalog entry at a route file that actually exists", () => {
    for (const e of ENDPOINTS) {
      expect(existsSync(e.file), `${e.path} -> ${e.file}`).toBe(true);
    }
  });

  it("documents only error codes the response layer can actually emit", () => {
    for (const e of ERROR_REFERENCE) {
      expect(ERROR_CODES as readonly string[]).toContain(e.code);
    }
  });

  it("gives every endpoint a non-zero cache lifetime", () => {
    // A documented endpoint with no caching would read Neon per request.
    for (const e of ENDPOINTS) expect(e.cacheSeconds, e.path).toBeGreaterThan(0);
  });
});

describe("DeveloperDocsView", () => {
  it("renders every documented endpoint path", () => {
    render(<DeveloperDocsView />);
    for (const e of ENDPOINTS) {
      expect(screen.getByText(`${API_BASE}${e.path}`), e.path).toBeInTheDocument();
    }
  });

  it("leads with the three caveats, before any endpoint", () => {
    const { container } = render(<DeveloperDocsView />);
    for (const c of CAVEATS) expect(screen.getByText(c.title)).toBeInTheDocument();
    const text = container.textContent ?? "";
    // The caveats are load-bearing: each one prevents a bug that looks like an
    // API fault. If they drift below the endpoint list, they stop being read.
    expect(text.indexOf(CAVEATS[0].title)).toBeLessThan(text.indexOf("Endpoints"));
  });

  it("states the freshness, retune, and absent-wallet facts explicitly", () => {
    const { container } = render(<DeveloperDocsView />);
    const text = container.textContent ?? "";
    expect(text).toContain("07:00 UTC");
    expect(text).toContain("score_version");
    expect(text).toContain("found:false");
  });

  it("surfaces all three standing fields without prescribing one", () => {
    // Founder decision 2026-08-12: state what is true, hand over every field,
    // and let each dev choose. The docs must NOT tell them which to gate on.
    const { container } = render(<DeveloperDocsView />);
    const text = container.textContent ?? "";
    for (const field of ["data.score", "data.rank", "data.percentile"]) {
      expect(text, field).toContain(field);
    }
    expect(text).not.toMatch(/Gate on rank, not/i);
    expect(text).not.toMatch(/\bPrefer `?rank`?\b/i);
    expect(text).not.toMatch(/rather than raw score/i);
  });

  it("points AI-assisted developers at /llms.txt", () => {
    const { container } = render(<DeveloperDocsView />);
    expect(container.querySelector('a[href="/llms.txt"]')).toBeTruthy();
    expect(container.textContent).toContain("llms.txt");
  });

  it("lists every documented error code", () => {
    render(<DeveloperDocsView />);
    for (const e of ERROR_REFERENCE) expect(screen.getByText(e.code)).toBeInTheDocument();
  });

  it("states the versioning policy so v1 is a real commitment", () => {
    const { container } = render(<DeveloperDocsView />);
    expect(container.textContent).toContain("90 days");
  });
});

describe("OpenAPI document", () => {
  const doc = buildOpenApiDocument() as {
    openapi: string;
    paths: Record<string, unknown>;
    components: { schemas: Record<string, unknown> };
    info: { description: string };
  };

  it("is valid JSON at 3.1 and lists the same paths as the catalog", () => {
    expect(doc.openapi).toBe("3.1.0");
    expect(() => JSON.parse(JSON.stringify(doc))).not.toThrow();
    expect(Object.keys(doc.paths).sort()).toEqual(
      ENDPOINTS.map((e) => `${API_BASE}${e.path}`).sort(),
    );
  });

  it("declares parameters and a 200 example for each endpoint", () => {
    for (const e of ENDPOINTS) {
      const op = (doc.paths[`${API_BASE}${e.path}`] as { get: Record<string, unknown> }).get;
      expect((op.parameters as unknown[]).length).toBe(e.params.length);
      expect(op.responses).toHaveProperty("200");
    }
  });

  it("carries the three caveats in the spec description too", () => {
    // Tooling users may never see the HTML page.
    expect(doc.info.description).toContain("07:00 UTC");
    expect(doc.info.description).toContain("rank");
    expect(doc.info.description).toContain("found:false");
  });

  it("defines the shared Meta and Error schemas", () => {
    expect(doc.components.schemas).toHaveProperty("Meta");
    expect(doc.components.schemas).toHaveProperty("Error");
  });
});

describe("nav wiring", () => {
  it("puts /developers in its own section, not under Analytics", () => {
    expect(sectionFor("/developers")).toBe("developers");
  });

  it("leaves the existing section mapping untouched", () => {
    expect(sectionFor("/")).toBe("home");
    expect(sectionFor("/overview")).toBe("rating");
    expect(sectionFor("/resources")).toBe("resources");
    expect(sectionFor("/apps")).toBe("apps");
    expect(sectionFor("/wallet/0xabc")).toBe("rating");
  });
});
