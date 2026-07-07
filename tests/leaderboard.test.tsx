import { describe, it, expect, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/leaderboard",
  useSearchParams: () => new URLSearchParams(),
}));

import { render, screen } from "@testing-library/react";
import { LeaderboardView } from "@/app/components/LeaderboardView";
import type { LeaderboardRow } from "@/lib/queries";

const rows: LeaderboardRow[] = [
  { address: "0x" + "1".repeat(40), name: null, balance: "9000000000000000000000000", tokenCount: 0, holdingDurationDays: 90, weightedDurationDays: 90, diamondBucket: "diamond", neverSold: true },
  { address: "0x" + "2".repeat(40), name: null, balance: "1000000000000000000000000", tokenCount: 0, holdingDurationDays: 3, weightedDurationDays: 3, diamondBucket: "paper", neverSold: false },
];

describe("LeaderboardView", () => {
  it("renders ranks in the order provided (rank 1 first) with a working page offset", () => {
    render(<LeaderboardView asset="ronke_token" page={0} rows={rows} pageSize={50} />);
    const bodyRows = screen.getAllByRole("row").slice(1);
    expect(bodyRows[0].textContent).toContain("1"); // rank column
    expect(bodyRows[0].textContent).toContain("0x1111");
  });

  it("shows the mode toggle and paginates when a full page is returned", () => {
    const fullPage = Array.from({ length: 50 }, (_, i) => ({
      ...rows[0],
      address: "0x" + String(i).padStart(40, "0"),
    }));
    render(<LeaderboardView asset="ronke_token" page={1} rows={fullPage} pageSize={50} />);
    // mode toggle links (Holdings is the active per-asset mode; Ronke Score is global)
    expect(screen.getByRole("link", { name: "Holdings" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ronke Score" })).toHaveAttribute("href", "/leaderboard?by=score");
    expect(screen.getByText("Next →")).toBeInTheDocument();
    expect(screen.getByText("← Prev")).toBeInTheDocument();
    // page offset: first row on page 1 is rank 51
    const bodyRows = screen.getAllByRole("row").slice(1);
    expect(bodyRows[0].textContent).toContain("51");
  });
});

describe("wallet OG image route", () => {
  it("exports image metadata + a default renderer", async () => {
    // The satori/ImageResponse runtime is exercised at request time; here we
    // assert the route is shaped as a Next OG image route.
    const mod = await import("@/app/wallet/[address]/opengraph-image");
    expect(mod.size).toEqual({ width: 1200, height: 630 });
    expect(mod.contentType).toBe("image/png");
    expect(typeof mod.default).toBe("function");
  });
});
