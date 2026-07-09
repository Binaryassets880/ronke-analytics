import { getSupplyStats, getMetaState } from "@/lib/queries";
import { BurnView } from "../components/BurnView";

export const dynamic = "force-dynamic"; // reads live ledger aggregates

export const metadata = { title: "Burn Tracker" };

export default async function BurnPage() {
  // Isolate each supply fetch: a transient Neon error on one token degrades
  // that card to its placeholder instead of rejecting the whole page. Meta
  // stays fatal - the staleness badge and backfill gate need it.
  const [ronke, ronkestr, meta] = await Promise.all([
    getSupplyStats("ronke_token").catch(() => null),
    getSupplyStats("ronkestr_token").catch(() => null),
    getMetaState(),
  ]);
  return <BurnView ronke={ronke} ronkestr={ronkestr} meta={meta} />;
}
