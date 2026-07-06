import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { BadgeShelf } from "@/app/components/BadgeShelf";
import type { WalletBadge } from "@/lib/queries";

describe("BadgeShelf", () => {
  it("renders each earned badge with its tier and an explanatory tooltip", () => {
    const badges: WalletBadge[] = [
      { badgeKey: "bag_size", tier: 2, context: { balance: 5_000_000, tierLabel: "Believer" } },
      { badgeKey: "diamond_hands", tier: null, context: {} },
      { badgeKey: "dual_citizen", tier: null, context: {} },
    ];
    render(<BadgeShelf badges={badges} />);
    // tiered badge shows "Label: Tier"
    const bag = screen.getByText("Bag Size: Believer");
    expect(bag).toBeInTheDocument();
    expect(bag.closest("[title]")).toHaveAttribute("title", expect.stringContaining("How much $RONKE"));
    // achievement badge with earning explanation
    const diamond = screen.getByText("Diamond Hands");
    expect(diamond.closest("[title]")).toHaveAttribute("title", expect.stringContaining("Never sold"));
  });

  it("shows a graceful empty state for a wallet with no badges", () => {
    render(<BadgeShelf badges={[]} />);
    expect(screen.getByText(/No badges yet/i)).toBeInTheDocument();
  });

  it("groups badges by ecosystem realm ($RONKE / Ronkeverse / Ecosystem)", () => {
    const badges: WalletBadge[] = [
      { badgeKey: "bag_size", tier: 1, context: { balance: 200_000, tierLabel: "Holder" } }, // ronke
      { badgeKey: "collector", tier: 0, context: { count: 2, tierLabel: "Owner" } }, // ronkeverse
      { badgeKey: "dual_citizen", tier: null, context: {} }, // both -> Ecosystem
    ];
    render(<BadgeShelf badges={badges} />);
    expect(screen.getByText("$RONKE")).toBeInTheDocument();
    expect(screen.getByText("Ronkeverse")).toBeInTheDocument();
    expect(screen.getByText("Ecosystem")).toBeInTheDocument();
    // realm-scoped badges render under their realm
    expect(screen.getByText("Bag Size: Holder")).toBeInTheDocument();
    expect(screen.getByText("Collector: Owner")).toBeInTheDocument();
    expect(screen.getByText("Dual Citizen")).toBeInTheDocument();
  });

  it("explains the earning criterion via the badge tooltip (bag threshold context)", () => {
    const badges: WalletBadge[] = [
      { badgeKey: "bag_size", tier: 4, context: { balance: 250_000_000, tierLabel: "Leviathan" } },
    ];
    render(<BadgeShelf badges={badges} />);
    const badge = screen.getByText("Bag Size: Leviathan");
    expect(badge.closest("[title]")).toHaveAttribute("title", expect.stringContaining("Balance 250,000,000"));
  });
});
