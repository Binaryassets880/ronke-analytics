"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { normalizeAddress } from "@/lib/format";

/**
 * Wallet search box (U8): the entry point to a wallet profile. Without it the
 * profile is unreachable by a real visitor. Accepts either a 0x address (mixed
 * case -> lowercase) or a `.ron` name (E4), routing to /wallet/[address] where a
 * `.ron` name is resolved server-side. A malformed input shows an inline error
 * instead of a blank/404 render.
 */
export function WalletSearch({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim().toLowerCase();
    const addr = normalizeAddress(trimmed);
    if (addr) {
      setError(null);
      router.push(`/wallet/${addr}`);
      return;
    }
    if (trimmed.endsWith(".ron") && trimmed.length > 4) {
      setError(null);
      router.push(`/wallet/${encodeURIComponent(trimmed)}`);
      return;
    }
    setError("Enter a 0x wallet address or a .ron name.");
  };

  return (
    <form onSubmit={submit} className={compact ? "" : "w-full"}>
      <div className="flex gap-2">
        <input
          aria-label="Wallet address or .ron name"
          placeholder={compact ? "wallet or .ron" : "ronke.ron  or  0x…"}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="mono min-w-0 flex-1 rounded-xl border border-[var(--border-strong)] bg-[#080a0f] px-3.5 py-2.5 text-sm outline-none focus:border-[var(--accent)]"
        />
        <button
          type="submit"
          className="shrink-0 rounded-xl px-4 py-2.5 text-sm font-bold text-[#04121c]"
          style={{ background: "var(--accent)" }}
        >
          {compact ? "Go" : "Get Score →"}
        </button>
      </div>
      {error ? (
        <p role="alert" className="mt-1 text-xs text-rose-300">
          {error}
        </p>
      ) : null}
    </form>
  );
}
