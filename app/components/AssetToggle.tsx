"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { assetFromParam, assetToParam, type AssetParam } from "@/lib/format";

/**
 * Asset toggle (U7, extended for RonkeStr). Persists the choice in the URL
 * `?asset=` param so server components read it and every panel switches datasets
 * together. Default landing is the $RONKE token view.
 */
const OPTIONS: { value: AssetParam; label: string }[] = [
  { value: "token", label: "$RONKE" },
  { value: "ronkestr", label: "RonkeStr" },
  { value: "nft", label: "Ronkeverse" },
];

export function AssetToggle() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const current = assetFromParam(params.get("asset"));

  const select = (value: AssetParam) => {
    const next = new URLSearchParams(params.toString());
    next.set("asset", value);
    router.push(`${pathname}?${next.toString()}`);
  };

  return (
    <div className="inline-flex rounded-lg border border-[var(--border)] p-0.5 text-sm" role="tablist" aria-label="Asset">
      {OPTIONS.map(({ value, label }) => {
        const active = assetToParam(current) === value;
        return (
          <button
            key={value}
            role="tab"
            aria-selected={active}
            onClick={() => select(value)}
            className={`rounded-md px-3 py-1 ${
              active ? "bg-white text-black" : "text-neutral-300 hover:text-white"
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
