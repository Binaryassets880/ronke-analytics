"use client";

/**
 * Ronke Score calculator/simulator (S-series). Lets anyone load a wallet (or
 * start from zero), turn the same knobs the real score uses - buy more $RONKE /
 * RonkeStr / Ronkeverse, hold longer, collect body types, grab 1/1s - and see
 * current vs simulated score side by side, with plain-English notes explaining
 * WHY it moved (gates crossed, clock dilution, the 24-month cap, diamond
 * multipliers). All math runs client-side through the real computeScore engine,
 * so the simulator can never drift from the score it explains; the only server
 * call is the prefill fetch of a wallet's raw inputs.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { ScoreInput } from "@/lib/score/compute";
import {
  EMPTY_KNOBS,
  emptyScoreInput,
  simulate,
  type SimKnobs,
  type SimNote,
} from "@/lib/score/simulate";
import { SCORE_CONFIG } from "@/config/score";
import { formatCompact, formatDuration, normalizeAddress, shortAddress } from "@/lib/format";

interface LoadedWallet {
  address: string;
  name: string | null;
  found: boolean;
  persisted: { score: number; rank: number | null } | null;
}

const num = (v: string): number => {
  const n = Number(v.replace(/[,\s]/g, ""));
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

function Chip({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mono rounded-lg border border-[var(--border-strong)] bg-[#11141d] px-2 py-1 text-xs text-[var(--muted)] transition-colors hover:border-[var(--accent)] hover:text-[var(--foreground)]"
    >
      {label}
    </button>
  );
}

function KnobNumber({
  label,
  hint,
  value,
  onChange,
  chips,
  step = 1,
}: {
  label: string;
  hint?: string;
  value: number;
  onChange: (n: number) => void;
  chips?: { label: string; add: number }[];
  step?: number;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <label className="text-sm font-medium text-[var(--foreground)]">{label}</label>
        {hint ? <span className="text-xs text-[var(--muted-2)]">{hint}</span> : null}
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <input
          type="number"
          min={0}
          step={step}
          value={value === 0 ? "" : value}
          placeholder="0"
          onChange={(e) => onChange(num(e.target.value))}
          aria-label={label}
          className="mono w-28 rounded-lg border border-[var(--border-strong)] bg-[#080a0f] px-2.5 py-1.5 text-sm outline-none focus:border-[var(--accent)]"
        />
        {chips?.map((c) => (
          <Chip key={c.label} label={c.label} onClick={() => onChange(value + c.add)} />
        ))}
        {value > 0 ? <Chip label="×" onClick={() => onChange(0)} /> : null}
      </div>
    </div>
  );
}

function DeltaRow({ label, before, after }: { label: string; before: number; after: number }) {
  const delta = after - before;
  return (
    <div className="flex items-center justify-between gap-3 py-1 text-sm">
      <span className="text-[var(--muted)]">{label}</span>
      <span className="mono flex items-baseline gap-1.5">
        <span className="text-[var(--muted-2)]">{formatCompact(before)}</span>
        <span aria-hidden className="text-[var(--muted-3)]">→</span>
        <span className="font-semibold text-[var(--foreground)]">{formatCompact(after)}</span>
        {delta !== 0 ? (
          <span className={`text-xs ${delta > 0 ? "text-[var(--diamond)]" : "text-[var(--paper)]"}`}>
            {delta > 0 ? "+" : ""}
            {formatCompact(delta)}
          </span>
        ) : null}
      </span>
    </div>
  );
}

const NOTE_TONE: Record<SimNote["tone"], string> = {
  gain: "text-[var(--diamond)]",
  loss: "text-[var(--paper)]",
  info: "text-[var(--muted)]",
};

export function ScoreSimulator() {
  const searchParams = useSearchParams();
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [base, setBase] = useState<ScoreInput>(() => emptyScoreInput());
  const [wallet, setWallet] = useState<LoadedWallet | null>(null);
  const [knobs, setKnobs] = useState<SimKnobs>(EMPTY_KNOBS);
  const autoLoaded = useRef(false);

  const load = useCallback(async (target: string) => {
    const trimmed = target.trim().toLowerCase();
    if (!normalizeAddress(trimmed) && !(trimmed.endsWith(".ron") && trimmed.length > 4)) {
      setError("Enter a 0x wallet address or a .ron name.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/score-inputs/${encodeURIComponent(trimmed)}`);
      const data = await res.json();
      if (!res.ok) {
        setError((data as { error?: string }).error ?? "Lookup failed. Try again.");
        return;
      }
      setBase(data.input as ScoreInput);
      setWallet(data as LoadedWallet);
      setKnobs(EMPTY_KNOBS);
      if (!(data as LoadedWallet).found) {
        setError("That wallet has no Ronke history yet - simulating from an empty bag.");
      }
    } catch {
      setError("Lookup failed. Try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Deep link: /resources?sim=0x…#score-calculator prefills that wallet.
  useEffect(() => {
    const sim = searchParams.get("sim");
    if (sim && !autoLoaded.current) {
      autoLoaded.current = true;
      setQuery(sim);
      void load(sim);
    }
  }, [searchParams, load]);

  const reset = () => {
    setBase(emptyScoreInput());
    setWallet(null);
    setKnobs(EMPTY_KNOBS);
    setError(null);
    setQuery("");
  };

  const { current, simulated, notes } = simulate(base, knobs);
  const delta = simulated.score - current.score;
  const touched =
    knobs.addRonke > 0 ||
    knobs.addRonkestr > 0 ||
    knobs.addCommonNfts > 0 ||
    knobs.addRareNfts > 0 ||
    knobs.addOneOfOnes > 0 ||
    knobs.newBodyTypes > 0 ||
    knobs.holdMoreDays > 0;

  const setKnob = <K extends keyof SimKnobs>(key: K, value: number) =>
    setKnobs((k) => ({ ...k, [key]: value }));

  const bodyRoom = Math.max(0, base.bodyTypesTotal - base.bodyTypesHeld);

  return (
    <div className="space-y-4">
      {/* ── Wallet loader ─────────────────────────────────────────── */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void load(query);
        }}
      >
        <div className="flex gap-2">
          <input
            aria-label="Wallet address or .ron name"
            placeholder="ronke.ron  or  0x…  (or leave empty to start from zero)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="mono min-w-0 flex-1 rounded-xl border border-[var(--border-strong)] bg-[#080a0f] px-3.5 py-2.5 text-sm outline-none focus:border-[var(--accent)]"
          />
          <button
            type="submit"
            disabled={loading}
            className="shrink-0 rounded-xl px-4 py-2.5 text-sm font-bold text-[#04121c] disabled:opacity-60"
            style={{ background: "var(--accent)" }}
          >
            {loading ? "Loading…" : "Load wallet"}
          </button>
        </div>
        {error ? (
          <p role="alert" className="mt-1.5 text-xs text-[var(--paper)]">
            {error}
          </p>
        ) : null}
      </form>

      {/* ── Loaded holdings summary ───────────────────────────────── */}
      {wallet ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-[var(--border-soft)] bg-[var(--card-2)] px-3 py-2 text-xs text-[var(--muted)]">
          <span className="font-medium text-[var(--foreground)]" title={wallet.address}>
            {wallet.name ?? shortAddress(wallet.address)}
          </span>
          <span className="mono">{formatCompact(base.ronkeBalanceWhole)} $RONKE{base.ronkeHold ? ` (${formatDuration(base.ronkeHold.durationDays)})` : ""}</span>
          <span className="mono">{formatCompact(base.ronkestrBalanceWhole)} RonkeStr{base.ronkestrHold ? ` (${formatDuration(base.ronkestrHold.durationDays)})` : ""}</span>
          <span className="mono">
            {base.nftRarityFactors.length} NFTs
            {base.nftHold ? ` (${formatDuration(base.nftHold.durationDays)})` : ""}
            {base.bodyTypesTotal > 0 ? ` · ${base.bodyTypesHeld}/${base.bodyTypesTotal} bodies` : ""}
            {base.oneOfOneCount > 0 ? ` · ${base.oneOfOneCount}× 1/1` : ""}
          </span>
          {wallet.persisted?.rank ? (
            <span className="ml-auto">
              official score <span className="mono text-[var(--accent)]">{wallet.persisted.score.toLocaleString()}</span> · rank{" "}
              <span className="mono">#{wallet.persisted.rank.toLocaleString()}</span>
            </span>
          ) : null}
          <button
            type="button"
            onClick={reset}
            className="text-[var(--muted-2)] underline-offset-2 hover:text-[var(--foreground)] hover:underline"
          >
            clear
          </button>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        {/* ── Knobs ─────────────────────────────────────────────────── */}
        <div className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--card-2)] p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-2)]">
            What if you…
          </div>
          <KnobNumber
            label="Buy $RONKE"
            hint={`duration unlocks at ${SCORE_CONFIG.gate.minRonke.toLocaleString()}`}
            value={knobs.addRonke}
            onChange={(n) => setKnob("addRonke", n)}
            chips={[
              { label: "+10K", add: 10_000 },
              { label: "+50K", add: 50_000 },
              { label: "+100K", add: 100_000 },
              { label: "+1M", add: 1_000_000 },
            ]}
            step={1000}
          />
          <KnobNumber
            label="Buy RonkeStr"
            hint={`duration unlocks at ${SCORE_CONFIG.gate.minRonkestr.toLocaleString()}`}
            value={knobs.addRonkestr}
            onChange={(n) => setKnob("addRonkestr", n)}
            chips={[
              { label: "+500", add: 500 },
              { label: "+1K", add: 1_000 },
              { label: "+5K", add: 5_000 },
            ]}
            step={100}
          />
          <KnobNumber
            label="Buy common Ronkeverse"
            hint="floor-ish rarity"
            value={knobs.addCommonNfts}
            onChange={(n) => setKnob("addCommonNfts", Math.floor(n))}
            chips={[
              { label: "+1", add: 1 },
              { label: "+5", add: 5 },
              { label: "+10", add: 10 },
            ]}
          />
          <KnobNumber
            label="Buy rare Ronkeverse"
            hint="top-10% rarity"
            value={knobs.addRareNfts}
            onChange={(n) => setKnob("addRareNfts", Math.floor(n))}
            chips={[
              { label: "+1", add: 1 },
              { label: "+3", add: 3 },
            ]}
          />
          <KnobNumber
            label="Buy a 1/1"
            hint={`+${SCORE_CONFIG.oneOfOne.bonus} flat each`}
            value={knobs.addOneOfOnes}
            onChange={(n) => setKnob("addOneOfOnes", Math.floor(n))}
            chips={[{ label: "+1", add: 1 }]}
          />
          <KnobNumber
            label="New body types collected"
            hint={
              base.bodyTypesTotal > 0
                ? `${base.bodyTypesHeld}/${base.bodyTypesTotal} held · +${SCORE_CONFIG.collector.perType} each`
                : `+${SCORE_CONFIG.collector.perType} each`
            }
            value={knobs.newBodyTypes}
            onChange={(n) => setKnob("newBodyTypes", Math.min(Math.floor(n), bodyRoom || Math.floor(n)))}
            chips={
              bodyRoom > 0
                ? [
                    { label: "+1", add: 1 },
                    { label: `all ${bodyRoom}`, add: bodyRoom },
                  ]
                : undefined
            }
          />
          <KnobNumber
            label="Hold for X more days"
            hint={`compounds ${SCORE_CONFIG.duration.growthPerMonth}×/month, caps at ${SCORE_CONFIG.duration.capMonths}mo`}
            value={knobs.holdMoreDays}
            onChange={(n) => setKnob("holdMoreDays", n)}
            chips={[
              { label: "+30d", add: 30 },
              { label: "+90d", add: 90 },
              { label: "+180d", add: 180 },
              { label: "+1y", add: 365 },
            ]}
            step={30}
          />
          {touched ? (
            <button
              type="button"
              onClick={() => setKnobs(EMPTY_KNOBS)}
              className="rounded-lg border border-[var(--border-strong)] bg-[#11141d] px-3 py-1.5 text-xs font-medium text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--foreground)]"
            >
              Reset knobs
            </button>
          ) : null}
        </div>

        {/* ── Results ───────────────────────────────────────────────── */}
        <div className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--card-2)] p-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-wide text-[var(--muted-2)]">Current score</div>
              <div className="mono mt-0.5 text-3xl font-bold text-[var(--foreground)]">
                {current.score.toLocaleString()}
              </div>
            </div>
            <div aria-hidden className="pb-1 text-2xl text-[var(--muted-3)]">→</div>
            <div className="text-right">
              <div className="text-xs uppercase tracking-wide text-[var(--muted-2)]">Simulated score</div>
              <div className="mono mt-0.5 text-3xl font-bold text-[var(--accent)]">
                {simulated.score.toLocaleString()}
              </div>
              {delta !== 0 ? (
                <div
                  className={`mono text-sm font-semibold ${delta > 0 ? "text-[var(--diamond)]" : "text-[var(--paper)]"}`}
                >
                  {delta > 0 ? "+" : ""}
                  {delta.toLocaleString()}
                </div>
              ) : null}
            </div>
          </div>

          <div className="border-t border-[var(--border-soft)] pt-2">
            <DeltaRow label="$RONKE sub-score" before={current.ronkeSubscore} after={simulated.ronkeSubscore} />
            <DeltaRow label="RonkeStr sub-score" before={current.ronkestrSubscore} after={simulated.ronkestrSubscore} />
            <DeltaRow label="Ronkeverse sub-score" before={current.nftSubscore} after={simulated.nftSubscore} />
          </div>

          {touched && notes.length > 0 ? (
            <div className="border-t border-[var(--border-soft)] pt-2.5">
              <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--muted-2)]">
                Why it changed
              </div>
              <ul className="space-y-1.5">
                {notes.map((n) => (
                  <li key={n.text} className="flex gap-2 text-xs leading-relaxed">
                    <span aria-hidden>{n.emoji}</span>
                    <span className={NOTE_TONE[n.tone]}>{n.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="border-t border-[var(--border-soft)] pt-2.5 text-xs text-[var(--muted-2)]">
              {wallet
                ? "Turn a knob on the left to see how your score would move - and why."
                : "Load a wallet above, or turn a knob to explore the score from zero."}
            </p>
          )}
        </div>
      </div>

      <p className="text-xs text-[var(--muted-2)]">
        The simulator runs the exact same formula as the leaderboard. Simulated NFT buys use
        representative rarities (common ≈ floor, rare ≈ top 10%); the official score refreshes with
        the nightly rebuild, so a just-loaded wallet can differ slightly from the leaderboard.
      </p>
    </div>
  );
}
