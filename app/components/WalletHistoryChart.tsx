"use client";

import { useMemo, useState } from "react";
import type { WalletHistory, WalletHistoryPoint } from "@/lib/queries";
import { TrendChart } from "./TrendChart";

/**
 * A wallet's holdings over time, one tab per asset. Each series is a running
 * balance reconstructed from transfers, so you can see where a wallet accumulated
 * or sold. A range selector zooms the window; most wallets trade rarely, so the
 * default (All) usually reads as a step line with flat stretches between moves.
 */
type AssetKey = "ronke" | "ronkestr" | "ronkeverse";

const ASSET_TABS: { key: AssetKey; label: string; format: "compact" | "full" }[] = [
  { key: "ronke", label: "$RONKE", format: "compact" },
  { key: "ronkestr", label: "RonkeStr", format: "compact" },
  { key: "ronkeverse", label: "Ronkeverse", format: "full" },
];

const RANGES: { key: string; label: string; days: number | null }[] = [
  { key: "all", label: "All", days: null },
  { key: "1y", label: "1Y", days: 365 },
  { key: "90d", label: "90D", days: 90 },
  { key: "30d", label: "30D", days: 30 },
];

function filterByDays(points: WalletHistoryPoint[], days: number | null): WalletHistoryPoint[] {
  if (days == null) return points;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  return points.filter((p) => p.date >= cutoffStr);
}

export function WalletHistoryChart({ history }: { history: WalletHistory }) {
  const [asset, setAsset] = useState<AssetKey>("ronke");
  const [range, setRange] = useState<string>("all");

  const tab = ASSET_TABS.find((t) => t.key === asset)!;
  const rangeDays = RANGES.find((r) => r.key === range)?.days ?? null;
  const points = useMemo(() => filterByDays(history[asset], rangeDays), [history, asset, rangeDays]);
  const hasAny = history[asset].length > 0;

  return (
    <section className="rv-card p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-medium text-[var(--muted)]">Holdings over time</h2>
        <div className="flex flex-wrap items-center gap-2">
          {/* Asset tabs */}
          <div className="inline-flex rounded-lg border border-[var(--border)] p-0.5 text-xs">
            {ASSET_TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setAsset(t.key)}
                aria-pressed={asset === t.key}
                className={`rounded-md px-2.5 py-1 transition-colors ${
                  asset === t.key
                    ? "bg-[var(--accent)] font-medium text-[var(--background)]"
                    : "text-[var(--muted)] hover:text-[var(--foreground)]"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          {/* Range zoom */}
          <div className="inline-flex rounded-lg border border-[var(--border)] p-0.5 text-xs">
            {RANGES.map((r) => (
              <button
                key={r.key}
                onClick={() => setRange(r.key)}
                aria-pressed={range === r.key}
                className={`rounded-md px-2 py-1 transition-colors ${
                  range === r.key
                    ? "bg-[var(--accent)]/15 font-medium text-[var(--accent)]"
                    : "text-[var(--muted-2)] hover:text-[var(--foreground)]"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {!hasAny ? (
        <p className="py-8 text-center text-sm text-[var(--muted-2)]">
          No {tab.label} transfer history for this wallet.
        </p>
      ) : points.length === 0 ? (
        <p className="py-8 text-center text-sm text-[var(--muted-2)]">
          No {tab.label} activity in this range. Try a longer window.
        </p>
      ) : (
        <TrendChart
          label={`${tab.label} balance`}
          format={tab.format}
          points={points.map((p) => ({ x: p.date, y: p.balance }))}
        />
      )}
    </section>
  );
}
