"use client";

import type { ReactNode, PointerEventHandler } from "react";
import type { MouseEventHandler } from "react";
import { Pin } from "lucide-react";
import { TelegramAvatar } from "@/components/TelegramAvatar";

export function chatMessageTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

type ChatMessageBubbleProps = {
  outgoing: boolean;
  avatarUrl: string | null;
  content: string;
  timestamp: string;
  status?: ReactNode;
  prefix?: ReactNode;
  edited?: boolean;
  pinned?: boolean;
  deleted?: boolean;
  richText?: boolean;
  pending?: boolean;
  label: string;
  onPointerDown?: PointerEventHandler<HTMLDivElement>;
  onPointerMove?: PointerEventHandler<HTMLDivElement>;
  onPointerUp?: PointerEventHandler<HTMLDivElement>;
  onPointerLeave?: PointerEventHandler<HTMLDivElement>;
  onPointerCancel?: PointerEventHandler<HTMLDivElement>;
  onContextMenu?: MouseEventHandler<HTMLDivElement>;
};

export function ChatMessageBubble({
  outgoing,
  avatarUrl,
  content,
  timestamp,
  status,
  prefix,
  edited = false,
  pinned = false,
  deleted = false,
  richText = false,
  pending = false,
  label,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerLeave,
  onPointerCancel,
  onContextMenu,
}: ChatMessageBubbleProps) {
  return (
    <div
      className={`flex w-full min-w-0 items-end gap-2 ${outgoing ? "justify-end" : "justify-start"}`}
    >
      {!outgoing && (
        <span className="mb-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border border-line bg-[#f0f0f0]">
          <TelegramAvatar src={avatarUrl} />
        </span>
      )}
      <div className="min-w-0 max-w-[calc(100%-40px)]">
        <div
          role="group"
          aria-label={label}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerLeave}
          onPointerCancel={onPointerCancel}
          onContextMenu={onContextMenu}
          className={`inline-block max-w-full touch-pan-y break-words rounded-2xl px-2.5 py-[5px] shadow-[0_1px_2px_rgba(0,0,0,.06)] transition-transform duration-150 active:scale-[.99] [overflow-wrap:anywhere] ${
            outgoing
              ? "rounded-tr-md bg-ink text-white"
              : "rounded-tl-md bg-[#f2f2f2] text-ink"
          } ${pending ? "opacity-70" : ""}`}
        >
          {prefix}
          {richText ? (
            <span
              className={`inline whitespace-pre-wrap break-words text-[13.5px] leading-[1.4] ${
                deleted
                  ? "italic opacity-65"
                  : outgoing
                    ? "[&_b]:font-semibold [&_i]:italic [&_a]:underline"
                    : "text-ink-soft [&_b]:font-semibold [&_b]:text-ink [&_i]:italic [&_a]:text-ink [&_a]:underline"
              }`}
              dangerouslySetInnerHTML={{ __html: content }}
            />
          ) : (
            <span className={`inline whitespace-pre-wrap break-words text-[13.5px] leading-[1.4] ${deleted ? "italic opacity-65" : ""}`}>
              {content}
            </span>
          )}
          <span
            className={`ml-1 inline-flex items-center gap-1 whitespace-nowrap align-bottom text-[10px] ${
              outgoing ? "text-white/70" : "text-ink-mute"
            }`}
          >
            {edited && <span>diedit</span>}
            {pinned && <Pin size={10} aria-label="Disematkan" />}
            {timestamp}
            {outgoing && status}
          </span>
        </div>
      </div>
      {outgoing && (
        <span className="mb-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border border-line bg-[#f0f0f0]">
          <TelegramAvatar src={avatarUrl} />
        </span>
      )}
    </div>
  );
}
