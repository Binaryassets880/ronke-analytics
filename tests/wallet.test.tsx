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
  ronkeBalance: "5000000000000000000000000", // 5,000,000
  ronkeverseCount: 3,
  holdingDurationDays: 120,
  diamondBucket: "diamond",
  neverSold: true,
  everPaperSold: false,
  firstAcquiredAt: "2025-02-25T00:00:00.000Z",
  heldTokens: [
    { tokenId: "42", rarityRank: 7, imageUrl: null },
    { tokenId: "99", rarityRank: null, imageUrl: null },
  ],
  everHeld: true,
};

describe("WalletView", () => {
  it("shows bucket, never-sold, first-acquired, and held tokens for a diamond holder", () => {
    render(<WalletView wallet={diamondHolder} />);
    expect(screen.getByText("Diamond")).toBeInTheDocument();
    expect(screen.getByText("Never sold")).toBeInTheDocument();
    expect(screen.getByText(/First acquired 2025-02-25/)).toBeInTheDocument();
    expect(screen.getByText(/Ronkeverse held \(2\)/)).toBeInTheDocument();
    expect(screen.getByText("rank 7")).toBeInTheDocument(); // rarity rank surfaced
  });

  it("renders a clean empty state for an address that never held (not an error)", () => {
    const never: WalletData = {
      address: "0x" + "b".repeat(40),
      ronkeBalance: "0",
      ronkeverseCount: 0,
      holdingDurationDays: 0,
      diamondBucket: null,
      neverSold: false,
      everPaperSold: false,
      firstAcquiredAt: null,
      heldTokens: [],
      everHeld: false,
    };
    render(<WalletView wallet={never} />);
    expect(screen.getByText(/never held/i)).toBeInTheDocument();
    expect(screen.queryByText("Diamond")).not.toBeInTheDocument();
  });
});
