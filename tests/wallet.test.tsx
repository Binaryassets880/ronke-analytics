import { describe, it, expect, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/wallet/0x",
  useSearchParams: () => new URLSearchParams(),
}));

import { render, screen } from "@testing-library/react";
import { WalletView } from "@/app/components/WalletView";
import type { WalletData } from "@/lib/queries";

const diamondHolder: WalletData = {
  address: "0x" + "a".repeat(40),
  name: "whale.ron",
  ronkeBalance: "5000000000000000000000000", // 5,000,000
  ronkestrBalance: "250000000000000000000000", // 250,000 RonkeStr
  ronkeverseCount: 3,
  holdingDurationDays: 120,
  diamondBucket: "diamond",
  neverSold: true,
  everPaperSold: false,
  firstAcquiredAt: "2025-02-25T00:00:00.000Z",
  assetHoldings: [
    { asset: "ronke_token", label: "$RONKE", balance: "5000000000000000000000000", tokenCount: 0, isHeld: true, holdingDurationDays: 120, diamondBucket: "diamond", firstAcquiredAt: "2025-02-25T00:00:00.000Z", neverSold: true, everPaperSold: false, tier: null },
    { asset: "ronkestr_token", label: "RonkeStr", balance: "250000000000000000000000", tokenCount: 0, isHeld: true, holdingDurationDays: 90, diamondBucket: "regular", firstAcquiredAt: "2025-03-01T00:00:00.000Z", neverSold: true, everPaperSold: false, tier: null },
    { asset: "ronkeverse_nft", label: "Ronkeverse", balance: "0", tokenCount: 3, isHeld: true, holdingDurationDays: 60, diamondBucket: "diamond", firstAcquiredAt: "2025-04-01T00:00:00.000Z", neverSold: true, everPaperSold: false, tier: null },
  ],
  heldTokens: [
    { tokenId: "42", rarityRank: 7, imageUrl: null, tier: "standard" },
    { tokenId: "99", rarityRank: null, imageUrl: null, tier: "community_1of1" },
  ],
  everHeld: true,
};

describe("WalletView", () => {
  it("shows per-asset bucket, never-sold, first-buy, and held tokens for a diamond holder", () => {
    render(<WalletView wallet={diamondHolder} />);
    expect(screen.getByText("Holdings by asset")).toBeInTheDocument();
    expect(screen.getAllByText("Diamond").length).toBeGreaterThan(0); // per-asset hands badge
    expect(screen.getAllByText("Never sold").length).toBeGreaterThan(0);
    expect(screen.getAllByText("First buy").length).toBeGreaterThan(0); // per-asset first buy
    expect(screen.getByText(/Ronkeverse held \(2\)/)).toBeInTheDocument();
    expect(screen.getByText("rank 7")).toBeInTheDocument(); // rarity rank surfaced
    expect(screen.getByText("whale.ron")).toBeInTheDocument(); // .ron name in header
    expect(screen.getByText("RonkeStr")).toBeInTheDocument(); // RonkeStr asset card
    expect(screen.getByText("250K")).toBeInTheDocument(); // 250,000 RonkeStr, compacted
  });

  it("renders a clean empty state for an address that never held (not an error)", () => {
    const never: WalletData = {
      address: "0x" + "b".repeat(40),
      name: null,
      ronkeBalance: "0",
      ronkestrBalance: "0",
      ronkeverseCount: 0,
      holdingDurationDays: 0,
      diamondBucket: null,
      neverSold: false,
      everPaperSold: false,
      firstAcquiredAt: null,
      assetHoldings: [],
      heldTokens: [],
      everHeld: false,
    };
    render(<WalletView wallet={never} />);
    expect(screen.getByText(/never held/i)).toBeInTheDocument();
    expect(screen.queryByText("Diamond")).not.toBeInTheDocument();
  });
});
