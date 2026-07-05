import { getToken } from "@/lib/queries";
import { TokenDetailView } from "@/app/components/TokenDetailView";
import { EmptyState } from "@/app/components/States";

export const dynamic = "force-dynamic";

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
