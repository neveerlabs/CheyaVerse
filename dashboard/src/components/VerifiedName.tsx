// src/components/VerifiedName.tsx
"use client";

import { useEffect, useState } from "react";

let cachedReady: boolean = false;
let inflight: Promise<void> | null = null;

function loadCheckmark(): Promise<void> {
  if (cachedReady) return Promise.resolve();
  if (inflight) return inflight;
  if (typeof window === "undefined") {
    inflight = Promise.resolve();
    return inflight;
  }
  inflight = new Promise<void>((resolve) => {
    const img = new Image();
    const done = () => {
      cachedReady = true;
      resolve();
    };
    img.onload = done;
    img.onerror = done;
    img.src = "/assets/centang.png";
  });
  return inflight;
}

export function VerifiedName({
  name,
  size = "lg",
  className,
  nameClassName,
}: {
  name: string;
  size?: "sm" | "lg";
  className?: string;
  nameClassName?: string;
}) {
  const [ready, setReady] = useState<boolean>(cachedReady);

  useEffect(() => {
    if (ready) return;
    let cancelled = false;
    loadCheckmark().then(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [ready]);

  const imgSize = size === "lg" ? "w-[26px] h-[26px]" : "w-[22px] h-[22px]";
  const textSize = size === "lg" ? "text-[15px]" : "text-[13.5px]";

  return (
    <span
      className={`inline-flex items-center gap-0.5 min-w-0 ${className ?? ""}`}
      style={{ visibility: ready ? "visible" : "hidden" }}
    >
      <span
        className={`${textSize} font-semibold text-ink leading-tight truncate min-w-0 ${nameClassName ?? ""}`}
      >
        {name}
      </span>
      <img
        src="/assets/centang.png"
        alt=""
        draggable={false}
        className={`${imgSize} object-contain flex-shrink-0 -my-1`}
      />
    </span>
  );
}