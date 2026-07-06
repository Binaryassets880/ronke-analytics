import { assetFromParam } from "@/lib/format";
import { getLeaderboard, getScoreLeaderboard } from "@/lib/queries";
import { LeaderboardView } from "../components/LeaderboardView";
import { ScoreLeaderboardView } from "../components/ScoreLeaderboardView";

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
  const by = sp.by === "size" ? "size" : sp.by === "diamond" ? "diamond" : "score";
  if (by === "score") {
    const rows = await getScoreLeaderboard(page, PAGE_SIZE);
    return <ScoreLeaderboardView page={page} rows={rows} pageSize={PAGE_SIZE} />;
  }

  const asset = assetFromParam(sp.asset);
  const rows = await getLeaderboard(asset, by, page, PAGE_SIZE);
  return <LeaderboardView asset={asset} by={by} page={page} rows={rows} pageSize={PAGE_SIZE} />;
}
