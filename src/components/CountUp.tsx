"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  value: number;
  /** Rendered before/after the number, e.g. a currency symbol. */
  prefix?: string;
  suffix?: string;
  decimals?: number;
  durationMs?: number;
}

/** Ease-out so the number decelerates into its final value. */
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * Counts up to `value` on mount. Values only animate the first time they are
 * seen; later prop changes snap, so a background refresh never re-runs the
 * whole dashboard.
 */
export function CountUp({ value, prefix = "", suffix = "", decimals = 0, durationMs = 900 }: Props) {
  const [display, setDisplay] = useState(0);
  const animated = useRef(false);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Only the first sighting animates; later refreshes and reduced-motion snap.
    const instant = animated.current || reduced || value === 0;
    animated.current = true;

    let raf = 0;

    if (instant) {
      // Still deferred a frame so nothing sets state from the effect body.
      raf = requestAnimationFrame(() => setDisplay(value));
      return () => cancelAnimationFrame(raf);
    }

    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / durationMs);
      setDisplay(value * easeOut(progress));
      if (progress < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, durationMs]);

  const shown = display.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  return (
    <span className="numeral">
      {prefix}
      {shown}
      {suffix}
    </span>
  );
}
