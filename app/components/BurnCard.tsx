import { StatTile } from "./StatTile";
import type { SupplyStats } from "@/lib/queries";
import { formatCompact, formatPct } from "@/lib/format";

/**
 * Per-token burn tracker card (mock-faithful): header with the ticker and a big
 * "% Burned" headline, a burned-vs-total meter, and three stat tiles
 * (Circulating Supply / Burned Forever / Deflation Rate). Pure - rendered from
 * props so it is testable without any network call.
 *
 * "Deflation Rate" intentionally repeats the headline's cumulative burned share
 * (the mock shows the same number in both spots - emphasis, not a velocity).
 */
export function BurnCard({
  symbol,
  subtitle,
  stats,
}: {
  /** Ticker without the dollar sign, e.g. "RONKE". */
  symbol: string;
  /** Token descriptor under the ticker, e.g. "Ronke Token". */
  subtitle: string;
  /** Ledger-derived supply stats; null renders the unavailable placeholder. */
  stats: SupplyStats | null;
}) {
  if (!stats || stats.minted <= 0) {
    return (
      <section className="rv-card p-5 sm:p-6" aria-label={`${symbol} burn stats`}>
        <h2 className="text-2xl font-bold tracking-tight">${symbol}</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">{subtitle}</p>
        <p className="mt-4 text-sm text-[var(--muted-2)]">Burn data temporarily unavailable</p>
      </section>
    );
  }

  const share = Math.min(1, Math.max(0, stats.burnedPct));
  const pctLabel = formatPct(stats.burnedPct, 2);
  const burnedLabel = `${formatCompact(stats.burned)} ${symbol}`;
  const totalLabel = `${formatCompact(stats.minted)} ${symbol}`;

  return (
    <section className="rv-card p-5 sm:p-6" aria-label={`${symbol} burn stats`}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">${symbol}</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">{subtitle}</p>
        </div>
        <div className="sm:text-right">
          <div className="mono text-4xl font-bold tracking-tight text-[var(--burn)]">{pctLabel}</div>
          <div className="mt-1 text-xs uppercase tracking-wide text-[var(--muted-2)]">Burned</div>
        </div>
      </div>

      <div className="mt-5">
        <div className="flex items-baseline justify-between text-xs text-[var(--muted)]">
          <span>
            Burned: <span className="mono text-[var(--burn)]">{burnedLabel}</span>
          </span>
          <span>
            Total Supply: <span className="mono">{totalLabel}</span>
          </span>
        </div>
        <div
          className="rv-meter rv-meter--burn mt-2"
          role="progressbar"
          aria-valuenow={Math.round(share * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${symbol} burned: ${burnedLabel} of ${totalLabel}`}
        >
          <span style={{ width: `${(share * 100).toFixed(2)}%` }} />
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile label="Circulating Supply" value={`${formatCompact(stats.circulating)} ${symbol}`} />
        <StatTile label="Burned Forever" value={burnedLabel} valueClassName="text-[var(--burn)]" />
        <StatTile label="Deflation Rate" value={`${pctLabel} Burned`} valueClassName="text-[var(--burn-2)]" />
      </div>
    </section>
  );
}
