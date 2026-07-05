import Link from "next/link";

/**
 * Persistent app shell nav. Fleshed out in U7 with the token/NFT asset toggle
 * and wallet search; this is the U1 skeleton so the layout compiles.
 */
const LINKS = [
  { href: "/", label: "Overview" },
  { href: "/holders", label: "Holders" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/rarity", label: "Rarity" },
];

export function Nav() {
  return (
    <header className="border-b border-[var(--border)]">
      <nav className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3">
        <Link href="/" className="font-semibold tracking-tight">
          Ronke Analytics
        </Link>
        <div className="flex gap-4 text-sm text-neutral-300">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="hover:text-white">
              {l.label}
            </Link>
          ))}
        </div>
      </nav>
    </header>
  );
}
