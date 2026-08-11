import type { Metadata } from "next";
import { DeveloperDocsView } from "../components/DeveloperDocsView";

export const metadata: Metadata = {
  title: "API for builders",
  description:
    "Public, free, read-only API for the Ronke Score, wallet holdings, badges, and Ronkeverse rarity. " +
    "Build gates, perks, and leaderboards into your own Ronke game, bot, or site.",
};

export default function DevelopersPage() {
  return <DeveloperDocsView />;
}
