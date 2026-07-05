import { describe, it, expect, vi } from "vitest";

const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

import { render, screen, fireEvent } from "@testing-library/react";
import { WalletSearch } from "@/app/components/WalletSearch";

describe("WalletSearch", () => {
  it("routes a pasted address to its profile, normalizing mixed case", () => {
    pushMock.mockClear();
    render(<WalletSearch />);
    const input = screen.getByLabelText("Wallet address");
    fireEvent.change(input, {
      target: { value: "0x" + "AbCdEf0000000000000000000000000000000001".slice(0, 40) },
    });
    fireEvent.click(screen.getByText("Look up"));
    expect(pushMock).toHaveBeenCalledWith("/wallet/0xabcdef0000000000000000000000000000000001");
  });

  it("shows an inline validation error for a malformed address (no navigation)", () => {
    pushMock.mockClear();
    render(<WalletSearch />);
    fireEvent.change(screen.getByLabelText("Wallet address"), { target: { value: "nope" } });
    fireEvent.click(screen.getByText("Look up"));
    expect(screen.getByRole("alert")).toHaveTextContent(/valid 0x wallet address/i);
    expect(pushMock).not.toHaveBeenCalled();
  });
});
