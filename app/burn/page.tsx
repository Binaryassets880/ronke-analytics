import { getSupplyStats, getMetaState } from "@/lib/queries";
import { BurnView } from "../components/BurnView";

export const dynamic = "force-dynamic"; // reads live ledger aggregates

export const metadata = { title: "Burn Tracker" };

export default async function BurnPage() {
  const [ronke, ronkestr, meta] = await Promise.all([
    getSupplyStats("ronke_token"),
    getSupplyStats("ronkestr_token"),
    getMetaState(),
  ]);
  return <BurnView ronke={ronke} ronkestr={ronkestr} meta={meta} />;
}
