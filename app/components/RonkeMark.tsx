import Image from "next/image";
import Link from "next/link";

/**
 * The Ronkeverse wordmark: the real Blue Monke coin + "RONKEVERSE".
 * Server-safe (no hooks) so it works in both the header and the footer.
 */
export function RonkeMark({ size = "md" }: { size?: "sm" | "md" }) {
  const px = size === "sm" ? 26 : 34;
  return (
    <Link href="/" className="flex shrink-0 items-center gap-2.5 text-[var(--foreground)]">
      <span
        className="relative shrink-0 overflow-hidden rounded-full"
        style={{ width: px, height: px, boxShadow: "0 0 16px rgba(39,185,252,0.4)" }}
      >
        <Image
          src="/mascot/ronke-coin.png"
          alt="Ronke"
          width={px}
          height={px}
          className="h-full w-full object-cover"
          priority
        />
      </span>
      <span
        className="font-bold tracking-tight"
        style={{ fontSize: size === "sm" ? 16 : 19, letterSpacing: "-0.02em" }}
      >
        RONKE<span style={{ color: "var(--accent)" }}>VERSE</span>
      </span>
    </Link>
  );
}
