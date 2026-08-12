import { describe, it, expect, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/leaderboard",
  useSearchParams: () => new URLSearchParams(),
}));

import { render, screen, within } from "@testing-library/react";
import { RonkeScoreCard } from "@/app/components/RonkeScoreCard";
import { ScoreLeaderboardView } from "@/app/components/ScoreLeaderboardView";
import type { WalletScore, ScoreLeaderboardRow } from "@/lib/queries";

// Distinct values per field so each rendered number is unambiguous.
const score: WalletScore = {
  score: 1_653,
  rank: 3,
  percentile: 99.9,
  ronkeSubscore: 820,
  ronkestrSubscore: 511,
  nftSubscore: 322,
  ronkeHolding: 620,
  ronkeDuration: 200,
  ronkeDiamondMult: 1,
  ronkestrHolding: 411,
  ronkestrDuration: 100,
  ronkestrDiamondMult: 0.6,
  nftHolding: 222,
  nftDuration: 40,
  nftDiamondMult: 1,
  collectorPoints: 60,
  bodyTypesHeld: 4,
  bodyTypesTotal: 10,
  oneOfOnePoints: 0,
  oneOfOneCount: 0,
};

describe("RonkeScoreCard", () => {
  it("renders all three sub-score cards including RonkeStr", () => {
    render(<RonkeScoreCard score={score} />);
    expect(screen.getByText("$RONKE")).toBeInTheDocument();
    expect(screen.getByText("RonkeStr")).toBeInTheDocument();
    expect(screen.getByText("Ronkeverse")).toBeInTheDocument();
    // RonkeStr sub-score total is shown.
    expect(screen.getByText("511")).toBeInTheDocument();
    // Total is the combined score.
    expect(screen.getByText("1,653")).toBeInTheDocument();
  });
});

describe("ScoreLeaderboardView", () => {
  const rows: ScoreLeaderboardRow[] = [
    { address: "0x" + "1".repeat(40), name: "one.ron", score: 1_653, rank: 1, percentile: 99.9, ronkeSubscore: 820, ronkestrSubscore: 511, nftSubscore: 322, bodyTypesHeld: 4, bodyTypesTotal: 10 },
  ];

  it("renders a RonkeStr Score column with the row's RonkeStr sub-score", () => {
    render(<ScoreLeaderboardView page={0} rows={rows} pageSize={50} />);
    expect(screen.getByRole("columnheader", { name: "RonkeStr" })).toBeInTheDocument();
    const bodyRow = screen.getAllByRole("row")[1];
    // The RonkeStr sub-score value appears in the row.
    expect(within(bodyRow).getByText("511")).toBeInTheDocument();
  });
});
