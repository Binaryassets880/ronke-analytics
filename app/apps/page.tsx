import type { Metadata } from "next";
import Link from "next/link";
import { APPS, STATUS_LABEL, type AppCard } from "@/config/apps";

export const metadata: Metadata = {
  title: "Apps",
  description: "Games and tools in the Ronke ecosystem.",
};

function Thumb({ app }: { app: AppCard }) {
  if (app.art) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={app.art} alt="" className="h-32 w-full rounded-lg object-cover" />;
  }
  return (
    <div
      className={`flex h-32 w-full items-center justify-center rounded-lg bg-gradient-to-br ${app.gradient} text-5xl`}
      aria-hidden
    >
      {app.emoji}
    </div>
  );
}

function AppTile({ app }: { app: AppCard }) {
  const isExternal = app.href.startsWith("http");
  const isDisabled = app.href === "#";
  const inner = (
    <>
      <Thumb app={app} />
      <div className="mt-3 flex items-center gap-2">
        <h2 className="font-semibold">{app.title}</h2>
        {app.ticker ? (
          <span className="mono rounded-md border border-[var(--border)] bg-[var(--card-2)] px-1.5 py-0.5 text-[11px] text-[var(--accent)]">
            {app.ticker}
          </span>
        ) : null}
        <span
          className={`ml-auto rounded-full px-2 py-0.5 text-xs ${
            app.status === "live"
              ? "bg-[color-mix(in_srgb,var(--diamond)_18%,transparent)] text-[var(--diamond)]"
              : "bg-[var(--card-2)] text-[var(--muted-2)]"
          }`}
        >
          {STATUS_LABEL[app.status]}
        </span>
      </div>
      <p className="mt-1 text-sm text-[var(--muted)]">{app.blurb}</p>
    </>
  );

  const cardClass =
    "block rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 transition-colors";

  if (isDisabled) {
    return <div className={`${cardClass} opacity-70`}>{inner}</div>;
  }
  return (
    <Link
      href={app.href}
      target={isExternal ? "_blank" : undefined}
      rel={isExternal ? "noopener noreferrer" : undefined}
      className={`${cardClass} hover:border-[var(--accent)]`}
    >
      {inner}
    </Link>
  );
}

export default function AppsPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Apps</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Games and tools in the Ronke ecosystem.
        </p>
      </header>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {APPS.map((app) => (
          <AppTile key={app.key} app={app} />
        ))}
      </div>
      <p className="text-sm text-[var(--muted-2)]">More official Ronke apps coming soon.</p>
    </div>
  );
}
