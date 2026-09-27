"use client";

import type { ReactNode } from "react";

export function MessageActionSheet({
  preview,
  onClose,
  children,
}: {
  preview: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div
      role="presentation"
      onClick={onClose}
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/25 px-4 pb-[calc(16px+env(safe-area-inset-bottom))]"
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Aksi pesan"
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-[560px] animate-fade-up overflow-hidden rounded-2xl border border-line bg-white pb-1 shadow-2xl [&_button:hover]:!bg-transparent [&_button:active]:!bg-transparent"
      >
        <div className="border-b border-line px-4 py-3">
          <p className="line-clamp-2 whitespace-pre-wrap break-words text-[12.5px] text-ink-soft">
            {preview}
          </p>
        </div>
        {children}
      </section>
    </div>
  );
}
