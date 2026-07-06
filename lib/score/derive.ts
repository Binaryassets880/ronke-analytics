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
        nftRarityFactors: [],
        nftHold: null,
        bodyTypesHeld: 0,
        bodyTypesTotal,
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

  // Per-asset metrics -> per-asset hold behavior.
  const metrics = await sql`
    SELECT asset, address, holding_duration_days, never_sold, ever_paper_sold FROM holder_metrics
  `;
  for (const r of metrics) {
    const hold = {
      durationDays: Number(r.holding_duration_days),
      neverSold: r.never_sold as boolean,
      everPaperSold: r.ever_paper_sold as boolean,
    };
    const a = ensure(r.address as string);
    if (r.asset === "ronke_token") a.ronkeHold = hold;
    else a.nftHold = hold;
  }

  // Held NFTs -> rarity factors (rarer rank => higher factor in (0,1]).
  if (revealedSupply > 0) {
    const nftRows = await sql`
      SELECT l.address, tr.rarity_rank
      FROM holder_lots l
      JOIN token_rarity tr ON tr.token_id = l.token_id
      WHERE l.asset = 'ronkeverse_nft' AND l.quantity_remaining > 0 AND tr.rarity_rank IS NOT NULL
    `;
    for (const r of nftRows) {
      const rank = Number(r.rarity_rank);
      const factor = (revealedSupply - rank + 1) / revealedSupply;
      ensure(r.address as string).nftRarityFactors.push(factor);
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

/** Compute + persist wallet_scores. Returns the number of scored wallets. */
export async function deriveScores(sql: Sql): Promise<number> {
  const inputs = await assembleScoreInputs(sql);
  await sql`DELETE FROM wallet_scores`;
  const rows: unknown[][] = [];
  for (const [address, input] of inputs) {
    const r = computeScore(input);
    // Skip wallets that score zero (never meaningfully held) to keep the table lean.
    if (r.score <= 0) continue;
    const b = r.breakdown;
    rows.push([
      address, r.score, r.ronkeSubscore, r.nftSubscore,
      b.ronkeHoldingPoints, b.ronkeDurationPoints, b.ronkeDiamondMult,
      b.nftHoldingPoints, b.nftDurationPoints, b.nftDiamondMult,
      b.collectorPoints, b.bodyTypesHeld, b.bodyTypesTotal,
    ]);
  }
  await insertMany(
    sql,
    "wallet_scores",
    [
      "address", "score", "ronke_subscore", "nft_subscore",
      "ronke_holding", "ronke_duration", "ronke_diamond_mult",
      "nft_holding", "nft_duration", "nft_diamond_mult",
      "collector_points", "body_types_held", "body_types_total",
    ],
    rows,
  );
  return rows.length;
}
