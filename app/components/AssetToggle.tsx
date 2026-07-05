"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { assetFromParam, assetToParam } from "@/lib/format";

/**
 * Token/NFT toggle (U7). Persists the choice in the URL `?asset=` param so
 * server components read it and every panel switches datasets together.
 * Default landing is the token view.
 */
export function AssetToggle() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const current = assetFromParam(params.get("asset"));

  const select = (value: "token" | "nft") => {
    const next = new URLSearchParams(params.toString());
    next.set("asset", value);
    router.push(`${pathname}?${next.toString()}`);
  };

  return (
    <div className="inline-flex rounded-lg border border-[var(--border)] p-0.5 text-sm" role="tablist" aria-label="Asset">
      {(["token", "nft"] as const).map((v) => {
        const active = assetToParam(current) === v;
        return (
          <button
            key={v}
            role="tab"
            aria-selected={active}
            onClick={() => select(v)}
            className={`rounded-md px-3 py-1 ${
              active ? "bg-white text-black" : "text-neutral-300 hover:text-white"
            }`}
          >
            {v === "token" ? "$RONKE" : "Ronkeverse"}
          </button>
        );
      })}
    </div>
  );
}
