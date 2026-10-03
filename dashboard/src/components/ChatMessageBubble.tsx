"use client";

import type { ReactNode, PointerEventHandler } from "react";
import type { MouseEventHandler } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Pin, X } from "lucide-react";
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
  avatarFallbackUrl?: string | null;
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
  editing?: boolean;
  editValue?: string;
  editSaving?: boolean;
  onEditChange?: (value: string) => void;
  onEditSave?: () => void;
  onEditCancel?: () => void;
};

export function ChatMessageBubble({
  outgoing,
  avatarUrl,
  avatarFallbackUrl,
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
  editing = false,
  editValue = "",
  editSaving = false,
  onEditChange,
  onEditSave,
  onEditCancel,
}: ChatMessageBubbleProps) {
  const messageContentRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const canExpand = !deleted && content.length > 1000;

  useEffect(() => {
    setExpanded(false);
  }, [content]);

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

  const richTextHtml = useMemo(() => {
    if (!richText || deleted) return content;
    return content.replace(
      /<pre><code(?:\s+class=["']language-([A-Za-z0-9_+-]+)["'])?>([\s\S]*?)<\/code><\/pre>/gi,
      (_match, language: string | undefined, code: string) => {
        const label = language
          ? `<span class="chat-code-language">${language}</span>`
          : "<span></span>";
        return `<div class="chat-code-block"><div class="chat-code-header">${label}<button type="button" class="chat-code-copy" aria-label="Salin kode" title="Salin kode" data-code-copy><svg aria-hidden="true" viewBox="0 0 24 24" fill="none"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg><svg class="chat-code-check" aria-hidden="true" viewBox="0 0 24 24" fill="none"><path d="m5 12 4 4L19 6"/></svg></button></div><pre class="my-0 block overflow-x-auto font-mono text-[12.5px] leading-[1.5]"><code>${code}</code></pre></div>`;
      },
    );
  }, [richText, deleted, content]);

  const hasCodeBlock =
    !deleted && (content.includes("```") || /<pre\b/i.test(content));
  const stacksMessageMeta = hasCodeBlock || Boolean(prefix);

  const previewUrl = useMemo(() => {
    if (!linkPreview || deleted || richText) return null;
    return extractFirstUrl(content);
  }, [linkPreview, deleted, richText, content]);

  const markdownClass = outgoing
    ? "[&_a]:underline [&_a]:text-white [&_code]:rounded [&_code]:bg-white/15 [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[12.5px] [&_code]:font-mono [&_strong]:font-semibold [&_em]:italic [&_u]:underline [&_s]:line-through"
    : "[&_a]:underline [&_a]:text-ink [&_code]:rounded [&_code]:bg-black/10 [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[12.5px] [&_code]:font-mono [&_strong]:font-semibold [&_em]:italic [&_u]:underline [&_s]:line-through";

  const messageBody = (
    <div className="min-w-0 flex-1">
      {prefix}
      {previewUrl && (
        <LinkPreview
          url={previewUrl}
          tone={outgoing ? "outgoing" : "incoming"}
        />
      )}
      <div
        ref={messageContentRef}
        className={`relative block min-w-0 ${
          canExpand && !expanded ? "max-h-[20.3em] overflow-hidden" : ""
        }`}
      >
        {richText ? (
          <div
            className={`chat-rich-text block min-w-0 break-words text-[12.5px] leading-[1.35] md:text-[14px] md:leading-[1.45] ${
              outgoing ? "chat-rich-text-outgoing" : "chat-rich-text-incoming"
            } ${deleted ? "italic opacity-65" : ""}`}
            dangerouslySetInnerHTML={{ __html: richTextHtml }}
          />
        ) : markdownHtml !== null ? (
          <div
            className={`chat-rich-text ${
              outgoing
                ? "chat-rich-text-outgoing"
                : "chat-rich-text-incoming"
            } whitespace-pre-wrap break-words text-[12.5px] leading-[1.35] md:text-[14px] md:leading-[1.45] ${markdownClass}`}
            dangerouslySetInnerHTML={{ __html: markdownHtml }}
          />
        ) : (
          <span
            className={`whitespace-pre-wrap break-words text-[12.5px] leading-[1.35] md:text-[14px] md:leading-[1.45] ${deleted ? "italic opacity-65" : ""}`}
          >
            {content}
          </span>
        )}
      </div>
      {canExpand && !expanded && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            setExpanded(true);
          }}
          className={`mt-1 text-[12px] font-semibold underline underline-offset-2 ${
            outgoing ? "text-white/80" : "text-ink-soft"
          }`}
        >
          See more...
        </button>
      )}
    </div>
  );

  const messageMeta = (
    <div
      className={`flex shrink-0 items-center gap-1 whitespace-nowrap text-[10px] leading-none ${
        outgoing ? "text-white/70" : "text-ink-mute"
      }`}
    >
      {meta}
    </div>
  );

  useEffect(() => {
    const container = messageContentRef.current;
    if (!container || (!markdown && !richText) || deleted) return;

    const timers = new Set<number>();
    const handleCopy = async (event: Event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const button = target.closest<HTMLButtonElement>("[data-code-copy]");
      if (!button || !container.contains(button)) return;
      event.preventDefault();
      event.stopPropagation();
      const code =
        button.parentElement?.parentElement?.querySelector("pre code") ??
        button.parentElement?.querySelector("pre code");
      if (!code) return;

      try {
        await navigator.clipboard.writeText(code.textContent ?? "");
        button.dataset.copied = "true";
        button.setAttribute("aria-label", "Kode disalin");
        button.title = "Kode disalin";
        const timer = window.setTimeout(() => {
          button.dataset.copied = "false";
          button.setAttribute("aria-label", "Salin kode");
          button.title = "Salin kode";
          timers.delete(timer);
        }, 1500);
        timers.add(timer);
      } catch {
        button.setAttribute("aria-label", "Tidak dapat menyalin kode");
        button.title = "Tidak dapat menyalin kode";
        const timer = window.setTimeout(() => {
          button.setAttribute("aria-label", "Salin kode");
          button.title = "Salin kode";
          timers.delete(timer);
        }, 1800);
        timers.add(timer);
      }
    };

    container.addEventListener("click", handleCopy);
    return () => {
      container.removeEventListener("click", handleCopy);
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [markdown, richText, deleted, markdownHtml, richTextHtml]);

  const selectIndicator = (
    <span
      className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
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
      onClick={(event) => {
        if (!selectMode || !onToggleSelect) return;
        const target = event.target;
        if (target instanceof Element) {
          const link = target.closest("a");
          if (link) event.preventDefault();
        }
        onToggleSelect();
      }}
    >
      {selectMode && <span className="flex-shrink-0">{selectIndicator}</span>}
      {!selectMode && !outgoing && avatarUrl && (
        <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border border-line bg-[#f0f0f0]">
          <TelegramAvatar src={avatarUrl} fallbackSrc={avatarFallbackUrl} />
        </span>
      )}
      {selectMode && outgoing && <span aria-hidden className="flex-1" />}
      <div
        className={`w-fit min-w-0 ${
          outgoing || !avatarUrl ? "max-w-[94%] md:max-w-[92%]" : "max-w-[calc(100%-40px)]"
        }`}
      >
        <div
          role="group"
          aria-label={label}
          onPointerDown={editing ? undefined : onPointerDown}
          onPointerMove={editing ? undefined : onPointerMove}
          onPointerUp={editing ? undefined : onPointerUp}
          onPointerCancel={editing ? undefined : onPointerCancel}
          onContextMenu={editing ? undefined : onContextMenu}
          onDoubleClick={editing ? undefined : onDoubleClick}
          className={`${stacksMessageMeta ? "flex" : "inline-flex"} w-fit min-w-[68px] max-w-full touch-pan-y break-words transition-[transform,box-shadow] duration-200 ease-out [overflow-wrap:anywhere] ${
            selectMode ? "cursor-pointer" : "active:scale-[.985]"
          } ${
            outgoing
                ? `${stacksMessageMeta ? "flex-col" : "items-end gap-2"} rounded-[16px] rounded-br-[5px] border border-white/[.07] bg-ink px-2.5 py-1 md:rounded-[18px] md:rounded-br-[6px] md:px-3.5 md:py-1.5 text-white shadow-[0_2px_6px_rgba(0,0,0,.09)]`
                : `${stacksMessageMeta ? "flex-col" : "items-end gap-2"} rounded-[16px] rounded-bl-[5px] border border-black/[.025] bg-[#f1f2f4] px-2.5 py-1 md:rounded-[18px] md:rounded-bl-[6px] md:px-3.5 md:py-1.5 text-ink shadow-[0_2px_6px_rgba(0,0,0,.04)]`
          } ${pending ? "opacity-70" : ""} ${
            highlight
              ? "ring-2 ring-ink/20 shadow-[0_2px_10px_rgba(15,23,42,.12)]"
              : ""
          }`}
        >
          {editing ? (
            <div className="w-full min-w-[220px] space-y-2">
              <textarea
                autoFocus
                aria-label="Edit message"
                value={editValue}
                onChange={(event) => onEditChange?.(event.target.value)}
                onPointerDown={(event) => event.stopPropagation()}
                rows={Math.min(6, Math.max(2, editValue.split("\n").length))}
                className="w-full resize-y rounded-xl border border-slate-300 bg-white p-2.5 text-[13px] leading-relaxed text-ink outline-none focus:border-slate-500"
                maxLength={4000}
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onEditCancel?.();
                  }}
                  disabled={editSaving}
                  className="inline-flex h-8 items-center gap-1.5 rounded-full border border-white/40 px-3 text-[11px] font-semibold text-white disabled:opacity-50"
                >
                  <X size={13} /> Cancel
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onEditSave?.();
                  }}
                  disabled={editSaving || !editValue.trim()}
                  className="inline-flex h-8 items-center gap-1.5 rounded-full bg-white px-3 text-[11px] font-semibold text-ink disabled:opacity-50"
                >
                  {editSaving ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          ) : stacksMessageMeta ? (
            <div className="flex min-w-0 flex-1 flex-col">
              {messageBody}
              <div className="flex justify-end">{messageMeta}</div>
            </div>
          ) : (
            <>
              {messageBody}
              {messageMeta}
            </>
          )}
        </div>
      </div>
    </div>
  );
}