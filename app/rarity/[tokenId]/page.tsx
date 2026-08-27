import { getToken } from "@/lib/queries-cached";
import { TokenDetailView } from "@/app/components/TokenDetailView";
import { EmptyState } from "@/app/components/States";

// ISR, not force-dynamic (2026-08-27, perf/neon-compute-cost). This page takes no
// searchParams, so the whole render is cacheable. It previously re-queried Neon on
// every request including every bot crawl, which is what kept this project's
// compute from ever scaling to zero. The data behind it moves once a day, when
// the sync Action rebuilds (.github/workflows/sync.yml).
export const revalidate = 3600;

export default async function TokenPage({
  params,
}: {
  params: Promise<{ tokenId: string }>;
}) {
  const { tokenId } = await params;
  const token = await getToken(tokenId);
  if (!token) {
    return (
      <EmptyState
        title={`No rarity data for Ronkeverse #${tokenId}.`}
        hint="The token may be unrevealed or metadata has not been ingested yet."
      />
    );
  }
  return <TokenDetailView token={token} />;
}
