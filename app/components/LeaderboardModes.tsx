import Link from "next/link";
import type { AssetParam } from "@/lib/format";

/**
 * Shared toggle between the global Ronke Score leaderboard and the per-asset
 * Holdings / Diamond leaderboards (S-series). Rendered by both views. The
 * per-asset modes preserve the current asset; Ronke Score is global.
 */
export function LeaderboardModes({
  active,
  assetParam = "token",
}: {
  active: "score" | "size" | "diamond";
  assetParam?: AssetParam;
}) {
  const modes = [
    { key: "score", label: "Ronke Score", href: "/leaderboard?by=score" },
    { key: "size", label: "Holdings", href: `/leaderboard?asset=${assetParam}&by=size` },
    { key: "diamond", label: "Diamond", href: `/leaderboard?asset=${assetParam}&by=diamond` },
  ] as const;

  return (
    <div className="inline-flex gap-1 rounded-xl border border-[var(--border)] bg-[var(--card)] p-1 text-sm">
      {modes.map((m) => {
        const isActive = active === m.key;
        return (
          <Link
            key={m.key}
            href={m.href}
            aria-current={isActive ? "page" : undefined}
            className="rounded-lg px-3.5 py-1.5 font-semibold transition-colors"
            style={
              isActive
                ? { background: "var(--accent)", color: "#04121c" }
                : { color: "var(--muted)" }
            }
          >
            {m.label}
          </Link>
        );
      })}
    </div>
  );
}
