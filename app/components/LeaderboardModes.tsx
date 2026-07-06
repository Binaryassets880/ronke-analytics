import Link from "next/link";

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
  assetParam?: "token" | "nft";
}) {
  const modes = [
    { key: "score", label: "Ronke Score", href: "/leaderboard?by=score" },
    { key: "size", label: "Holdings", href: `/leaderboard?asset=${assetParam}&by=size` },
    { key: "diamond", label: "Diamond", href: `/leaderboard?asset=${assetParam}&by=diamond` },
  ] as const;

  return (
    <div className="inline-flex rounded-lg border border-[var(--border)] p-0.5 text-sm">
      {modes.map((m) => (
        <Link
          key={m.key}
          href={m.href}
          className={`rounded-md px-3 py-1 ${
            active === m.key ? "bg-white text-black" : "text-neutral-300 hover:text-white"
          }`}
        >
          {m.label}
        </Link>
      ))}
    </div>
  );
}
