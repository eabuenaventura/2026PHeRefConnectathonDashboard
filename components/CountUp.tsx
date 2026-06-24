"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Animated number that counts up to `value` on mount / when value changes.
 * `decimals` controls formatting; `unit` is appended (e.g. "%").
 */
export default function CountUp({
  value,
  decimals = 0,
  unit,
  duration = 700,
}: {
  value: number;
  decimals?: number;
  unit?: string;
  duration?: number;
}) {
  const [display, setDisplay] = useState(0);
  const fromRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const from = fromRef.current;
    const start = performance.now();
    const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

    function tick(now: number) {
      const t = Math.min(1, (now - start) / duration);
      const v = from + (value - from) * easeOut(t);
      setDisplay(v);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = value;
      }
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [value, duration]);

  const formatted = display.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  return (
    <span>
      {formatted}
      {unit ? <span className="unit">{unit}</span> : null}
    </span>
  );
}
