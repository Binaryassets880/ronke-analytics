import { describe, it, expect, vi } from "vitest";

const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
  usePathname: () => "/rarity",
  useSearchParams: () => new URLSearchParams(),
}));

import { render, screen, fireEvent } from "@testing-library/react";
import { RarityView } from "@/app/components/RarityView";
import { TokenDetailView } from "@/app/components/TokenDetailView";
import { TraitFilter } from "@/app/components/TraitFilter";
import type { RarityRow, TraitDistribution, MetaState, TokenDetail } from "@/lib/queries";

const meta: MetaState = { lastSyncAt: null, lastRebuildAt: null, backfillComplete: true, revealedSupply: 3 };
const rows: RarityRow[] = [
  { tokenId: "7", rarityRank: 1, infoContentScore: 1.8, imageUrl: null },
  { tokenId: "12", rarityRank: 2, infoContentScore: 1.4, imageUrl: null },
  { tokenId: "3", rarityRank: 3, infoContentScore: 0.6, imageUrl: null },
];
const distributions: TraitDistribution[] = [
  { traitType: "Background", values: [{ value: "Pink", count: 1, probability: 0.33 }, { value: "Blue", count: 2, probability: 0.66 }] },
];

describe("RarityView", () => {
  it("renders a rank-sorted grid from a seeded fixture (no network)", () => {
    render(<RarityView rows={rows} distributions={distributions} meta={meta} />);
    const links = screen.getAllByRole("link").filter((a) => a.getAttribute("href")?.startsWith("/rarity/"));
    // first card is rank 1 token #7
    expect(links[0]).toHaveAttribute("href", "/rarity/7");
    expect(screen.getByText("rank 1")).toBeInTheDocument();
    expect(screen.getByText(/3 revealed tokens/)).toBeInTheDocument();
  });

  it("does not depend on the global token/NFT asset toggle", () => {
    const { container } = render(<RarityView rows={rows} distributions={distributions} meta={meta} />);
    // no asset toggle tablist is rendered by the rarity view itself
    expect(container.querySelector('[role="tablist"]')).toBeNull();
  });
});

describe("TraitFilter", () => {
  it("navigates to a trait-filtered URL on selection", () => {
    pushMock.mockClear();
    render(<TraitFilter distributions={distributions} />);
    fireEvent.change(screen.getByLabelText("Filter by trait"), { target: { value: "0" } });
    expect(pushMock).toHaveBeenCalledWith("/rarity?tt=Background&tv=Pink");
  });
});

describe("TokenDetailView", () => {
  it("shows rank, score, and traits with probabilities for a revealed token", () => {
    const token: TokenDetail = {
      tokenId: "7",
      rarityRank: 1,
      infoContentScore: 1.834,
      imageUrl: null,
      traits: [{ traitType: "Background", value: "Pink", probability: 0.196 }],
    };
    render(<TokenDetailView token={token} />);
    expect(screen.getByText("#1")).toBeInTheDocument();
    expect(screen.getByText("Background")).toBeInTheDocument();
    expect(screen.getByText("19.6%")).toBeInTheDocument();
  });

  it("renders an explicit unrevealed state (not a bogus rank) when unranked", () => {
    const token: TokenDetail = {
      tokenId: "999",
      rarityRank: null,
      infoContentScore: 0,
      imageUrl: null,
      traits: [],
    };
    render(<TokenDetailView token={token} />);
    expect(screen.getByText(/unrevealed/i)).toBeInTheDocument();
    expect(screen.queryByText(/OpenRarity rank/)).not.toBeInTheDocument();
  });
});

describe("token OG image route", () => {
  it("exports image metadata + a default renderer", async () => {
    const mod = await import("@/app/rarity/[tokenId]/opengraph-image");
    expect(mod.size).toEqual({ width: 1200, height: 630 });
    expect(mod.contentType).toBe("image/png");
    expect(typeof mod.default).toBe("function");
  });
});
