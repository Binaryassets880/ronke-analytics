import { assetFromParam } from "@/lib/format";
import { getHolders, getMetaState } from "@/lib/queries-cached";
import { HoldersView } from "../components/HoldersView";

// Stays force-dynamic: this page reads searchParams, so the render itself cannot be
// statically cached. The Neon reads behind it ARE cached - see lib/queries-cached.ts -
// which is where the compute cost actually was (2026-08-27, perf/neon-compute-cost).
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
