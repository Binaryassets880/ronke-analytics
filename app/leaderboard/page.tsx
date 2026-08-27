import { assetFromParam } from "@/lib/format";
import { getLeaderboard, getScoreLeaderboard } from "@/lib/queries-cached";
import { LeaderboardView } from "../components/LeaderboardView";
import { ScoreLeaderboardView } from "../components/ScoreLeaderboardView";

// Stays force-dynamic: this page reads searchParams, so the render itself cannot be
// statically cached. The Neon reads behind it ARE cached - see lib/queries-cached.ts -
// which is where the compute cost actually was (2026-08-27, perf/neon-compute-cost).
export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ asset?: string; by?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const page = Math.max(0, Number(sp.page ?? "0") || 0);

  // Ronke Score is the default, headline leaderboard (global, asset-agnostic).
  // The only other mode is per-asset Holdings.
  if (sp.by !== "size") {
    const rows = await getScoreLeaderboard(page, PAGE_SIZE);
    return <ScoreLeaderboardView page={page} rows={rows} pageSize={PAGE_SIZE} />;
  }

  const asset = assetFromParam(sp.asset);
  const rows = await getLeaderboard(asset, page, PAGE_SIZE);
  return <LeaderboardView asset={asset} page={page} rows={rows} pageSize={PAGE_SIZE} />;
}
