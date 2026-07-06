import type { Asset } from "@/config/contracts";
import { CONTRACTS } from "@/config/contracts";
import type { OverviewData, MetaState, TokenMarketView, NftMarketView } from "@/lib/queries";
import { StatTile } from "./StatTile";
import { StalenessBadge } from "./StalenessBadge";
import { TrendChart } from "./TrendChart";
import { BarChart } from "./BarChart";
import { PreBackfill } from "./States";
import { WalletSearch } from "./WalletSearch";
import { formatCompact, formatPct, formatUsd, formatRon, toWholeTokens } from "@/lib/format";

/**
 * Overview presentational component (U7). Leads with diamond-hands percent as
 * the hero metric (the emotional core, per the diamondhands reference), with
 * holder count / whale count / supply held as supporting tiles plus the holder
 * trend. Pure - rendered from props so it is testable without any network call.
 */
export function OverviewView({
  asset,
  data,
  meta,
  tokenMarket,
  nftMarket,
  now,
}: {
  asset: Asset;
  data: OverviewData;
  meta: MetaState;
  tokenMarket?: TokenMarketView | null;
  nftMarket?: NftMarketView | null;
  now?: Date;
}) {
  if (!meta.backfillComplete) return <PreBackfill />;

  const isNft = asset === "ronkeverse_nft";
  const supply = isNft
    ? formatCompact(Number(data.supplyHeld))
    : formatCompact(toWholeTokens(BigInt(data.supplyHeld || "0")));
  const assetLabel = CONTRACTS[asset].label;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">{assetLabel} · Overview</h1>
        <StalenessBadge lastRebuildAt={meta.lastRebuildAt} now={now} />
      </div>

      {!isNft && tokenMarket ? (
        <section className="space-y-2">
          <h2 className="text-sm font-medium text-neutral-300">
            Market <span className="text-xs font-normal text-neutral-500">· DEX price (low liquidity)</span>
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile label="Price" value={formatUsd(tokenMarket.priceUsd)} />
            <StatTile label="24h Volume" value={formatUsd(tokenMarket.volume24hUsd)} />
            <StatTile label="Liquidity" value={formatUsd(tokenMarket.liquidityUsd)} />
            <StatTile label="Market Cap" value={formatUsd(tokenMarket.marketCapUsd)} />
          </div>
        </section>
      ) : null}

      {isNft && nftMarket ? (
        <section className="space-y-2">
          <h2 className="text-sm font-medium text-neutral-300">
            Market <span className="text-xs font-normal text-neutral-500">· on-chain, all venues (Seaport + Ronin Market)</span>
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile label="24h Volume" value={formatRon(nftMarket.volume24hWron)} sub={`${nftMarket.sales24h} sales`} />
            <StatTile label="7d Volume" value={formatRon(nftMarket.volume7dWron)} />
            <StatTile label="Last Sale" value={formatRon(nftMarket.lastSaleWron)} />
            <StatTile label="Avg (30d)" value={formatRon(nftMarket.avgPrice30dWron)} />
          </div>
        </section>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile
          hero
          label="Diamond Hands"
          value={formatPct(data.diamondPct)}
          sub={`${data.diamondDistribution.diamond} holders held 30+ days`}
        />
        <StatTile label="Holders" value={formatCompact(data.holderCount)} />
        <StatTile label="Whales" value={formatCompact(data.whaleCount)} sub=">1% of supply" />
        <StatTile label={isNft ? "Tokens held" : "Supply held"} value={supply} />
        <StatTile label="Never sold" value={formatPct(data.neverSoldPct)} sub="of current holders" />
      </div>

      <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
        <h2 className="mb-2 text-sm font-medium text-neutral-300">Holders over time</h2>
        <TrendChart
          label="holder count"
          points={data.series.map((s) => ({ x: s.date, y: s.holderCount }))}
        />
      </section>

      <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
        <h2 className="mb-2 text-sm font-medium text-neutral-300">Diamond-hands distribution</h2>
        <BarChart
          label="diamond distribution"
          bars={[
            { label: "\u{1F48E} Diamond (30d+)", count: data.diamondDistribution.diamond },
            { label: "\u{270B} Regular (7-30d)", count: data.diamondDistribution.regular },
            { label: "\u{1F9FB} Paper (<7d)", count: data.diamondDistribution.paper },
          ]}
        />
      </section>

      <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 sm:hidden">
        <h2 className="mb-2 text-sm font-medium text-neutral-300">Look up a wallet</h2>
        <WalletSearch />
      </section>
    </div>
  );
}
