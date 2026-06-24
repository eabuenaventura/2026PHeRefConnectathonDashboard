"use client";

export default function RefreshButton({
  onClick,
  busy,
}: {
  onClick: () => void;
  busy: boolean;
}) {
  return (
    <button
      type="button"
      className="btn"
      onClick={onClick}
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
