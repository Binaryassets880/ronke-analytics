import type { Asset } from "@/config/contracts";
import { CONTRACTS } from "@/config/contracts";
import type { HoldersData, MetaState } from "@/lib/queries";
import { StatTile } from "./StatTile";
import { StalenessBadge } from "./StalenessBadge";
import { BarChart } from "./BarChart";
import { HolderTable } from "./HolderTable";
import { PreBackfill } from "./States";
import { formatPct } from "@/lib/format";

/** Holders + concentration presentational view (U7). Pure, testable via props. */
export function HoldersView({
  asset,
  data,
  meta,
  now,
}: {
  asset: Asset;
  data: HoldersData;
  meta: MetaState;
  now?: Date;
}) {
  if (!meta.backfillComplete) return <PreBackfill />;
  const assetLabel = CONTRACTS[asset].label;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">{assetLabel} · Holders &amp; concentration</h1>
        <StalenessBadge lastRebuildAt={meta.lastRebuildAt} now={now} />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatTile label="Gini coefficient" value={data.gini.toFixed(3)} sub="0 = equal, 1 = concentrated" />
        <StatTile label="Top-10 share" value={formatPct(data.top10Pct)} />
        <StatTile label="Holders shown" value={String(data.holders.length)} />
      </div>

      {data.histogram.length > 0 ? (
        <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
          <h2 className="mb-2 text-sm font-medium text-neutral-300">Balance distribution</h2>
          <BarChart bars={data.histogram} label="balance distribution" />
        </section>
      ) : null}

      <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
        <h2 className="mb-3 text-sm font-medium text-neutral-300">Holders</h2>
        <HolderTable rows={data.holders} asset={asset} />
      </section>
    </div>
  );
}
