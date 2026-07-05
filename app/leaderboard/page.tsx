import { assetFromParam } from "@/lib/format";
import { getLeaderboard } from "@/lib/queries";
import { LeaderboardView } from "../components/LeaderboardView";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ asset?: string; by?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const asset = assetFromParam(sp.asset);
  const by = sp.by === "diamond" ? "diamond" : "size";
  const page = Math.max(0, Number(sp.page ?? "0") || 0);
  const rows = await getLeaderboard(asset, by, page, PAGE_SIZE);
  return <LeaderboardView asset={asset} by={by} page={page} rows={rows} pageSize={PAGE_SIZE} />;
}
