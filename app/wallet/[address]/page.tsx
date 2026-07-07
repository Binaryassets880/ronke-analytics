import { normalizeAddress } from "@/lib/format";
import { getWallet, getWalletBadges, getWalletScore, getWalletHistory } from "@/lib/queries";
import { resolveNameLive } from "@/lib/rns/resolve";
import { WalletView } from "@/app/components/WalletView";
import { BadgeShelf } from "@/app/components/BadgeShelf";
import { RonkeScoreCard } from "@/app/components/RonkeScoreCard";
import { WalletHistoryChart } from "@/app/components/WalletHistoryChart";
import { DIAMOND_THRESHOLDS } from "@/config/contracts";

export const dynamic = "force-dynamic";

const DIAMOND_TOOLTIP =
  `Matches the Diamond Hands badge: Diamond = a real (non-dust) position held ` +
  `${DIAMOND_THRESHOLDS.diamondDays}+ days without ever selling ` +
  `${DIAMOND_THRESHOLDS.sellTolerancePct * 100}%+ of holdings in one go (small trims are forgiven). ` +
  `Paper = dumped within ${DIAMOND_THRESHOLDS.paperSellWindowDays}d of buying, or a fresh position ` +
  `(< ${DIAMOND_THRESHOLDS.regularDays}d). Regular = everything else. Selling ` +
  `${DIAMOND_THRESHOLDS.sellTolerancePct * 100}%+ also resets the holding clock; ` +
  `moves to staking/bridge/game never count as sells.`;

export default async function WalletPage({
  params,
}: {
  params: Promise<{ address: string }>;
}) {
  const { address } = await params;
  const raw = decodeURIComponent(address).trim();
  let normalized = normalizeAddress(raw);
  let rnsName: string | null = null;

  // Accept a `.ron` name: resolve it live via RNS (best-effort) to an address.
  if (!normalized && raw.toLowerCase().endsWith(".ron")) {
    const resolved = await resolveNameLive(raw.toLowerCase());
    if (resolved) {
      normalized = resolved;
      rnsName = raw.toLowerCase();
    }
  }

  if (!normalized) {
    const wasName = raw.toLowerCase().endsWith(".ron");
    return (
      <div className="rounded-xl border border-rose-500/30 bg-[var(--card)] p-6">
        <h1 className="text-lg font-semibold">
          {wasName ? "Couldn't resolve that .ron name" : "Invalid wallet address"}
        </h1>
        <p role="alert" className="mt-1 text-sm text-rose-300">
          {wasName
            ? `"${raw}" doesn't point to a wallet, or RNS is unavailable right now. Try the 0x address.`
            : `"${address}" is not a valid 0x address (40 hex characters).`}
        </p>
      </div>
    );
  }

  const [wallet, badges, score, history] = await Promise.all([
    getWallet(normalized),
    getWalletBadges(normalized),
    getWalletScore(normalized),
    getWalletHistory(normalized),
  ]);
  // Prefer the cached reverse name; fall back to the name the user searched by.
  const walletWithName = wallet.name ? wallet : { ...wallet, name: rnsName };
  return (
    <WalletView
      wallet={walletWithName}
      diamondTooltip={DIAMOND_TOOLTIP}
      scoreCard={wallet.everHeld && score ? <RonkeScoreCard score={score} address={normalized} /> : undefined}
      historySection={wallet.everHeld ? <WalletHistoryChart history={history} /> : undefined}
      badgeShelf={wallet.everHeld ? <BadgeShelf badges={badges} /> : undefined}
    />
  );
}
