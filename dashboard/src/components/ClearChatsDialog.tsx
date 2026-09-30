"use client";

import { useEffect, useState } from "react";
import { Trash2, X } from "lucide-react";

type Props = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  allowEveryone: boolean;
  busy?: boolean;
  onClose: () => void;
  onConfirm: (forEveryone: boolean) => void;
};

export function ClearChatsDialog({
  open,
  title,
  description,
  confirmLabel,
  allowEveryone,
  busy = false,
  onClose,
  onConfirm,
}: Props) {
  const [forEveryone, setForEveryone] = useState(false);

  useEffect(() => {
    if (open) setForEveryone(false);
  }, [open]);

  useEffect(() => {
    if (!allowEveryone) setForEveryone(false);
  }, [allowEveryone]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [busy, onClose, open]);

  if (!open) return null;

  return (
    <div
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
      className="fixed inset-0 z-[110] flex items-end justify-center bg-black/35 p-3 backdrop-blur-sm sm:items-center"
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="clear-chats-title"
        className="w-full max-w-[420px] rounded-[24px] border border-black/[.06] bg-white p-5 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-red-50 text-danger">
            <Trash2 size={19} />
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#f4f5f6] text-ink-soft disabled:opacity-50"
          >
            <X size={17} />
          </button>
        </div>
        <h2 id="clear-chats-title" className="mt-4 text-[17px] font-semibold text-ink">
          {title}
        </h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-ink-mute">
          {description}
        </p>
        <label
          className={`mt-5 flex items-start gap-3 rounded-2xl border border-line p-3.5 ${
            allowEveryone ? "cursor-pointer" : "cursor-not-allowed opacity-50"
          }`}
        >
          <input
            type="checkbox"
            checked={forEveryone}
            disabled={!allowEveryone || busy}
            onChange={(event) => setForEveryone(event.target.checked)}
            className="mt-0.5 h-4 w-4 accent-ink"
          />
          <span className="min-w-0">
            <span className="block text-[13px] font-semibold text-ink">
              Clear for everyone
            </span>
            <span className="mt-0.5 block text-[11px] leading-relaxed text-ink-mute">
              {allowEveryone
                ? "Leave this unchecked to clear chats only for you."
                : "Only messages you sent can be cleared for everyone."}
            </span>
          </span>
        </label>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="min-h-11 rounded-xl bg-[#f2f3f5] px-4 text-[13px] font-semibold text-ink-soft disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm(forEveryone && allowEveryone)}
            disabled={busy}
            className="min-h-11 rounded-xl bg-ink px-4 text-[13px] font-semibold text-white disabled:opacity-50"
          >
            {busy ? "Clearing…" : confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
