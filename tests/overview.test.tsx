import { describe, it, expect, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

import { render, screen } from "@testing-library/react";
import { OverviewView } from "@/app/components/OverviewView";
import type { OverviewData, MetaState, TokenMarketView, SupplyStats } from "@/lib/queries";

const meta: MetaState = {
  lastSyncAt: "2026-07-05T07:00:00Z",
  lastRebuildAt: "2026-07-05T07:05:00Z",
  backfillComplete: true,
  revealedSupply: 6969,
};

const data: OverviewData = {
  holderCount: 4200,
  whaleCount: 12,
  supplyHeld: "1000000000000000000000000", // 1,000,000 tokens
  diamondPct: 0.42,
  diamondDistribution: { paper: 100, regular: 200, diamond: 300 },
  neverSoldPct: 0.55,
  series: [
    { date: "2026-07-01", holderCount: 4000, supplyHeld: "0", gini: 0.6 },
    { date: "2026-07-05", holderCount: 4200, supplyHeld: "0", gini: 0.61 },
  ],
};

describe("OverviewView", () => {
  it("renders headline stats from a seeded snapshot fixture (no network)", () => {
    render(<OverviewView asset="ronke_token" data={data} meta={meta} now={new Date("2026-07-05T08:00:00Z")} />);
    expect(screen.getByText("Diamond Hands")).toBeInTheDocument();
    expect(screen.getByText("42.0%")).toBeInTheDocument(); // hero diamond pct
    expect(screen.getByText("4.2K")).toBeInTheDocument(); // holders compact
    expect(screen.getByText("up to date")).toBeInTheDocument(); // fresh staleness badge
  });

  it("shows the pre-backfill state instead of broken zeros when not backfilled", () => {
    render(
      <OverviewView asset="ronke_token" data={data} meta={{ ...meta, backfillComplete: false }} />,
    );
    expect(screen.getByText(/Gathering on-chain history/i)).toBeInTheDocument();
    expect(screen.queryByText("Diamond Hands")).not.toBeInTheDocument();
  });

  it("flags stale data when the last rebuild is old", () => {
    render(
      <OverviewView
        asset="ronke_token"
        data={data}
        meta={meta}
        now={new Date("2026-07-08T08:00:00Z")}
      />,
    );
    expect(screen.getByText(/data may be stale/i)).toBeInTheDocument();
  });
});

describe("OverviewView burn card (between Diamond Hands and Holders over time)", () => {
  const supply: SupplyStats = {
    minted: 1_000_000_000,
    burned: 130_605_432,
    circulating: 869_394_568,
    burnedPct: 0.130605432,
  };

  it("renders the RONKE burn card on the token overview, above Holders over time", () => {
    render(<OverviewView asset="ronke_token" data={data} meta={meta} supply={supply} />);
    expect(screen.getByText("$RONKE")).toBeInTheDocument();
    expect(screen.getByText("Burned Forever")).toBeInTheDocument();
    expect(screen.getByText("13.06%")).toBeInTheDocument();
    // Section order: burn card sits before the Holders over time chart.
    const burn = screen.getByText("Burned Forever");
    const holders = screen.getByText("Holders over time");
    expect(burn.compareDocumentPosition(holders) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("labels the RONKESTR card with its own ticker and subtitle", () => {
    render(<OverviewView asset="ronkestr_token" data={data} meta={meta} supply={supply} />);
    expect(screen.getByText("$RONKESTR")).toBeInTheDocument();
    expect(screen.getByText("NFTStrategy Token")).toBeInTheDocument();
  });

  it("shows no burn card on the NFT overview", () => {
    render(<OverviewView asset="ronkeverse_nft" data={data} meta={meta} />);
    expect(screen.queryByText("Burned Forever")).not.toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("degrades to the unavailable placeholder when supply stats are missing", () => {
    render(<OverviewView asset="ronke_token" data={data} meta={meta} supply={null} />);
    expect(screen.getByText("Burn data temporarily unavailable")).toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });
});

describe("OverviewView market cap tile", () => {
  const market = (over: Partial<TokenMarketView>): TokenMarketView => ({
    priceUsd: 0.00095467,
    volume24hUsd: 553,
    liquidityUsd: 4788,
    marketCapUsd: null,
    fdvUsd: 20048,
    fetchedAt: "2026-07-09T07:00:00Z",
    ...over,
  });
  const supply: SupplyStats = {
    minted: 21_000_000,
    burned: 4_509_289,
    circulating: 16_490_711,
    burnedPct: 0.2147,
  };

  it("shows the source market cap without the computed label when present", () => {
    render(
      <OverviewView
        asset="ronke_token"
        data={data}
        meta={meta}
        tokenMarket={market({ marketCapUsd: 250_000 })}
        supply={supply}
      />,
    );
    expect(screen.getByText("$250K")).toBeInTheDocument();
    expect(screen.queryByText("price x circulating")).not.toBeInTheDocument();
  });

  it("computes price x circulating with an honest label when the source cap is null", () => {
    render(
      <OverviewView
        asset="ronkestr_token"
        data={data}
        meta={meta}
        tokenMarket={market({})}
        supply={supply}
      />,
    );
    // 0.00095467 * 16,490,711 ~= $15.7K
    expect(screen.getByText("$15.74K")).toBeInTheDocument();
    expect(screen.getByText("price x circulating")).toBeInTheDocument();
  });

  it("falls back to a dash when both the source cap and the price are missing", () => {
    render(
      <OverviewView
        asset="ronkestr_token"
        data={data}
        meta={meta}
        tokenMarket={market({ priceUsd: null })}
        supply={supply}
      />,
    );
    expect(screen.getByText("Market Cap")).toBeInTheDocument();
    expect(screen.queryByText("price x circulating")).not.toBeInTheDocument();
  });
});
