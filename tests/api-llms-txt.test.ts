import { describe, it, expect } from "vitest";
import { renderLlmsTxt } from "@/lib/api/llms-txt";
import { API_BASE, ENDPOINTS, ERROR_REFERENCE, CAVEATS } from "@/config/apiDocs";

const ORIGIN = "https://ronke-analytics.vercel.app";
const doc = renderLlmsTxt(ORIGIN);

describe("renderLlmsTxt", () => {
  it("documents every endpoint in the catalog", () => {
    // Generated from the same source as the docs page and the OpenAPI doc, so
    // a new route cannot appear in one and be missing from another.
    for (const e of ENDPOINTS) {
      expect(doc, e.path).toContain(`GET ${API_BASE}${e.path}`);
      expect(doc, e.path).toContain(e.summary);
    }
  });

  it("carries the caveats, not just the schema", () => {
    // This is the whole reason it exists alongside openapi.json: an agent with
    // only a schema writes confidently-wrong integrations.
    for (const c of CAVEATS) expect(doc).toContain(c.title);
    expect(doc).toContain("07:00 UTC");
    expect(doc).toContain("found:false");
  });

  it("lists every error code with its status", () => {
    for (const e of ERROR_REFERENCE) {
      expect(doc, e.code).toContain(`\`${e.code}\``);
    }
  });

  it("uses absolute URLs built from the caller's origin", () => {
    // The document gets pasted into chats detached from the site, so relative
    // paths would be useless. Preview and production must each self-describe.
    expect(doc).toContain(`${ORIGIN}${API_BASE}`);
    expect(doc).toContain(`${ORIGIN}/developers`);
    const other = renderLlmsTxt("https://preview.example.app");
    expect(other).toContain("https://preview.example.app/api/v1");
    expect(other).not.toContain(ORIGIN);
  });

  it("includes runnable examples for the three real integration shapes", () => {
    expect(doc).toContain("/score/0x");          // single lookup
    expect(doc).toContain("?addresses=");         // batch
    expect(doc).toContain("/scores/all");         // periodic re-check
    expect(doc).toContain("dump.data.complete");  // and the partial-set guard
  });

  it("answers the questions integrators actually ask", () => {
    expect(doc).toContain("balance_raw");
    expect(doc).toContain("rarity_rank");
    expect(doc).toContain("ISO 8601");
    expect(doc).toContain("90 days");
  });

  it("says nothing about retunes or which field to gate on", () => {
    // Founder decision 2026-08-12: the retune advisory was dropped entirely.
    // Devs get score, rank and percentile and decide for themselves.
    expect(doc).not.toMatch(/Gate on rank, not/i);
    expect(doc).not.toMatch(/rather than raw score/i);
    expect(doc).not.toMatch(/retune/i);
    expect(doc).not.toMatch(/17,133/);
  });

  it("is plain markdown with balanced code fences", () => {
    const fences = (doc.match(/```/g) ?? []).length;
    expect(fences % 2, "unbalanced code fences").toBe(0);
    expect(fences).toBeGreaterThan(0);
    expect(doc.startsWith("# Ronke Score API")).toBe(true);
  });

  it("stays small enough to paste into a chat", () => {
    // Rough token sanity: a doc that blows a context window defeats the point.
    expect(doc.length).toBeLessThan(60_000);
  });
});
