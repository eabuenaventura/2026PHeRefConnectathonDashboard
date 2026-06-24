"use client";

import { useEffect, useState } from "react";

function relative(from: number): string {
  const s = Math.max(0, Math.round((Date.now() - from) / 1000));
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return `${h} hr ago`;
}

/** Shows "updated Xs ago", refreshing itself every 15s. */
export default function RelativeTime({ since }: { since: string | null }) {
  const [, force] = useState(0);

  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 15000);
    return () => clearInterval(id);
  }, []);

  if (!since) return null;
  return <>Updated {relative(new Date(since).getTime())}</>;
}
