"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { normalizeAddress } from "@/lib/format";

/**
 * Wallet search box (U8): the entry point to a wallet profile. Without it the
 * profile is unreachable by a real visitor. Validates + normalizes a pasted
 * 0x address (mixed case -> lowercase) before routing to /wallet/[address];
 * a malformed address shows an inline error instead of a blank/404 render.
 */
export function WalletSearch({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const addr = normalizeAddress(value);
    if (!addr) {
      setError("Enter a valid 0x wallet address (40 hex chars).");
      return;
    }
    setError(null);
    router.push(`/wallet/${addr}`);
  };

  return (
    <form onSubmit={submit} className={compact ? "" : "w-full"}>
      <div className="flex gap-2">
        <input
          aria-label="Wallet address"
          placeholder="Look up a wallet (0x…)"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-sm outline-none focus:border-[var(--accent)]"
        />
        <button
          type="submit"
          className="rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-black"
        >
          Look up
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
