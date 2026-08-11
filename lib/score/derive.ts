/**
 * Ronke Score derivation (S-series). Assembles per-wallet inputs from the
 * derived snapshot tables - no chain calls - and writes wallet_scores. Runs as a
 * rebuild step after badges (both read only derived tables). Uses PER-ASSET
 * holder_metrics so the $RONKE and Ronkeverse sub-scores are behaviorally exact.
 */

import { insertMany, type Sql } from "@/db/client";
import { CONTRACTS } from "@/config/contracts";
import { SCORE_CONFIG } from "@/config/score";
import { computeScore, type ScoreInput } from "./compute";

const TOKEN_DECIMALS = CONTRACTS.ronke_token.decimals ?? 18;
const RONKESTR_DECIMALS = CONTRACTS.ronkestr_token.decimals ?? 18;

/** Assemble a ScoreInput per wallet from the derived tables. */
export async function assembleScoreInputs(sql: Sql): Promise<Map<string, ScoreInput>> {
  // Collection-wide constants first.
  const revRow = await sql`SELECT count(*)::int AS n FROM token_rarity WHERE rarity_rank IS NOT NULL`;
  const revealedSupply = Number(revRow[0]?.n ?? 0);
  const bodyTotalRow = await sql`
    SELECT count(DISTINCT value)::int AS n FROM nft_traits WHERE trait_type = ${SCORE_CONFIG.collector.bodyTrait}
  `;
  const bodyTypesTotal = Number(bodyTotalRow[0]?.n ?? 0);

  const map = new Map<string, ScoreInput>();
  const ensure = (address: string): ScoreInput => {
    let a = map.get(address);
    if (!a) {
      a = {
        ronkeBalanceWhole: 0,
        ronkeHold: null,
        ronkestrBalanceWhole: 0,
        ronkestrHold: null,
        nftRarityFactors: [],
        nftHold: null,
        bodyTypesHeld: 0,
        bodyTypesTotal,
        oneOfOneCount: 0,
      };
      map.set(address, a);
    }
    return a;
  };

  // $RONKE balances (current holders).
  const divisor = 10 ** TOKEN_DECIMALS;
  const balances = await sql`
    SELECT address, balance FROM holder_balances
    WHERE asset = 'ronke_token' AND is_current_holder = true
  `;
  for (const r of balances) {
    ensure(r.address as string).ronkeBalanceWhole = Number(BigInt(r.balance as string)) / divisor;
  }

  // RonkeStr balances (current holders).
  const ronkestrDivisor = 10 ** RONKESTR_DECIMALS;
  const ronkestrBalances = await sql`
    SELECT address, balance FROM holder_balances
    WHERE asset = 'ronkestr_token' AND is_current_holder = true
  `;
  for (const r of ronkestrBalances) {
    ensure(r.address as string).ronkestrBalanceWhole = Number(BigInt(r.balance as string)) / ronkestrDivisor;
  }

  // Per-asset metrics -> per-asset hold behavior. Duration uses the QUANTITY-
  // WEIGHTED holding age (not the oldest-lot age): a wallet that topped up recently
  // has its clock pulled toward the fresh units, so you can't reactivate an old dust
  // lot into instant max-duration, and sustained size is rewarded over a token stub.
  const metrics = await sql`
    SELECT asset, address, weighted_duration_days, never_sold, ever_paper_sold FROM holder_metrics
  `;
  for (const r of metrics) {
    const hold = {
      durationDays: Number(r.weighted_duration_days),
      neverSold: r.never_sold as boolean,
      everPaperSold: r.ever_paper_sold as boolean,
    };
    const a = ensure(r.address as string);
    if (r.asset === "ronke_token") a.ronkeHold = hold;
    else if (r.asset === "ronkestr_token") a.ronkestrHold = hold;
    else a.nftHold = hold;
  }

  // Held NFTs -> rarity factors (rarer rank => higher factor in (0,1]). Standard
  // tokens use their rank; 1/1s (null rank, bucketed) are top-tier so they take
  // the max factor of 1.0 rather than being dropped by the old rank filter.
  if (revealedSupply > 0) {
    const nftRows = await sql`
      SELECT l.address, tr.rarity_rank, tr.tier
      FROM holder_lots l
      JOIN token_rarity tr ON tr.token_id = l.token_id
      WHERE l.asset = 'ronkeverse_nft' AND l.quantity_remaining > 0
    `;
    for (const r of nftRows) {
      const tier = (r.tier as string) ?? "standard";
      let factor: number;
      if (tier === "standard") {
        if (r.rarity_rank == null) continue; // standard token still awaiting a rank
        factor = (revealedSupply - Number(r.rarity_rank) + 1) / revealedSupply;
      } else {
        factor = 1; // community/official 1/1 - rarest tier
      }
      ensure(r.address as string).nftRarityFactors.push(factor);
    }

    // Count 1/1s held per wallet for the flat one-of-one bonus.
    const oneOfOneRows = await sql`
      SELECT l.address, count(*)::int AS n
      FROM holder_lots l
      JOIN token_rarity tr ON tr.token_id = l.token_id
      WHERE l.asset = 'ronkeverse_nft' AND l.quantity_remaining > 0
        AND tr.tier IN ('community_1of1', 'official_1of1')
      GROUP BY l.address
    `;
    for (const r of oneOfOneRows) {
      ensure(r.address as string).oneOfOneCount = Number(r.n);
    }
  }

  // Distinct Body trait values held per wallet (collector progress).
  if (bodyTypesTotal > 0) {
    const bodyRows = await sql`
      SELECT l.address, count(DISTINCT nt.value)::int AS bodies
      FROM holder_lots l
      JOIN nft_traits nt ON nt.token_id = l.token_id AND nt.trait_type = ${SCORE_CONFIG.collector.bodyTrait}
      WHERE l.asset = 'ronkeverse_nft' AND l.quantity_remaining > 0
      GROUP BY l.address
    `;
    for (const r of bodyRows) {
      ensure(r.address as string).bodyTypesHeld = Number(r.bodies);
    }
  }

  return map;
}

/**
 * Assemble the ScoreInput for ONE wallet (the score-simulator prefill path).
 * Mirrors assembleScoreInputs exactly - same tables, same weighted duration,
 * same rarity-factor math - but scoped to a single address so the calculator
 * API doesn't scan every holder.
 */
export async function assembleScoreInputForWallet(sql: Sql, address: string): Promise<ScoreInput> {
  const revRow = await sql`SELECT count(*)::int AS n FROM token_rarity WHERE rarity_rank IS NOT NULL`;
  const revealedSupply = Number(revRow[0]?.n ?? 0);
  const bodyTotalRow = await sql`
    SELECT count(DISTINCT value)::int AS n FROM nft_traits WHERE trait_type = ${SCORE_CONFIG.collector.bodyTrait}
  `;
  const input: ScoreInput = {
    ronkeBalanceWhole: 0,
    ronkeHold: null,
    ronkestrBalanceWhole: 0,
    ronkestrHold: null,
    nftRarityFactors: [],
    nftHold: null,
    bodyTypesHeld: 0,
    bodyTypesTotal: Number(bodyTotalRow[0]?.n ?? 0),
    oneOfOneCount: 0,
  };

  const balances = await sql`
    SELECT asset, balance FROM holder_balances
    WHERE address = ${address} AND is_current_holder = true
      AND asset IN ('ronke_token', 'ronkestr_token')
  `;
  for (const r of balances) {
    const whole = Number(BigInt(r.balance as string));
    if (r.asset === "ronke_token") input.ronkeBalanceWhole = whole / 10 ** TOKEN_DECIMALS;
    else input.ronkestrBalanceWhole = whole / 10 ** RONKESTR_DECIMALS;
  }

  const metrics = await sql`
    SELECT asset, weighted_duration_days, never_sold, ever_paper_sold
    FROM holder_metrics WHERE address = ${address}
  `;
  for (const r of metrics) {
    const hold = {
      durationDays: Number(r.weighted_duration_days),
      neverSold: r.never_sold as boolean,
      everPaperSold: r.ever_paper_sold as boolean,
    };
    if (r.asset === "ronke_token") input.ronkeHold = hold;
    else if (r.asset === "ronkestr_token") input.ronkestrHold = hold;
    else input.nftHold = hold;
  }

  if (revealedSupply > 0) {
    const nftRows = await sql`
      SELECT tr.rarity_rank, tr.tier
      FROM holder_lots l
      JOIN token_rarity tr ON tr.token_id = l.token_id
      WHERE l.address = ${address} AND l.asset = 'ronkeverse_nft' AND l.quantity_remaining > 0
    `;
    for (const r of nftRows) {
      const tier = (r.tier as string) ?? "standard";
      if (tier === "standard") {
        if (r.rarity_rank == null) continue;
        input.nftRarityFactors.push((revealedSupply - Number(r.rarity_rank) + 1) / revealedSupply);
      } else {
        input.nftRarityFactors.push(1);
        input.oneOfOneCount += 1;
      }
    }
  }

  if (input.bodyTypesTotal > 0) {
    const bodyRows = await sql`
      SELECT count(DISTINCT nt.value)::int AS bodies
      FROM holder_lots l
      JOIN nft_traits nt ON nt.token_id = l.token_id AND nt.trait_type = ${SCORE_CONFIG.collector.bodyTrait}
      WHERE l.address = ${address} AND l.asset = 'ronkeverse_nft' AND l.quantity_remaining > 0
    `;
    input.bodyTypesHeld = Number(bodyRows[0]?.bodies ?? 0);
  }

  return input;
}

/**
 * Assign competition rank + percentile to already-computed scores.
 *
 * Competition ranking: equal scores share the LOWER rank, and the next distinct
 * score skips ahead (100, 100, 50 -> ranks 1, 1, 3). This reproduces exactly what
 * the old per-request `SELECT count(*) WHERE score > n` returned, so persisting it
 * is behavior-preserving for the profile page.
 *
 * Percentile is `100 * (population - rank) / population` over the scored
 * population - the share of scored wallets at or below you. Ties share a
 * percentile because they share a rank. Exported for direct unit testing.
 */
export function rankScores<T extends { score: number }>(
  scored: T[],
): (T & { rank: number; percentile: number })[] {
  const sorted = [...scored].sort((a, b) => b.score - a.score);
  const population = sorted.length;
  const ranked: (T & { rank: number; percentile: number })[] = [];
  let rank = 0;
  let lastScore: number | null = null;
  sorted.forEach((row, i) => {
    // Only advance the rank on a NEW score; ties keep the first one's rank.
    if (lastScore === null || row.score !== lastScore) {
      rank = i + 1;
      lastScore = row.score;
    }
    ranked.push({
      ...row,
      rank,
      percentile: population > 0 ? (100 * (population - rank)) / population : 0,
    });
  });
  return ranked;
}

/** Compute + persist wallet_scores. Returns the number of scored wallets. */
export async function deriveScores(sql: Sql): Promise<number> {
  const inputs = await assembleScoreInputs(sql);
  await sql`DELETE FROM wallet_scores`;
  const scored: { address: string; score: number; result: ReturnType<typeof computeScore> }[] = [];
  for (const [address, input] of inputs) {
    const r = computeScore(input);
    // Skip wallets that score zero (never meaningfully held) to keep the table
    // lean. NOTE: this makes wallet_scores "wallets with a non-zero score", NOT
    // "all holders" - anything treating it as the holder set will undercount,
    // and it is why the public API returns score 0 / rank null rather than 404.
    if (r.score <= 0) continue;
    scored.push({ address, score: r.score, result: r });
  }
  const rows: unknown[][] = rankScores(scored).map((s) => {
    const b = s.result.breakdown;
    return [
      s.address, s.result.score, s.result.ronkeSubscore, s.result.ronkestrSubscore, s.result.nftSubscore,
      b.ronkeHoldingPoints, b.ronkeDurationPoints, b.ronkeDiamondMult,
      b.ronkestrHoldingPoints, b.ronkestrDurationPoints, b.ronkestrDiamondMult,
      b.nftHoldingPoints, b.nftDurationPoints, b.nftDiamondMult,
      b.collectorPoints, b.bodyTypesHeld, b.bodyTypesTotal,
      b.oneOfOnePoints, b.oneOfOneCount,
      s.rank, s.percentile,
    ];
  });
  await insertMany(
    sql,
    "wallet_scores",
    [
      "address", "score", "ronke_subscore", "ronkestr_subscore", "nft_subscore",
      "ronke_holding", "ronke_duration", "ronke_diamond_mult",
      "ronkestr_holding", "ronkestr_duration", "ronkestr_diamond_mult",
      "nft_holding", "nft_duration", "nft_diamond_mult",
      "collector_points", "body_types_held", "body_types_total",
      "oneofone_points", "oneofone_count",
      "rank", "percentile",
    ],
    rows,
  );
  return rows.length;
}
