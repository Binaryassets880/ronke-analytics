"use client";

/** Visitor-facing failure boundary for failed Neon reads (U7). */
export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="rounded-xl border border-rose-500/30 bg-[var(--card)] p-8 text-center">
      <h2 className="text-lg font-semibold">Something went wrong loading this data.</h2>
      <p className="mt-1 text-sm text-neutral-400">
        The dashboard could not read from the database. This is usually temporary.
      </p>
      <button
        onClick={reset}
        className="mt-4 rounded-lg bg-white px-4 py-1.5 text-sm font-medium text-black"
      >
        Try again
      </button>
    </div>
  );
}
