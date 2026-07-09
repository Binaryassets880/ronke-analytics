import type { MetaState, SupplyStats } from "@/lib/queries";
import { BurnCard } from "./BurnCard";
import { StalenessBadge } from "./StalenessBadge";

/**
 * Burn tracker page body: both token cards stacked ($RONKE above $RONKESTR,
 * per the founder's mock), always shown together - no asset toggle here.
 * Pure - rendered from props so it is testable without any network call.
 */
export function BurnView({
  ronke,
  ronkestr,
  meta,
  now,
}: {
  ronke: SupplyStats | null;
  ronkestr: SupplyStats | null;
  meta: MetaState;
  now?: Date;
}) {
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Burn Tracker</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Supply destroyed forever, reconstructed from the on-chain transfer ledger. Updated daily.
          </p>
        </div>
        <StalenessBadge lastRebuildAt={meta.lastRebuildAt} now={now} />
      </div>

      <div className="space-y-6">
        <BurnCard symbol="RONKE" subtitle="Ronke Token" stats={ronke} />
        <BurnCard symbol="RONKESTR" subtitle="NFTStrategy Token" stats={ronkestr} />
      </div>
    </div>
  );
}
