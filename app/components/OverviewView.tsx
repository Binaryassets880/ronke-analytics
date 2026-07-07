import type { Asset } from "@/config/contracts";
import { CONTRACTS } from "@/config/contracts";
import type { OverviewData, MetaState, TokenMarketView, NftMarketView } from "@/lib/queries";
import { StatTile } from "./StatTile";
import { InfoTip } from "./Tip";
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
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">{assetLabel} · Overview</h1>
        <StalenessBadge lastRebuildAt={meta.lastRebuildAt} now={now} />
      </div>

      {!isNft && tokenMarket ? (
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-[var(--muted)]">
            Market <span className="text-xs font-normal text-[var(--muted-2)]">· DEX price (low liquidity)</span>
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile label="Price" value={formatUsd(tokenMarket.priceUsd)} />
            <StatTile label="24h Volume" value={formatUsd(tokenMarket.volume24hUsd)} hint="Total value of $RONKE traded on the DEX in the last 24 hours." />
            <StatTile label="Liquidity" value={formatUsd(tokenMarket.liquidityUsd)} hint="Value sitting in the DEX pool backing $RONKE. Low liquidity means the price moves a lot on small trades." />
            <StatTile label="Market Cap" value={formatUsd(tokenMarket.marketCapUsd)} hint="Price times circulating supply. Thin liquidity makes this a rough estimate." />
          </div>
        </section>
      ) : null}

      {isNft && nftMarket ? (
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-[var(--muted)]">
            Market <span className="text-xs font-normal text-[var(--muted-2)]">· on-chain, all venues (Seaport + Ronin Market)</span>
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile label="24h Volume" value={formatRon(nftMarket.volume24hWron)} sub={`${nftMarket.sales24h} sales`} />
            <StatTile label="7d Volume" value={formatRon(nftMarket.volume7dWron)} />
            <StatTile label="Last Sale" value={formatRon(nftMarket.lastSaleWron)} />
            <StatTile label="Avg (30d)" value={formatRon(nftMarket.avgPrice30dWron)} />
          </div>
        </section>
      ) : null}

      {/* Hero metric (diamond-hands share) beside a 2x2 of supporting KPIs -
          fills the block cleanly instead of wrapping 5 tiles into a 4-col grid. */}
      <section className="grid gap-3 lg:grid-cols-2">
        <div className="rv-card relative overflow-hidden p-5">
          <div
            className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full opacity-20 blur-2xl"
            style={{ background: "var(--diamond)" }}
          />
          <div className="relative flex h-full flex-col justify-between gap-4">
            <div className="flex items-center text-xs uppercase tracking-wide text-[var(--muted-2)]">
              <span>Diamond Hands</span>
              <InfoTip text="Share of current holders whose oldest position is 30+ days old and who have never made a genuine sell." />
            </div>
            <div>
              <div className="mono text-5xl font-bold tracking-tight text-[var(--diamond)]">{formatPct(data.diamondPct)}</div>
              <div className="mt-2 text-sm text-[var(--muted)]">
                {formatCompact(data.diamondDistribution.diamond)} holders have held 30+ days
              </div>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <StatTile label="Holders" value={formatCompact(data.holderCount)} hint="Number of wallets currently holding, excluding contracts, bridges, and known non-holder addresses." />
          <StatTile label="Whales" value={formatCompact(data.whaleCount)} sub=">1% of supply" hint="Wallets among the largest holders, or holding more than 1% of supply." />
          <StatTile label={isNft ? "Tokens held" : "Supply held"} value={supply} hint="Total currently held across all tracked holders." />
          <StatTile label="Never sold" value={formatPct(data.neverSoldPct)} sub="of current holders" hint="Share of current holders who have never made a genuine sell since acquiring." />
        </div>
      </section>

      <section className="rv-card p-5">
        <h2 className="mb-3 text-sm font-medium text-[var(--muted)]">Holders over time</h2>
        <TrendChart
          label="Holders"
          points={data.series.map((s) => ({ x: s.date, y: s.holderCount }))}
        />
      </section>

      <section className="rv-card p-5">
        <h2 className="mb-3 text-sm font-medium text-[var(--muted)]">Diamond-hands distribution</h2>
        <BarChart
          label="diamond distribution"
          bars={[
            { label: "\u{1F48E} Diamond (30d+)", count: data.diamondDistribution.diamond, color: "var(--diamond)" },
            { label: "\u{270B} Regular (7-30d)", count: data.diamondDistribution.regular, color: "var(--regular)" },
            { label: "\u{1F9FB} Paper (<7d)", count: data.diamondDistribution.paper, color: "var(--paper)" },
          ]}
        />
      </section>

      <section className="rv-card p-5 sm:hidden">
        <h2 className="mb-3 text-sm font-medium text-[var(--muted)]">Look up a wallet</h2>
        <WalletSearch />
      </section>
    </div>
  );
}
