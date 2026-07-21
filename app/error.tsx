"use client";

import { useEffect } from "react";
import Link from "next/link";

/** Branded runtime-error boundary (replaces the framework's white
 * "Application error" screen). */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // The boundary previously discarded the error entirely: nothing logged,
  // and the digest (the only handle that ties a user's report to a server
  // trace) was unreachable. Log it, and show it.
  useEffect(() => {
    console.error("[pea] page error", { digest: error.digest, error });
  }, [error]);

  return (
    <section className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-32 text-center">
      <p
        className="text-[64px] font-black leading-none text-accent md:text-[84px]"
        style={{
          textShadow:
            "0 0 24px rgba(204,255,0,0.55), 0 0 90px rgba(204,255,0,0.25)",
        }}
      >
        Error
      </p>
      <p className="max-w-[44ch] text-[15px] font-light text-fg">
        Something went wrong on this page. Your funds are not affected by this
        screen.
      </p>
      {error.digest ? (
        <p className="tnum text-[12px] text-fg-muted">
          Reference <span className="text-fg-body">{error.digest}</span>
        </p>
      ) : null}
      <div className="mt-4 flex items-center gap-4">
        <button
          type="button"
          onClick={reset}
          className="cursor-pointer rounded-full border border-accent px-7 py-3 text-[13px] font-bold uppercase tracking-[0.14em] text-accent transition hover:bg-accent hover:text-on-light"
        >
          Try again
        </button>
        <Link
          href="/"
          className="rounded-full border border-line-slate px-7 py-3 text-[13px] font-bold uppercase tracking-[0.14em] text-fg-muted transition hover:border-fg-muted hover:text-fg"
        >
          Back to mining
        </Link>
      </div>
    </section>
  );
}
