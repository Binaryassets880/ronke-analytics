import { assetFromParam } from "@/lib/format";
import { getOverview, getMetaState, getTokenMarket, getNftMarket, getSupplyStats } from "@/lib/queries-cached";
import { OverviewView } from "../components/OverviewView";

// Stays force-dynamic: this page reads searchParams, so the render itself cannot be
// statically cached. The Neon reads behind it ARE cached - see lib/queries-cached.ts -
// which is where the compute cost actually was (2026-08-27, perf/neon-compute-cost).
export const dynamic = "force-dynamic"; // reads live snapshot tables

export const metadata = { title: "Overview" };

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ asset?: string }>;
}) {
  const { asset: assetParam } = await searchParams;
  const asset = assetFromParam(assetParam);
  const isNft = asset === "ronkeverse_nft";
  const [data, meta, tokenMarket, nftMarket, supply] = await Promise.all([
    getOverview(asset),
    getMetaState(),
    isNft ? Promise.resolve(null) : getTokenMarket(asset),
    isNft ? getNftMarket() : Promise.resolve(null),
    // Isolated: a transient Neon error degrades the burn card to its
    // placeholder instead of 500ing the whole overview.
    isNft ? Promise.resolve(null) : getSupplyStats(asset).catch(() => null),
  ]);
  return (
    <OverviewView
      asset={asset}
      data={data}
      meta={meta}
      tokenMarket={tokenMarket}
      nftMarket={nftMarket}
      supply={supply}
    />
  );
}
