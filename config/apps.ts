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
    key: "ronke-score",
    title: "Ronke Score",
    blurb:
      "The analytics hub - holder ratings, diamond-hands stats, badges, and Ronkeverse rarity. You're already here.",
    href: "/",
    status: "live",
    emoji: "\u{1F4CA}", // 📊
    gradient: "from-sky-500/30 to-emerald-500/20",
  },
  // Add official Ronke apps here as they ship.
];

export const STATUS_LABEL: Record<AppStatus, string> = {
  live: "Live",
  beta: "Beta",
  "coming-soon": "Coming soon",
};
