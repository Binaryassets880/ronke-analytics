"use client";

import { useState } from "react";

/**
 * Address row with a copy-to-clipboard button (E2). Shows the full address
 * (never truncated in the copy value) so nobody swaps against a wrong contract.
 */
export function CopyAddress({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked (e.g. insecure context) - no-op, address stays visible.
    }
  };

  return (
    <div className="flex items-center gap-2">
      <code className="break-all font-mono text-xs text-neutral-300">{address}</code>
      <button
        type="button"
        onClick={copy}
        aria-label="Copy address"
        className="shrink-0 rounded-md border border-[var(--border)] px-2 py-1 text-xs text-neutral-300 hover:text-white"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
