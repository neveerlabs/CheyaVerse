"use client";

import type { ReactNode, PointerEventHandler } from "react";
import type { MouseEventHandler } from "react";
import { useMemo } from "react";
import { Check, Pin } from "lucide-react";
import { TelegramAvatar } from "@/components/TelegramAvatar";
import { LinkPreview } from "@/components/LinkPreview";
import { extractFirstUrl } from "@/lib/link-preview";
import { renderMarkdown } from "@/lib/markdown";

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
  markdown?: boolean;
  linkPreview?: boolean;
  pending?: boolean;
  highlight?: boolean;
  label: string;
  selectMode?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
  onPointerDown?: PointerEventHandler<HTMLDivElement>;
  onPointerMove?: PointerEventHandler<HTMLDivElement>;
  onPointerUp?: PointerEventHandler<HTMLDivElement>;
  onPointerCancel?: PointerEventHandler<HTMLDivElement>;
  onContextMenu?: MouseEventHandler<HTMLDivElement>;
  onDoubleClick?: MouseEventHandler<HTMLDivElement>;
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
  markdown = false,
  linkPreview = false,
  pending = false,
  highlight = false,
  label,
  selectMode = false,
  selected = false,
  onToggleSelect,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onContextMenu,
  onDoubleClick,
}: ChatMessageBubbleProps) {
  const meta = (
    <>
      {edited && <span>diedit</span>}
      {pinned && <Pin size={10} aria-label="Disematkan" />}
      {timestamp}
      {outgoing && status}
    </>
  );

  const markdownHtml = useMemo(() => {
    if (!markdown) return null;
    if (deleted) return null;
    return renderMarkdown(content);
  }, [markdown, deleted, content]);

  const previewUrl = useMemo(() => {
    if (!linkPreview || deleted || richText) return null;
    return extractFirstUrl(content);
  }, [linkPreview, deleted, richText, content]);

  const markdownClass = outgoing
    ? "[&_a]:underline [&_a]:text-white [&_code]:rounded [&_code]:bg-white/15 [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[12.5px] [&_code]:font-mono [&_strong]:font-semibold [&_em]:italic [&_u]:underline [&_s]:line-through"
    : "[&_a]:underline [&_a]:text-ink [&_code]:rounded [&_code]:bg-black/10 [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[12.5px] [&_code]:font-mono [&_strong]:font-semibold [&_em]:italic [&_u]:underline [&_s]:line-through";
  const selectIndicator = (
    <span
      className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
        selected
          ? "border-emerald-500 bg-emerald-500"
          : "border-ink-mute/40 bg-transparent"
      }`}
    >
      {selected && <Check size={16} className="text-white" strokeWidth={3} />}
    </span>
  );

  return (
    <div
      className={`flex w-full min-w-0 items-start gap-2 select-none [-webkit-user-select:none] [-webkit-touch-callout:none] ${
        selectMode ? "justify-start" : outgoing ? "justify-end" : "justify-start"
      }`}
    >
      {selectMode && <span className="flex-shrink-0">{selectIndicator}</span>}
      {!selectMode && !outgoing && (
        <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border border-line bg-[#f0f0f0]">
          <TelegramAvatar src={avatarUrl} />
        </span>
      )}
      {selectMode && outgoing && <span aria-hidden className="flex-1" />}
      <div
        className={`min-w-0 ${outgoing ? "max-w-[82%]" : "max-w-[calc(100%-40px)]"}`}
      >
        <div
          role="group"
          aria-label={label}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
          onContextMenu={onContextMenu}
          onDoubleClick={onDoubleClick}
          onClick={
            selectMode && onToggleSelect
              ? () => onToggleSelect()
              : undefined
          }
          className={`inline-block max-w-full touch-pan-y break-words rounded-2xl px-3.5 py-2 transition-[transform,box-shadow] duration-200 ease-out [overflow-wrap:anywhere] ${
            selectMode ? "cursor-pointer" : "active:scale-[.985]"
          } ${
            outgoing
              ? "bg-ink text-white shadow-[0_1px_2px_rgba(0,0,0,.12)]"
              : "bg-[#f1f3f5] text-ink shadow-[0_1px_1px_rgba(0,0,0,.04)]"
          } ${pending ? "opacity-70" : ""} ${
            highlight
              ? "ring-[3px] ring-amber-400 shadow-[0_0_18px_rgba(251,191,36,.55)] scale-[1.01]"
              : ""
          }`}
        >
          {prefix}
          {previewUrl && (
            <LinkPreview
              url={previewUrl}
              tone={outgoing ? "outgoing" : "incoming"}
            />
          )}
          <span className="relative inline-block w-full align-top">
            {richText ? (
              <div
                className={`chat-rich-text block w-full break-words text-[14px] leading-[1.45] ${
                  outgoing ? "chat-rich-text-outgoing" : "chat-rich-text-incoming"
                } ${deleted ? "italic opacity-65" : ""}`}
                dangerouslySetInnerHTML={{ __html: content }}
              />
            ) : markdownHtml !== null ? (
              <span
                className={`inline whitespace-pre-wrap break-words text-[14px] leading-[1.45] ${markdownClass}`}
                dangerouslySetInnerHTML={{ __html: markdownHtml }}
              />
            ) : (
              <span
                className={`inline whitespace-pre-wrap break-words text-[14px] leading-[1.45] ${deleted ? "italic opacity-65" : ""}`}
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
    </div>
  );
}