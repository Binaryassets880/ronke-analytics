import { assetFromParam } from "@/lib/format";
import { getOverview, getMetaState } from "@/lib/queries";
import { OverviewView } from "./components/OverviewView";

export const dynamic = "force-dynamic"; // reads live snapshot tables

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ asset?: string }>;
}) {
  const { asset: assetParam } = await searchParams;
  const asset = assetFromParam(assetParam);
  const [data, meta] = await Promise.all([getOverview(asset), getMetaState()]);
  return <OverviewView asset={asset} data={data} meta={meta} />;
}
