"use client";

/**
 * SSR-deterministic y-gutter width (Convention 7 applied to the chart kit):
 * the per-glyph ESTIMATE serves the server render and the first client
 * render — identical by construction, which is the whole point; measuring
 * with a canvas during render made hydration diff x=54 vs 55 on every
 * chart — then an effect upgrades to the real canvas measurement and
 * re-measures once webfonts finish loading (fallback metrics run narrower
 * than the brand face). The estimate remains the floor throughout.
 */

import { useEffect, useState } from "react";
import {
  AXIS_FONT_PX,
  axisPadEstimate,
  axisPadMeasured,
} from "@/components/charts/scale";

export function useAxisPad(
  labels: string[],
  fontPx = AXIS_FONT_PX,
  min = 46,
): number {
  const estimate = axisPadEstimate(labels, fontPx, min);
  const [measured, setMeasured] = useState(0);
  // Label arrays are rebuilt every render; key the effect on CONTENT via a
  // JSON round-trip (exact for any label text, no sentinel character).
  const key = JSON.stringify(labels);

  useEffect(() => {
    let cancelled = false;
    const measure = () => {
      if (cancelled) return;
      setMeasured(axisPadMeasured(JSON.parse(key) as string[], fontPx));
    };
    measure();
    // The brand face loads async; fallback-font widths under-measure it.
    document.fonts?.ready.then(measure).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [key, fontPx]);

  return Math.max(estimate, measured);
}
