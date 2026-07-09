import { describe, it, expect, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/burn",
  useSearchParams: () => new URLSearchParams(),
}));

import { render, screen } from "@testing-library/react";
import { BurnView } from "@/app/components/BurnView";
import { Nav } from "@/app/components/Nav";
import { sectionFor } from "@/app/components/EcosystemNav";
import type { MetaState, SupplyStats } from "@/lib/queries";

const META: MetaState = {
  lastSyncAt: "2026-07-09T07:00:00.000Z",
  lastRebuildAt: "2026-07-09T07:00:00.000Z",
  backfillComplete: true,
  revealedSupply: 6969,
};

const RONKE: SupplyStats = {
  minted: 1_000_000_000,
  burned: 130_605_432,
  circulating: 869_394_568,
  burnedPct: 0.130605432,
};

const RONKESTR: SupplyStats = {
  minted: 21_000_000,
  burned: 4_509_289,
  circulating: 16_490_711,
  burnedPct: 0.2147,
};

describe("BurnView", () => {
  it("stacks both token cards, $RONKE first, $RONKESTR second", () => {
    render(<BurnView ronke={RONKE} ronkestr={RONKESTR} meta={META} />);
    const headings = screen.getAllByRole("heading", { level: 2 });
    expect(headings.map((h) => h.textContent)).toEqual(["$RONKE", "$RONKESTR"]);
    expect(screen.getByText("13.06%")).toBeInTheDocument();
    expect(screen.getByText("21.47%")).toBeInTheDocument();
    expect(screen.getAllByRole("progressbar")).toHaveLength(2);
  });

  it("degrades to a placeholder for one token while the other still renders", () => {
    render(<BurnView ronke={RONKE} ronkestr={null} meta={META} />);
    expect(screen.getByText("13.06%")).toBeInTheDocument();
    expect(screen.getByText("$RONKESTR")).toBeInTheDocument();
    expect(screen.getByText("Burn data temporarily unavailable")).toBeInTheDocument();
    expect(screen.getAllByRole("progressbar")).toHaveLength(1);
  });

  it("shows the pre-backfill state instead of mid-backfill burn numbers", () => {
    render(<BurnView ronke={RONKE} ronkestr={RONKESTR} meta={{ ...META, backfillComplete: false }} />);
    expect(screen.getByText(/Gathering on-chain history/i)).toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });
});

describe("burn page routing", () => {
  it("sectionFor('/burn') resolves to the analytics ('rating') section", () => {
    expect(sectionFor("/burn")).toBe("rating");
  });

  it("sub-nav shows a Burn link marked active on /burn, with the asset toggle hidden", () => {
    render(<Nav />);
    const burn = screen.getByRole("link", { name: "Burn" });
    expect(burn).toHaveAttribute("href", "/burn");
    expect(burn).toHaveAttribute("aria-current", "page");
    // Burn always shows both tokens, so the asset toggle is hidden (like /rarity).
    expect(screen.queryByText("Viewing")).not.toBeInTheDocument();
  });
});
