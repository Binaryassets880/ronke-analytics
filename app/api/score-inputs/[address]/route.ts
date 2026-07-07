/**
 * Raw Ronke Score inputs for one wallet (S-series, score-simulator prefill).
 * The calculator is a client component that tweaks knobs live, so unlike the
 * rest of the app (server components calling lib/queries directly) it needs a
 * fetchable endpoint. Returns the exact ScoreInput the nightly derive would
 * assemble for this wallet, plus the persisted score/rank for display.
 *
 * Accepts a 0x address or a .ron name (resolved on-chain, same as the wallet
 * profile route). An unknown-but-valid wallet returns a zeroed input with
 * found=false - the calculator then simulates from an empty bag.
 */

import { NextResponse } from "next/server";
import { getSql } from "@/db/client";
import { normalizeAddress } from "@/lib/format";
import { resolveNameLive } from "@/lib/rns/resolve";
import { assembleScoreInputForWallet } from "@/lib/score/derive";
import { computeScore } from "@/lib/score/compute";
import { getWalletScore } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ address: string }> },
) {
  const { address: raw } = await ctx.params;
  const decoded = decodeURIComponent(raw ?? "").trim().toLowerCase();

  let address = normalizeAddress(decoded);
  let name: string | null = null;
  if (!address && decoded.endsWith(".ron") && decoded.length > 4) {
    address = await resolveNameLive(decoded);
    name = address ? decoded : null;
  }
  if (!address) {
    return NextResponse.json(
      { error: "Enter a 0x wallet address or a .ron name." },
      { status: 400 },
    );
  }

  const sql = getSql();
  if (!sql) {
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  }

  try {
    const [input, persisted] = await Promise.all([
      assembleScoreInputForWallet(sql, address),
      getWalletScore(address),
    ]);
    const current = computeScore(input);
    const found =
      input.ronkeBalanceWhole > 0 ||
      input.ronkestrBalanceWhole > 0 ||
      input.nftRarityFactors.length > 0 ||
      input.ronkeHold != null ||
      input.ronkestrHold != null ||
      input.nftHold != null;
    return NextResponse.json({
      address,
      name,
      found,
      input,
      currentScore: current.score,
      persisted: persisted ? { score: persisted.score, rank: persisted.rank } : null,
    });
  } catch (e) {
    console.error("score-inputs failed", e);
    return NextResponse.json({ error: "Lookup failed. Try again." }, { status: 500 });
  }
}
