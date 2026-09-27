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
  highlight?: boolean;
  label: string;
  onPointerDown?: PointerEventHandler<HTMLDivElement>;
  onPointerMove?: PointerEventHandler<HTMLDivElement>;
  onPointerUp?: PointerEventHandler<HTMLDivElement>;
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
  highlight = false,
  label,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onContextMenu,
}: ChatMessageBubbleProps) {
  const meta = (
    <>
      {edited && <span>diedit</span>}
      {pinned && <Pin size={10} aria-label="Disematkan" />}
      {timestamp}
      {outgoing && status}
    </>
  );

  return (
    <div
      className={`flex w-full min-w-0 items-start gap-2 ${outgoing ? "justify-end" : "justify-start"}`}
    >
      {!outgoing && (
        <span className="mt-1 flex h-8 w-8 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border border-line bg-[#f0f0f0]">
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
          onPointerCancel={onPointerCancel}
          onContextMenu={onContextMenu}
          className={`inline-block max-w-full touch-pan-y break-words rounded-2xl px-2.5 py-[5px] shadow-[0_1px_2px_rgba(0,0,0,.06)] transition-[transform,box-shadow] duration-300 ease-out active:scale-[.99] [overflow-wrap:anywhere] ${
            outgoing
              ? "rounded-tr-md bg-ink text-white"
              : "rounded-tl-md bg-[#f2f2f2] text-ink"
          } ${pending ? "opacity-70" : ""} ${
            highlight
              ? "ring-[3px] ring-amber-400 shadow-[0_0_18px_rgba(251,191,36,.55)] scale-[1.01]"
              : ""
          }`}
        >
          {prefix}
          <span className="relative inline-block w-full align-top">
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
              <span
                className={`inline whitespace-pre-wrap break-words text-[13.5px] leading-[1.4] ${deleted ? "italic opacity-65" : ""}`}
              >
                {content}
              </span>
            )}
            <span
              aria-hidden
              className={`invisible ml-2 inline-flex items-center gap-1 whitespace-nowrap align-bottom text-[10px] ${
                outgoing ? "text-white/70" : "text-ink-mute"
              }`}
            >
              {meta}
            </span>
            <span
              className={`absolute bottom-0 right-0 inline-flex items-center gap-1 whitespace-nowrap text-[10px] ${
                outgoing ? "text-white/70" : "text-ink-mute"
              }`}
            >
              {meta}
            </span>
          </span>
        </div>
      </div>
      {outgoing && (
        <span className="mt-1 flex h-8 w-8 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border border-line bg-[#f0f0f0]">
          <TelegramAvatar src={avatarUrl} />
        </span>
      )}
    </div>
  );
}