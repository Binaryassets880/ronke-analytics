import { assetFromParam } from "@/lib/format";
import { getOverview, getMetaState, getTokenMarket, getNftMarket } from "@/lib/queries";
import { OverviewView } from "../components/OverviewView";

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
  const [data, meta, tokenMarket, nftMarket] = await Promise.all([
    getOverview(asset),
    getMetaState(),
    isNft ? Promise.resolve(null) : getTokenMarket(asset),
    isNft ? getNftMarket() : Promise.resolve(null),
  ]);
  return (
    <OverviewView
      asset={asset}
      data={data}
      meta={meta}
      tokenMarket={tokenMarket}
      nftMarket={nftMarket}
    />
  );
}
