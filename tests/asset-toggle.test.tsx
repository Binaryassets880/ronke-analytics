import { describe, it, expect, vi } from "vitest";

const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
  usePathname: () => "/holders",
  useSearchParams: () => new URLSearchParams(""),
}));

import { render, screen, fireEvent } from "@testing-library/react";
import { AssetToggle } from "@/app/components/AssetToggle";

describe("AssetToggle", () => {
  it("defaults to the token tab and switches the URL asset param", () => {
    render(<AssetToggle />);
    const token = screen.getByRole("tab", { name: "$RONKE" });
    const nft = screen.getByRole("tab", { name: "Ronkeverse" });
    expect(token).toHaveAttribute("aria-selected", "true");
    expect(nft).toHaveAttribute("aria-selected", "false");

    fireEvent.click(nft);
    expect(pushMock).toHaveBeenCalledWith("/holders?asset=nft");
  });
});
