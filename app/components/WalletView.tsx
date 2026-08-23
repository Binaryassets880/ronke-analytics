import type { ReactNode } from "react";
import type { WalletData, WalletAssetHolding } from "@/lib/queries";
import { DiamondBadge } from "./DiamondBadge";
import { TierBadge } from "./TierBadge";
import { EmptyState } from "./States";
import { HeldTokenGrid } from "./HeldTokenGrid";
import { Tip } from "./Tip";
import { formatCompact, formatDuration, shortAddress, toWholeTokens } from "@/lib/format";

/**
 * Wallet profile presentational view (U8). Shows holdings, holding duration,
 * diamond bucket, never-sold flag, and held Ronkeverse tokens with rarity rank
 * (U12 wiring). `badgeShelf` is an optional slot filled by U15. Pure/testable.
 */
export function WalletView({
  wallet,
  badgeShelf,
  scoreCard,
  historySection,
  diamondTooltip,
}: {
  wallet: WalletData;
  badgeShelf?: ReactNode;
  scoreCard?: ReactNode;
  historySection?: ReactNode;
  diamondTooltip?: string;
}) {
  if (!wallet.everHeld) {
    return (
      <div className="space-y-4">
        <WalletHeader address={wallet.address} name={wallet.name} />
        <EmptyState
          title="This wallet has never held $RONKE, RonkeStr, or Ronkeverse."
          hint="Double-check the address, or paste another to look it up."
        />
      </div>
    );
  }

  const held = wallet.assetHoldings.filter((h) => h.isHeld);
  return (
    <div className="space-y-6">
      <WalletHeader address={wallet.address} name={wallet.name} />

      {scoreCard}

      {/* Per-asset holdings: each asset reports its own duration / hands / first
          buy, so "held for 10 mo" is never ambiguous across the three assets. */}
      <section>
        <h2 className="mb-3 text-sm font-medium text-[var(--muted)]">Holdings by asset</h2>
        {held.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {held.map((h) => (
              <AssetHoldingCard key={h.asset} h={h} diamondTooltip={diamondTooltip} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-[var(--muted-2)]">
            No current holdings across $RONKE, RonkeStr, or Ronkeverse - this wallet has held in the past.
          </p>
        )}
      </section>

      {historySection}

      {badgeShelf}

      {wallet.heldTokens.length > 0 ? (
        <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
          <h2 className="mb-3 text-sm font-medium text-[var(--muted)]">
            Ronkeverse held ({wallet.heldTokens.length})
          </h2>
          <HeldTokenGrid tokens={wallet.heldTokens} />
        </section>
      ) : null}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-[var(--muted)]">{label}</dt>
      <dd className="text-right text-[var(--foreground)]">{value}</dd>
    </div>
  );
}

/** One asset's holding: amount + its own duration, hands, and first buy. */
function AssetHoldingCard({ h, diamondTooltip }: { h: WalletAssetHolding; diamondTooltip?: string }) {
  const isNft = h.asset === "ronkeverse_nft";
  const amount = isNft
    ? h.tokenCount.toLocaleString()
    : formatCompact(toWholeTokens(BigInt(h.balance.split(".")[0] || "0"), h.asset));

  return (
    <div className="rv-card p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold">{h.label}</span>
        {h.diamondBucket ? (
          <TierBadge
            bucket={h.diamondBucket}
            detail={h.tier}
            unit={isNft ? "NFTs" : "tokens"}
          />
        ) : null}
      </div>

      <div className="mono mt-2 text-3xl font-bold tracking-tight">
        {amount}
        {isNft ? (
          <span className="ml-1.5 text-sm font-normal text-[var(--muted)]">
            {h.tokenCount === 1 ? "NFT" : "NFTs"}
          </span>
        ) : null}
      </div>

      <dl className="mt-3 space-y-1.5 border-t border-[var(--border-soft)] pt-3 text-sm">
        <InfoRow label="Held for" value={formatDuration(h.holdingDurationDays)} />
        <InfoRow label="First buy" value={<span className="mono">{h.firstAcquiredAt ? h.firstAcquiredAt.slice(0, 10) : "—"}</span>} />
      </dl>

      {/*
        These pills sit beside the tier and have to agree with it. "Never sold"
        is shown only when the wallet has genuinely never disposed of a unit;
        anything else states the worst window on record instead, so a wallet
        that trimmed its way down cannot read as untouched.
      */}
      <div className="mt-3 flex flex-wrap gap-1 text-xs">
        {h.neverSold ? (
          <Tip text={`Never disposed of a single ${h.label}. Moves to staking, bridge, or games don't count as sales.`}>
            <span
              className="cursor-help rounded px-1.5 py-0.5 text-[var(--accent)]"
              style={{ background: "color-mix(in srgb, var(--accent) 15%, transparent)" }}
            >
              Never sold
            </span>
          </Tip>
        ) : (
          <Tip text={`In its worst 30 days this wallet let go of ${Math.round((h.tier?.peakSellRate ?? 0) * 100)}% of its ${h.label}. The tier is set by that number.`}>
            <span
              className="cursor-help rounded px-1.5 py-0.5 text-[var(--muted)]"
              style={{ background: "color-mix(in srgb, var(--muted) 12%, transparent)" }}
            >
              Worst month: let go of {Math.round((h.tier?.peakSellRate ?? 0) * 100)}%
            </span>
          </Tip>
        )}
        {!h.everPaperSold ? (
          <Tip text={`Never let go of 50% or more of its ${h.label} inside 30 days.`}>
            <span
              className="cursor-help rounded px-1.5 py-0.5 text-[var(--diamond)]"
              style={{ background: "color-mix(in srgb, var(--diamond) 15%, transparent)" }}
            >
              Never dumped
            </span>
          </Tip>
        ) : (
          <Tip text={`Has let go of 50%+ of its ${h.label} inside 30 days at least once. That record is permanent, even after the tier recovers.`}>
            <span
              className="cursor-help rounded px-1.5 py-0.5 text-[var(--paper)]"
              style={{ background: "color-mix(in srgb, var(--paper) 15%, transparent)" }}
            >
              Dumped before
            </span>
          </Tip>
        )}
      </div>
    </div>
  );
}

function WalletHeader({ address, name }: { address: string; name?: string | null }) {
  return (
    <div>
      <h1 className="text-2xl font-semibold" title={address}>
        {name && name.length > 0 ? name : shortAddress(address)}
      </h1>
      <p className="mt-1 break-all font-mono text-xs text-[var(--muted-2)]">{address}</p>
    </div>
  );
}
