import {
  getRarityLeaderboard,
  getTraitDistribution,
  getMetaState,
  getOneOfOneBucket,
} from "@/lib/queries";
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
  // The 1/1 buckets only render on the unfiltered first page; skip the fetch otherwise.
  const wantBuckets = !filter && page === 0;
  const [rows, distributions, meta, communityOneOfOnes, officialOneOfOnes] = await Promise.all([
    getRarityLeaderboard(page, PAGE_SIZE, filter),
    getTraitDistribution(),
    getMetaState(),
    wantBuckets ? getOneOfOneBucket("community_1of1") : Promise.resolve([]),
    wantBuckets ? getOneOfOneBucket("official_1of1") : Promise.resolve([]),
  ]);
  return (
    <RarityView
      rows={rows}
      distributions={distributions}
      meta={meta}
      filter={filter}
      page={page}
      pageSize={PAGE_SIZE}
      communityOneOfOnes={communityOneOfOnes}
      officialOneOfOnes={officialOneOfOnes}
    />
  );
}
