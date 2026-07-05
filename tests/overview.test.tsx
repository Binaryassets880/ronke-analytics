import { describe, it, expect, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

import { render, screen } from "@testing-library/react";
import { OverviewView } from "@/app/components/OverviewView";
import type { OverviewData, MetaState } from "@/lib/queries";

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
