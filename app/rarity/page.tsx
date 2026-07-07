import {
  getRarityLeaderboard,
  getTraitDistribution,
  getMetaState,
  getOneOfOneBucket,
  getOneOfOneCounts,
} from "@/lib/queries";
import { RarityView, type RarityViewMode } from "../components/RarityView";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 60;
const VIEWS: RarityViewMode[] = ["all", "community", "official", "standard"];

export default async function RarityPage({
  searchParams,
}: {
  searchParams: Promise<{ tt?: string; tv?: string; page?: string; view?: string }>;
}) {
  const sp = await searchParams;
  const filter = sp.tt && sp.tv ? { traitType: sp.tt, value: sp.tv } : undefined;
  const page = Math.max(0, Number(sp.page ?? "0") || 0);
  const view: RarityViewMode = VIEWS.includes(sp.view as RarityViewMode)
    ? (sp.view as RarityViewMode)
    : "all";

  // A trait filter forces the standard ladder; otherwise the tab decides the slice.
  const effectiveView: RarityViewMode = filter ? "standard" : view;
  const wantStandard = effectiveView === "all" || effectiveView === "standard";
  const wantCommunity = !filter && (view === "all" || view === "community");
  const wantOfficial = !filter && (view === "all" || view === "official");

  const [rows, distributions, meta, counts, communityOneOfOnes, officialOneOfOnes] = await Promise.all([
    wantStandard ? getRarityLeaderboard(page, PAGE_SIZE, filter) : Promise.resolve([]),
    getTraitDistribution(),
    getMetaState(),
    getOneOfOneCounts(),
    wantCommunity ? getOneOfOneBucket("community_1of1") : Promise.resolve([]),
    wantOfficial ? getOneOfOneBucket("official_1of1") : Promise.resolve([]),
  ]);

  return (
    <RarityView
      rows={rows}
      distributions={distributions}
      meta={meta}
      filter={filter}
      page={page}
      pageSize={PAGE_SIZE}
      view={view}
      counts={counts}
      communityOneOfOnes={communityOneOfOnes}
      officialOneOfOnes={officialOneOfOnes}
    />
  );
}
