/**
 * Renders the API reference as one plain-markdown document for LLM consumption
 * (the /llms.txt convention).
 *
 * Why this exists alongside openapi.json: OpenAPI is a machine schema, and a
 * coding agent handed one can call the endpoints but has no idea which field to
 * build on, that absence means zero, or that the data is a day old. Those are
 * exactly the things that produce confidently-wrong integrations. This document
 * carries the same endpoint list PLUS the prose, in the format an agent reads
 * best - so a developer can paste one URL into Claude and get working code.
 *
 * Generated from config/apiDocs.ts, the same catalog the /developers page and
 * the OpenAPI document use, so all three cannot disagree.
 *
 * Pure and synchronous: takes the origin, returns a string. Keeps it testable
 * without a request.
 */

import { API_BASE, ENDPOINTS, ERROR_REFERENCE, CAVEATS } from "@/config/apiDocs";

function fence(lang: string, body: string): string {
  return "```" + lang + "\n" + body + "\n```";
}

export function renderLlmsTxt(origin: string): string {
  const base = `${origin}${API_BASE}`;
  const out: string[] = [];

  out.push("# Ronke Score API");
  out.push("");
  out.push(
    "Public, free, keyless, read-only HTTP API for the Ronke ecosystem on the Ronin chain: " +
      "per-wallet Ronke Score, wallet holdings, earned badges, and Ronkeverse NFT rarity. " +
      "Built for anyone making a Ronke game, Discord bot, or site that wants to gate content, " +
      "award perks, or render leaderboards.",
  );
  out.push("");
  out.push(`Base URL: \`${base}\``);
  out.push("");
  out.push(
    "Every successful response is `{ data, meta }`. Every error is " +
      "`{ error: { code, message } }`. CORS is open, so browser clients can call it directly. " +
      "No authentication, no API key, no rate limit headers - just be reasonable and cache.",
  );
  out.push("");

  out.push("## Read this before writing code");
  out.push("");
  for (const c of CAVEATS) {
    out.push(`### ${c.title}`);
    out.push("");
    out.push(c.body);
    out.push("");
  }

  out.push("## Endpoints");
  out.push("");
  for (const e of ENDPOINTS) {
    out.push(`### GET ${API_BASE}${e.path}`);
    out.push("");
    out.push(`**${e.summary}.** ${e.description}`);
    out.push("");
    out.push(`Cached ${e.cacheSeconds} seconds at the edge.`);
    out.push("");
    if (e.params.length > 0) {
      out.push("Parameters:");
      out.push("");
      for (const p of e.params) {
        const bits = [p.in, p.required ? "required" : "optional"];
        if (p.schema.default != null) bits.push(`default ${p.schema.default}`);
        if (p.schema.minimum != null || p.schema.maximum != null) {
          bits.push(`range ${p.schema.minimum ?? "-"}..${p.schema.maximum ?? "-"}`);
        }
        out.push(`- \`${p.name}\` (${bits.join(", ")}) - ${p.description}`);
      }
      out.push("");
    }
    out.push("Example response:");
    out.push("");
    out.push(fence("json", JSON.stringify(e.example, null, 2)));
    out.push("");
  }

  out.push("## Errors");
  out.push("");
  out.push("| code | HTTP | meaning |");
  out.push("| --- | --- | --- |");
  for (const e of ERROR_REFERENCE) {
    out.push(`| \`${e.code}\` | ${e.status} | ${e.meaning} |`);
  }
  out.push("");

  out.push("## Worked examples");
  out.push("");
  out.push("Look up one wallet. Accepts a 0x address or a cached .ron name.");
  out.push("");
  out.push(
    fence(
      "js",
      `const res = await fetch(
  "${base}/score/0x36175b2c13e39de1a79583fa3476d124dc8dfb70"
);
const { data, meta } = await res.json();

// score, rank and percentile all come back - build on whichever fits.
// found:false means the wallet has no score yet, NOT an error.
if (!data.found) return "no standing yet";
console.log(data.score, data.rank, data.percentile, "as of", meta.as_of);`,
    ),
  );
  out.push("");
  out.push(
    "Check many wallets at once (up to 50). Results come back in the order you asked, " +
      "including duplicates, so you can zip them onto your input list. Sort the addresses for " +
      "a better cache hit rate.",
  );
  out.push("");
  out.push(
    fence(
      "js",
      `const wallets = [...guildMembers].sort();
const res = await fetch(\`${base}/scores?addresses=\${wallets.join(",")}\`);
const { data } = await res.json();
for (const s of data.scores) {
  // s.found === false => no score. Absent from the set, not an error.
}`,
    ),
  );
  out.push("");
  out.push(
    "Periodic re-check over an entire membership - pull the whole scored set and diff it " +
      "locally instead of paging. Watch `meta.as_of` so you only do the work when there is new " +
      "data, and trust the dump's own `as_of` rather than `/meta`'s, since the two are cached " +
      "separately.",
  );
  out.push("");
  out.push(
    fence(
      "js",
      `let applied = null;

const meta = await (await fetch("${base}/meta")).json();
if (meta.data.as_of !== applied) {
  const dump = await (await fetch("${base}/scores/all")).json();

  // Skip this tick if the dump has not caught up, or is truncated -
  // pruning on a partial set would strip roles from everyone missing.
  if (dump.meta.as_of === meta.data.as_of && dump.data.complete) {
    const byAddress = new Map(dump.data.scores.map((s) => [s.address, s]));
    // ... apply byAddress to your members ...
    applied = dump.meta.as_of;
  }
}`,
    ),
  );
  out.push("");

  out.push("## Notes an integrator usually asks about");
  out.push("");
  out.push(
    "- **Coverage.** Every wallet with a non-zero Ronke Score is included - this is not a " +
      "top-N list. Every current Ronkeverse NFT holder is scored, with no exceptions; a wallet " +
      "holding a single NFT still scores. The only current holders absent are dust wallets " +
      "whose entire position rounds to zero points.",
  );
  out.push(
    "- **Not a holder census.** Because zero-score wallets are never stored, the full dump is " +
      "complete for gating but should not be read as a list of all holders.",
  );
  out.push(
    "- **Balances.** Token balances come back as both `balance_raw` (exact base units, a " +
      "string) and `balance_whole` (a convenience float). Use `balance_raw` for anything " +
      "numeric - balances exceed what a JSON number represents exactly.",
  );
  out.push(
    "- **1/1 NFTs.** Community and official 1/1s carry a `tier` and a `null` `rarity_rank` on " +
      "purpose: they sit outside the standard rarity ladder rather than at the top of it.",
  );
  out.push(
    "- **Timestamps** are ISO 8601 UTC. `meta.as_of` is the nightly rebuild the response came " +
      "from.",
  );
  out.push(
    "- **Versioning.** Breaking changes ship under a new path (`/api/v2`, and so on); `v1` " +
      "keeps serving for at least 90 days after any successor is announced. Additive fields " +
      "can appear in `v1` at any time, so ignore keys you do not recognise.",
  );
  out.push("");
  out.push(`Machine-readable OpenAPI 3.1 schema: \`${base}/openapi.json\``);
  out.push(`Human-readable docs: \`${origin}/developers\``);
  out.push("");

  return out.join("\n");
}
