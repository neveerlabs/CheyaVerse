// src/components/VerifiedName.tsx
"use client";

export function VerifiedName({
  name,
  size = "lg",
  compactBadge = false,
  className,
  nameClassName,
  wrap = false,
}: {
  name: string;
  size?: "sm" | "lg";
  compactBadge?: boolean;
  className?: string;
  nameClassName?: string;
  wrap?: boolean;
}) {
  const imgSize = compactBadge
    ? size === "lg"
      ? "h-[18px] w-[18px]"
      : "h-[16px] w-[16px]"
    : size === "lg"
      ? "w-[26px] h-[26px]"
      : "w-[22px] h-[22px]";
  const textSize = size === "lg" ? "text-[15px]" : "text-[13.5px]";

  return (
    <span className={`inline-flex items-center gap-0.5 min-w-0 ${className ?? ""}`}>
      <span
        className={`${textSize} font-semibold text-ink leading-tight min-w-0 ${
          wrap ? "whitespace-normal break-words" : "truncate"
        } ${nameClassName ?? ""}`}
      >
        {name}
      </span>
      <svg
        aria-label="Akun terverifikasi"
        role="img"
        viewBox="0 0 24 24"
        className={`${imgSize} flex-shrink-0 -my-1`}
      >
        <path
          fill="#45b7e8"
          d="M12 1.8 14.7 3l3-.1 1.3 2.7 2.5 1.7-.5 3 1.1 2.8-2.1 2.2-.7 3-3 .7-2.2 2.1-2.8-1.1-3 .5-1.7-2.5-2.7-1.3.1-3L3 12l1.2-2.7-.1-3 2.7-1.3 1.7-2.5 3 .5L12 1.8Z"
        />
        <path
          fill="none"
          stroke="white"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          d="m8.3 12.1 2.4 2.4 5-5"
        />
      </svg>
    </span>
  );
}