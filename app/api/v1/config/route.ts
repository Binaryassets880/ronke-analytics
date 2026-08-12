/**
 * GET /api/v1/config
 *
 * The live scoring rules: weights, curves, gates, diamond thresholds, and the
 * plain-English explainer.
 *
 * This exists so a game can render "here's how to rank up" from the rules that
 * are actually in force, instead of a copy pasted into its own codebase that
 * silently drifts the next time the score is retuned. It serializes the real
 * config objects - no hand-maintained duplicate - so drift is structurally
 * impossible rather than merely discouraged.
 */

import { SCORE_CONFIG } from "@/config/score";
import { SCORE_EXPLAINER } from "@/config/scoreExplainer";
import { DIAMOND_THRESHOLDS } from "@/config/contracts";
import { apiMeta, ok, fail, preflight, CACHE } from "@/lib/api/respond";

export async function GET() {
  try {
    const meta = await apiMeta();
    return ok(
      {
        score: SCORE_CONFIG,
        diamond_thresholds: DIAMOND_THRESHOLDS,
        explainer: SCORE_EXPLAINER,
        notes: {
          freshness:
            "Scores are rebuilt once daily at 07:00 UTC. `meta.as_of` is the rebuild this " +
            "data came from. Do not poll more often than that expects to see changes.",
          stability:
            "Raw `score` magnitudes shift whenever these weights are retuned, while `rank` and " +
            "`percentile` positions are unaffected. `meta.score_version` changes with the " +
            "weights, so you can detect a retune and recalibrate. Retunes require community " +
            "agreement, so they are rare and announced.",
          population:
            "`meta.population` counts wallets carrying a non-zero Ronke Score. Wallets that " +
            "score zero are not stored, so they are absent from rank and percentile entirely.",
        },
      },
      { meta, ttl: CACHE.config },
    );
  } catch (e) {
    console.error("GET /api/v1/config failed", e);
    return fail("internal", "Config lookup failed. Try again.", 500);
  }
}

export const OPTIONS = preflight;
