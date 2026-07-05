import { normalizeAddress } from "@/lib/format";
import { getWallet, getWalletBadges } from "@/lib/queries";
import { WalletView } from "@/app/components/WalletView";
import { BadgeShelf } from "@/app/components/BadgeShelf";
import { DIAMOND_THRESHOLDS } from "@/config/contracts";

export const dynamic = "force-dynamic";

const DIAMOND_TOOLTIP =
  `Bucket by how long the oldest still-held position has been held: ` +
  `Paper < ${DIAMOND_THRESHOLDS.regularDays}d, ` +
  `Regular ${DIAMOND_THRESHOLDS.regularDays}-${DIAMOND_THRESHOLDS.diamondDays}d, ` +
  `Diamond >= ${DIAMOND_THRESHOLDS.diamondDays}d. ` +
  `Moves to staking/bridge/game do not reset the clock or count as sells.`;

export default async function WalletPage({
  params,
}: {
  params: Promise<{ address: string }>;
}) {
  const { address } = await params;
  const normalized = normalizeAddress(decodeURIComponent(address));

  if (!normalized) {
    return (
      <div className="rounded-xl border border-rose-500/30 bg-[var(--card)] p-6">
        <h1 className="text-lg font-semibold">Invalid wallet address</h1>
        <p role="alert" className="mt-1 text-sm text-rose-300">
          &ldquo;{address}&rdquo; is not a valid 0x address (40 hex characters).
        </p>
      </div>
    );
  }

  const [wallet, badges] = await Promise.all([
    getWallet(normalized),
    getWalletBadges(normalized),
  ]);
  return (
    <WalletView
      wallet={wallet}
      diamondTooltip={DIAMOND_TOOLTIP}
      badgeShelf={wallet.everHeld ? <BadgeShelf badges={badges} /> : undefined}
    />
  );
}
