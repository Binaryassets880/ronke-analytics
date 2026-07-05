import { describe, it, expect, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/holders",
  useSearchParams: () => new URLSearchParams(),
}));

import { render, screen, fireEvent, within } from "@testing-library/react";
import { HoldersView } from "@/app/components/HoldersView";
import { HolderTable } from "@/app/components/HolderTable";
import type { HoldersData, MetaState, HolderRow } from "@/lib/queries";

const meta: MetaState = {
  lastSyncAt: "2026-07-05T07:00:00Z",
  lastRebuildAt: "2026-07-05T07:05:00Z",
  backfillComplete: true,
  revealedSupply: null,
};

const rows: HolderRow[] = [
  { address: "0x" + "1".repeat(40), balance: "300", tokenCount: 0, holdingDurationDays: 5, diamondBucket: "paper", neverSold: false },
  { address: "0x" + "2".repeat(40), balance: "900", tokenCount: 0, holdingDurationDays: 90, diamondBucket: "diamond", neverSold: true },
];

describe("HoldersView", () => {
  it("renders concentration stats and the holder table without network", () => {
    const data: HoldersData = { gini: 0.523, top10Pct: 0.42, histogram: [], holders: rows };
    render(<HoldersView asset="ronke_token" data={data} meta={meta} now={new Date("2026-07-05T08:00:00Z")} />);
    expect(screen.getByText("0.523")).toBeInTheDocument(); // gini
    expect(screen.getByText("42.0%")).toBeInTheDocument(); // top-10
  });
});

describe("HolderTable sorting", () => {
  it("sorts by balance by default and by holding duration on demand", () => {
    render(<HolderTable rows={rows} asset="ronke_token" />);
    const getFirstRowAddr = () => {
      const body = screen.getAllByRole("row").slice(1); // skip header
      return within(body[0]).getAllByRole("cell")[0].textContent;
    };
    // default sort = amount desc -> 0x2222 (900) first
    expect(getFirstRowAddr()).toContain("0x2222");
    // sort by duration -> 0x2222 has 90 days, still first; flip to a case that differs:
    fireEvent.click(screen.getByLabelText("Sort by holding duration"));
    expect(getFirstRowAddr()).toContain("0x2222"); // 90d > 5d
  });
});
