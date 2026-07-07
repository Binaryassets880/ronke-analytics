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
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">{assetLabel} · Holders &amp; concentration</h1>
        <StalenessBadge lastRebuildAt={meta.lastRebuildAt} now={now} />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatTile
          label="Gini coefficient"
          value={data.gini.toFixed(3)}
          sub="0 = equal, 1 = concentrated"
          hint="How evenly supply is spread across holders. 0 means everyone holds an equal amount; 1 means a few wallets hold nearly all of it."
        />
        <StatTile
          label="Top-10 share"
          value={formatPct(data.top10Pct)}
          hint="Share of total supply held by the 10 largest wallets."
        />
        <StatTile
          label="Holders shown"
          value={String(data.holders.length)}
          hint="How many holders are listed in the table below (a capped sample of the largest holders, not the full count)."
        />
      </div>

      {data.histogram.length > 0 ? (
        <section className="rv-card p-5">
          <h2 className="mb-3 text-sm font-medium text-[var(--muted)]">Balance distribution</h2>
          <BarChart bars={data.histogram} label="balance distribution" />
        </section>
      ) : null}

      <section className="rv-card p-5">
        <h2 className="mb-3 text-sm font-medium text-[var(--muted)]">Holders</h2>
        <HolderTable rows={data.holders} asset={asset} />
      </section>
    </div>
  );
}
