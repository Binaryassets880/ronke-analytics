import type { Metadata } from "next";
import Link from "next/link";
import { APPS, STATUS_LABEL, type AppCard } from "@/config/apps";

export const metadata: Metadata = {
  title: "Ronke Apps",
  description: "Games and tools in the Ronke ecosystem - Ronkeverse, Ronke Mixer, and more.",
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
        <span
          className={`ml-auto rounded-full px-2 py-0.5 text-xs ${
            app.status === "live"
              ? "bg-emerald-500/20 text-emerald-300"
              : "bg-neutral-500/20 text-neutral-400"
          }`}
        >
          {STATUS_LABEL[app.status]}
        </span>
      </div>
      <p className="mt-1 text-sm text-neutral-400">{app.blurb}</p>
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
        <h1 className="text-2xl font-bold tracking-tight">Ronke Apps</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Games and tools in the Ronke ecosystem.
        </p>
      </header>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {APPS.map((app) => (
          <AppTile key={app.key} app={app} />
        ))}
      </div>
      <p className="text-sm text-neutral-500">More official Ronke apps coming soon.</p>
    </div>
  );
}
