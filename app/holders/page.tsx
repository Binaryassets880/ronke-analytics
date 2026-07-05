import { assetFromParam } from "@/lib/format";
import { getHolders, getMetaState } from "@/lib/queries";
import { HoldersView } from "../components/HoldersView";

export const dynamic = "force-dynamic";

export default async function HoldersPage({
  searchParams,
}: {
  searchParams: Promise<{ asset?: string }>;
}) {
  const { asset: assetParam } = await searchParams;
  const asset = assetFromParam(assetParam);
  const [data, meta] = await Promise.all([getHolders(asset), getMetaState()]);
  return <HoldersView asset={asset} data={data} meta={meta} />;
}
