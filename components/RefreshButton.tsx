"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export default function RefreshButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [spinning, setSpinning] = useState(false);

  function refresh() {
    setSpinning(true);
    startTransition(() => {
      // Re-runs the server component and re-fetches from the FHIR server.
      router.refresh();
    });
    // Clear the spin shortly after the transition settles.
    window.setTimeout(() => setSpinning(false), 600);
  }

  const busy = isPending || spinning;

  return (
    <button
      type="button"
      className="refresh-btn"
      onClick={refresh}
      disabled={busy}
      aria-label="Refresh data"
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={busy ? "spin" : ""}
      >
        <path d="M21 12a9 9 0 1 1-2.64-6.36" />
        <path d="M21 3v6h-6" />
      </svg>
      {busy ? "Refreshing…" : "Refresh"}
    </button>
  );
}
