import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { BurnCard } from "@/app/components/BurnCard";
import { StatTile } from "@/app/components/StatTile";
import { formatPct } from "@/lib/format";
import type { SupplyStats } from "@/lib/queries";

const RONKE_STATS: SupplyStats = {
  minted: 1_000_000_000,
  burned: 130_605_432.04,
  circulating: 869_394_567.96,
  burnedPct: 0.130605432,
};

describe("BurnCard", () => {
  it("renders the % Burned headline, bar labels, and all three tiles from props", () => {
    render(<BurnCard symbol="RONKE" subtitle="Ronke Token" stats={RONKE_STATS} />);
    // Headline + Deflation Rate tile both show the two-decimal cumulative share.
    expect(screen.getByText("13.06%")).toBeInTheDocument();
    expect(screen.getByText("$RONKE")).toBeInTheDocument();
    expect(screen.getByText("Ronke Token")).toBeInTheDocument();
    expect(screen.getByText("Circulating Supply")).toBeInTheDocument();
    expect(screen.getByText("869.39M RONKE")).toBeInTheDocument();
    expect(screen.getByText("Burned Forever")).toBeInTheDocument();
    expect(screen.getAllByText("130.61M RONKE").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Deflation Rate")).toBeInTheDocument();
    expect(screen.getByText("13.06% Burned")).toBeInTheDocument();
    expect(screen.getByText("1B RONKE")).toBeInTheDocument();
  });

  it("exposes the bar as an accessible progressbar with the burned share", () => {
    render(<BurnCard symbol="RONKE" subtitle="Ronke Token" stats={RONKE_STATS} />);
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "13");
    expect(bar).toHaveAttribute("aria-valuemin", "0");
    expect(bar).toHaveAttribute("aria-valuemax", "100");
    expect(bar).toHaveAttribute("aria-label", expect.stringContaining("RONKE burned"));
    const fill = bar.querySelector("span");
    expect(fill).toHaveStyle({ width: "13.06%" });
  });

  it("clamps an out-of-range burned share (bad ledger data) to a 100% bar", () => {
    // burnedPct > 1 is the case the clamp exists for - exactly 1 would pass
    // even without clamping, so it proves nothing.
    render(
      <BurnCard
        symbol="X"
        subtitle="Test"
        stats={{ minted: 100, burned: 140, circulating: -40, burnedPct: 1.4 }}
      />,
    );
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "100");
    expect(bar.querySelector("span")).toHaveStyle({ width: "100.00%" });
  });

  it("clamps a negative burned share to an empty bar", () => {
    render(
      <BurnCard
        symbol="X"
        subtitle="Test"
        stats={{ minted: 100, burned: -5, circulating: 105, burnedPct: -0.05 }}
      />,
    );
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "0");
    expect(bar.querySelector("span")).toHaveStyle({ width: "0.00%" });
  });

  it("renders the unavailable placeholder (no progressbar) for null stats", () => {
    render(<BurnCard symbol="RONKESTR" subtitle="NFTStrategy Token" stats={null} />);
    expect(screen.getByText("Burn data temporarily unavailable")).toBeInTheDocument();
    expect(screen.getByText("$RONKESTR")).toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("treats zero-minted stats as unavailable rather than dividing to NaN", () => {
    render(
      <BurnCard
        symbol="RONKE"
        subtitle="Ronke Token"
        stats={{ minted: 0, burned: 0, circulating: 0, burnedPct: 0 }}
      />,
    );
    expect(screen.getByText("Burn data temporarily unavailable")).toBeInTheDocument();
  });
});

describe("formatPct digits parameter", () => {
  it("keeps the one-decimal default unchanged for existing call sites", () => {
    expect(formatPct(0.1306)).toBe("13.1%");
  });

  it("renders two decimals when asked (burn headline)", () => {
    expect(formatPct(0.130605432, 2)).toBe("13.06%");
  });
});

describe("StatTile valueClassName", () => {
  it("renders unchanged without the prop (regression guard for existing callers)", () => {
    render(<StatTile label="Price" value="$1.00" />);
    const value = screen.getByText("$1.00");
    expect(value.className).toContain("mono");
    expect(value.className).toContain("font-bold");
    expect(value.className).not.toContain("undefined");
  });

  it("appends the extra class to the value element when provided", () => {
    render(<StatTile label="Burned" value="130.61M" valueClassName="text-[var(--burn)]" />);
    expect(screen.getByText("130.61M").className).toContain("text-[var(--burn)]");
  });
});
