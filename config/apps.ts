/**
 * Content config for the Ronke Apps page (E3, KTD-E2).
 *
 * The gallery of games/tools in the Ronke ecosystem. Each card is a config
 * entry; adding an app is an edit here. `art` is an optional image path under
 * /public - when absent the card renders an emoji + gradient fallback so a new
 * app looks intentional before its art exists.
 *
 * TODO: fill `href` with the real deployed/hosted URLs as these ship.
 */

export type AppStatus = "live" | "beta" | "coming-soon";

export interface AppCard {
  key: string;
  title: string;
  /** Short ticker / abbreviation shown as a chip (e.g. "RONKESTR"). */
  ticker?: string;
  blurb: string;
  href: string;
  status: AppStatus;
  /** Optional image under /public (e.g. "/apps/ronkeverse.png"). */
  art?: string;
  /** Fallback glyph + gradient when no art is set. */
  emoji: string;
  gradient: string;
}

export const APPS: AppCard[] = [
  {
    key: "ronke-strategy",
    title: "Ronke Strategy",
    ticker: "RONKESTR",
    blurb:
      "The perpetual NFT machine - fees buy Ronkeverse NFTs, relist at a markup, then buy & burn. Forever.",
    href: "https://roninstrategy.fun",
    status: "beta",
    emoji: "\u{267E}\u{FE0F}", // ♾️
    gradient: "from-violet-500/30 to-indigo-500/20",
  },
  {
    key: "age-of-ronke",
    title: "Age of Ronke",
    ticker: "AoR",
    blurb:
      "The Ronke strategy game - build, defend, and rise through the Ages of the Ronkeverse.",
    href: "#", // TODO: set the real Age of Ronke URL when it ships
    status: "coming-soon",
    emoji: "\u{2694}\u{FE0F}", // ⚔️
    gradient: "from-amber-500/30 to-rose-500/20",
  },
  {
    key: "ronke-score-api",
    title: "Ronke Score API",
    ticker: "API",
    blurb:
      "Build the Ronke Score into your own game or bot - scores, ranks, holdings, and rarity. Free, no key.",
    href: "/developers",
    status: "live",
    emoji: "\u{1F9E9}", // 🧩
    gradient: "from-sky-500/30 to-cyan-500/20",
  },
  {
    key: "ronke-rice-farm",
    title: "Ronke Rice Farm",
    ticker: "RRF",
    blurb:
      "A 69.69-day farming competition where strategy beats speed. Survive the Jeet Jail, earn $RICE.",
    href: "https://ronkericefarmer.com",
    status: "live",
    emoji: "\u{1F33E}", // 🌾
    gradient: "from-emerald-500/30 to-yellow-500/20",
  },
];

export const STATUS_LABEL: Record<AppStatus, string> = {
  live: "Live",
  beta: "Beta",
  "coming-soon": "Coming soon",
};
