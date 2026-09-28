"use client";

import type { RealtimeClientState } from "@/lib/realtime-client";

const LABELS: Record<string, string> = {
  connecting: "Menghubungkan",
  reconnecting: "Menghubungkan ulang",
  disconnected: "Terputus",
  idle: "Menghubungkan",
};

export function ConnectionBadge({
  state,
  className = "",
}: {
  state: RealtimeClientState;
  className?: string;
}) {
  if (state.state === "connected") return null;
  const label = LABELS[state.state] ?? "Menghubungkan";

  return (
    <span
      role="status"
      aria-live="polite"
      className={`inline-flex items-center gap-1.5 text-[11px] font-medium text-amber-600 ${className}`}
    >
      <span className="relative flex h-1.5 w-1.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-amber-500" />
      </span>
      {label}
    </span>
  );
}