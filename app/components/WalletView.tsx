import type { ReactNode } from "react";
import type { WalletData, WalletAssetHolding } from "@/lib/queries";
import { DiamondBadge } from "./DiamondBadge";
import { EmptyState } from "./States";
import { HeldTokenGrid } from "./HeldTokenGrid";
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
        {h.diamondBucket ? <DiamondBadge bucket={h.diamondBucket} title={diamondTooltip} /> : null}
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

      {(h.neverSold || !h.everPaperSold) ? (
        <div className="mt-3 flex flex-wrap gap-1 text-xs">
          {h.neverSold ? (
            <span
              className="rounded px-1.5 py-0.5 text-[var(--accent)]"
              style={{ background: "color-mix(in srgb, var(--accent) 15%, transparent)" }}
            >
              Never sold
            </span>
          ) : null}
          {!h.everPaperSold ? (
            <span
              className="rounded px-1.5 py-0.5 text-[var(--diamond)]"
              style={{ background: "color-mix(in srgb, var(--diamond) 15%, transparent)" }}
            >
              Never paper-handed
            </span>
          ) : null}
        </div>
      ) : null}
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
