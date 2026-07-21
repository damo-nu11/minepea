import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "PEA | 404",
};

/** Branded 404: glowing accent numeral on pure black (the framework's
 * white default is off-brand and must never show). */
export default function NotFound() {
  return (
    <section className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-32 text-center">
      <p
        className="tnum text-[96px] font-black leading-none text-accent md:text-[128px]"
        style={{
          textShadow:
            "0 0 24px rgba(204,255,0,0.55), 0 0 90px rgba(204,255,0,0.25)",
        }}
      >
        404
      </p>
      <p className="text-[15px] font-light text-fg">
        This page could not be found.
      </p>
      <Link
        href="/"
        className="mt-4 rounded-full border border-accent px-7 py-3 text-[13px] font-bold uppercase tracking-[0.14em] text-accent transition hover:bg-accent hover:text-on-light"
      >
        Back to mining
      </Link>
    </section>
  );
}
