/**
 * Public API and score versioning.
 *
 * `API_VERSION` is the contract version in the URL path. It changes only on a
 * breaking change to response shapes, and the old version keeps serving for the
 * window stated in the developer docs.
 *
 * `scoreVersion()` is DERIVED, not hand-maintained: a hash over the scoring
 * config, computed once at module load. The alternative - a constant someone
 * must remember to bump after editing a weight - fails exactly when it matters,
 * because the person retuning `SCORE_CONFIG` is thinking about the curve, not
 * about integrators. Deriving it means any retune changes the string for free,
 * and a game can detect "the rules moved" by comparing it across responses.
 *
 * Deliberately covers SCORE_CONFIG only. DIAMOND_THRESHOLDS feeds the badge and
 * bucket engines as well as the score, so folding it in would churn the version
 * on changes that do not move a single point. It is still published verbatim at
 * /api/v1/config for anyone who wants to diff it.
 */

import { createHash } from "node:crypto";
import { SCORE_CONFIG } from "@/config/score";

export const API_VERSION = "v1";

/**
 * Stable JSON serialization: object keys sorted at every depth, so a cosmetic
 * key reorder in config/score.ts does not masquerade as a scoring change.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`);
  return `{${entries.join(",")}}`;
}

/** `v1-<8 hex>` over the canonical scoring config. Exported for testing. */
export function versionOf(config: unknown): string {
  const hash = createHash("sha256").update(canonicalJson(config)).digest("hex");
  return `${API_VERSION}-${hash.slice(0, 8)}`;
}

const SCORE_VERSION = versionOf(SCORE_CONFIG);

export function scoreVersion(): string {
  return SCORE_VERSION;
}
