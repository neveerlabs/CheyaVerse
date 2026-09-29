"use client";

import { useEffect, useState } from "react";

export function TelegramAvatar({
  src,
  alt = "",
  className = "h-full w-full object-cover",
}: {
  src: string | null | undefined;
  alt?: string;
  className?: string;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const imageSrc = src || "";
  const showFallback = !imageSrc || failedSrc === imageSrc;

  useEffect(() => {
    setFailedSrc(null);
  }, [imageSrc]);

  if (showFallback) {
    return (
      <svg
        aria-hidden="true"
        className={className}
        viewBox="0 0 100 100"
        fill="currentColor"
        xmlns="http://www.w3.org/2000/svg"
      >
        <circle cx="50" cy="33" r="19" />
        <path d="M40 49h20v8c18 3 29 16 32 34 1 5-2 9-7 9H15c-5 0-8-4-7-9 3-18 14-31 32-34v-8Z" />
      </svg>
    );
  }

  return (
    <img
      src={imageSrc}
      alt={alt}
      draggable={false}
      className={className}
      onError={() => setFailedSrc(imageSrc)}
    />
  );
}
