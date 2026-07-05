import { getRarityLeaderboard, getTraitDistribution, getMetaState } from "@/lib/queries";
import { RarityView } from "../components/RarityView";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 60;

export default async function RarityPage({
  searchParams,
}: {
  searchParams: Promise<{ tt?: string; tv?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const filter = sp.tt && sp.tv ? { traitType: sp.tt, value: sp.tv } : undefined;
  const page = Math.max(0, Number(sp.page ?? "0") || 0);
  const [rows, distributions, meta] = await Promise.all([
    getRarityLeaderboard(page, PAGE_SIZE, filter),
    getTraitDistribution(),
    getMetaState(),
  ]);
  return (
    <RarityView
      rows={rows}
      distributions={distributions}
      meta={meta}
      filter={filter}
      page={page}
      pageSize={PAGE_SIZE}
    />
  );
}
