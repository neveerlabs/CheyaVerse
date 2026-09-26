"use client";

import { useEffect, useState } from "react";
import { UserRound } from "lucide-react";

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
    return <UserRound aria-hidden="true" className="h-1/2 w-1/2 text-ink-mute" />;
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
