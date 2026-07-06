import { describe, it, expect, vi } from "vitest";

const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

import { render, screen, fireEvent } from "@testing-library/react";
import { WalletSearch } from "@/app/components/WalletSearch";

const LABEL = "Wallet address or .ron name";

describe("WalletSearch", () => {
  it("routes a pasted address to its profile, normalizing mixed case", () => {
    pushMock.mockClear();
    render(<WalletSearch />);
    const input = screen.getByLabelText(LABEL);
    fireEvent.change(input, {
      target: { value: "0x" + "AbCdEf0000000000000000000000000000000001".slice(0, 40) },
    });
    fireEvent.click(screen.getByText("Look up"));
    expect(pushMock).toHaveBeenCalledWith("/wallet/0xabcdef0000000000000000000000000000000001");
  });

  it("routes a .ron name to the profile (resolved server-side)", () => {
    pushMock.mockClear();
    render(<WalletSearch />);
    fireEvent.change(screen.getByLabelText(LABEL), { target: { value: "Ronke.RON" } });
    fireEvent.click(screen.getByText("Look up"));
    expect(pushMock).toHaveBeenCalledWith("/wallet/ronke.ron");
  });

  it("shows an inline validation error for malformed input (no navigation)", () => {
    pushMock.mockClear();
    render(<WalletSearch />);
    fireEvent.change(screen.getByLabelText(LABEL), { target: { value: "nope" } });
    fireEvent.click(screen.getByText("Look up"));
    expect(screen.getByRole("alert")).toHaveTextContent(/0x wallet address or a \.ron name/i);
    expect(pushMock).not.toHaveBeenCalled();
  });
});
