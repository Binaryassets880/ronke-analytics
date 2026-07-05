import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import type { WalletData } from "@/lib/queries";
import { StatTile } from "./StatTile";
import { DiamondBadge } from "./DiamondBadge";
import { EmptyState } from "./States";
import { formatCompact, formatDuration, shortAddress, toWholeTokens } from "@/lib/format";

/**
 * Wallet profile presentational view (U8). Shows holdings, holding duration,
 * diamond bucket, never-sold flag, and held Ronkeverse tokens with rarity rank
 * (U12 wiring). `badgeShelf` is an optional slot filled by U15. Pure/testable.
 */
export function WalletView({
  wallet,
  badgeShelf,
  diamondTooltip,
}: {
  wallet: WalletData;
  badgeShelf?: ReactNode;
  diamondTooltip?: string;
}) {
  if (!wallet.everHeld) {
    return (
      <div className="space-y-4">
        <WalletHeader address={wallet.address} />
        <EmptyState
          title="This wallet has never held $RONKE or Ronkeverse."
          hint="Double-check the address, or paste another to look it up."
        />
      </div>
    );
  }

  const ronke = toWholeTokens(BigInt(wallet.ronkeBalance || "0"));
  return (
    <div className="space-y-6">
      <WalletHeader address={wallet.address} />
      {wallet.firstAcquiredAt ? (
        <p className="-mt-4 text-sm text-neutral-400">
          First acquired {wallet.firstAcquiredAt.slice(0, 10)}
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="$RONKE held" value={formatCompact(ronke)} />
        <StatTile label="Ronkeverse held" value={String(wallet.ronkeverseCount)} />
        <StatTile label="Held for" value={formatDuration(wallet.holdingDurationDays)} />
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
          <div className="text-xs uppercase tracking-wide text-neutral-400">Hands</div>
          <div className="mt-2" title={diamondTooltip}>
            {wallet.diamondBucket ? (
              <DiamondBadge bucket={wallet.diamondBucket} title={diamondTooltip} />
            ) : (
              <span className="text-neutral-500">—</span>
            )}
          </div>
          <div className="mt-2 flex flex-wrap gap-1 text-xs">
            {wallet.neverSold ? (
              <span className="rounded bg-sky-500/15 px-1.5 py-0.5 text-sky-300">Never sold</span>
            ) : null}
            {!wallet.everPaperSold ? (
              <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-emerald-300">
                Never paper-handed
              </span>
            ) : null}
          </div>
        </div>
      </div>

      {badgeShelf}

      {wallet.heldTokens.length > 0 ? (
        <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
          <h2 className="mb-3 text-sm font-medium text-neutral-300">
            Ronkeverse held ({wallet.heldTokens.length})
          </h2>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
            {wallet.heldTokens.slice(0, 24).map((t) => (
              <Link
                key={t.tokenId}
                href={`/rarity/${t.tokenId}`}
                className="group rounded-lg border border-[var(--border)] p-2 text-center"
              >
                {t.imageUrl ? (
                  <Image
                    src={t.imageUrl}
                    alt={`Ronkeverse #${t.tokenId}`}
                    width={96}
                    height={96}
                    className="mx-auto aspect-square w-full rounded object-cover"
                    unoptimized
                  />
                ) : (
                  <div className="mx-auto flex aspect-square w-full items-center justify-center rounded bg-[var(--border)] text-xs text-neutral-500">
                    #{t.tokenId}
                  </div>
                )}
                <div className="mt-1 text-xs text-neutral-400">#{t.tokenId}</div>
                {t.rarityRank ? (
                  <div className="text-xs text-[var(--accent)]">rank {t.rarityRank}</div>
                ) : null}
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function WalletHeader({ address }: { address: string }) {
  return (
    <div>
      <h1 className="text-2xl font-semibold" title={address}>
        {shortAddress(address)}
      </h1>
      <p className="mt-1 break-all font-mono text-xs text-neutral-500">{address}</p>
    </div>
  );
}
