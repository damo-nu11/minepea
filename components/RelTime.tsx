"use client";

/**
 * Ticking relative-time leaf cell (Convention 4): only this tiny component
 * re-renders as time passes. Client-only by construction — consumers render
 * it exclusively from live (bootstrapped) data, so there is no SSR mismatch.
 */

import { useEffect, useState } from "react";
import { relTime } from "@/lib/format";

export function RelTime({ at }: { at: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);
  return <span className="tnum">{relTime(at, now)}</span>;
}
