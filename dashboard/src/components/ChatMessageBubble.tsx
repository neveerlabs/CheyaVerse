"use client";

import type { PointerEventHandler, ReactNode } from "react";
import type { MouseEventHandler } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Pin, X } from "lucide-react";
import { AiSourceLinks } from "@/components/AiSourceLinks";
import { TelegramAvatar } from "@/components/TelegramAvatar";
import { LinkPreview } from "@/components/LinkPreview";
import {
  extractFirstUrl,
  stripSourceLinks,
} from "@/lib/link-preview";
import { highlightCode, renderMarkdown } from "@/lib/markdown";

const MESSAGE_PREVIEW_LIMIT = 1000;

function messagePreview(content: string, markdown: boolean): string {
  let preview = content.slice(0, MESSAGE_PREVIEW_LIMIT).trimEnd();
  if (markdown) {
    const fences = preview.match(/```/g)?.length ?? 0;
    if (fences % 2 === 1) {
      preview = preview.slice(0, preview.lastIndexOf("```")).trimEnd();
    }
  }
  return preview;
}

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
  tokenUsage?: {
    inputTokens?: number | null;
    outputTokens?: number | null;
  };
  showTokenUsage?: boolean;
  compact?: boolean;
  edited?: boolean;
  pinned?: boolean;
  deleted?: boolean;
  richText?: boolean;
  markdown?: boolean;
  linkPreview?: boolean;
  aiSourceLinks?: boolean;
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
  onLostPointerCapture?: PointerEventHandler<HTMLDivElement>;
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
  tokenUsage,
  showTokenUsage = false,
  compact = false,
  edited = false,
  pinned = false,
  deleted = false,
  richText = false,
  markdown = false,
  linkPreview = false,
  aiSourceLinks = false,
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
  onLostPointerCapture,
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
  const messageTextRef = useRef<HTMLElement | null>(null);
  const setMessageTextElement = (element: HTMLElement | null) => {
    messageTextRef.current = element;
  };
  const [expanded, setExpanded] = useState(false);
  const [messageHasMultipleLines, setMessageHasMultipleLines] = useState(false);
  const canExpand = !deleted && content.length > MESSAGE_PREVIEW_LIMIT;
  const displayContent = canExpand && !expanded
    ? messagePreview(content, markdown)
    : content;
  const renderedContent = aiSourceLinks
    ? stripSourceLinks(displayContent)
    : displayContent;

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
    return renderMarkdown(renderedContent);
  }, [markdown, deleted, renderedContent]);

  const richTextHtml = useMemo(() => {
    if (!richText || deleted) return content;
    return displayContent.replace(
      /<pre><code(?:\s+class=["']language-([A-Za-z0-9_+-]+)["'])?>([\s\S]*?)<\/code><\/pre>/gi,
      (_match, language: string | undefined, code: string) => {
        const safeLanguage = language ?? "";
        const header = `<div class="chat-code-header"><span class="chat-code-dots" aria-hidden="true"><i></i><i></i><i></i></span><span class="chat-code-language">${safeLanguage}</span></div>`;
        return `<div class="chat-code-block">${header}<pre class="my-0 block overflow-x-auto font-mono text-[12.5px] leading-[1.5]"><code>${highlightCode(code, safeLanguage)}</code></pre></div>`;
      },
    );
  }, [richText, deleted, displayContent, content]);

  const previewUrl = useMemo(() => {
    if (!linkPreview || deleted || richText) return null;
    return extractFirstUrl(content);
  }, [linkPreview, deleted, richText, content]);

  const markdownClass = outgoing
    ? "[&_a]:underline [&_a]:text-white [&_code]:rounded [&_code]:bg-white/15 [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[12.5px] [&_code]:font-mono [&_strong]:font-semibold [&_em]:italic [&_u]:underline [&_s]:line-through"
    : "[&_a]:underline [&_a]:text-ink [&_code]:rounded [&_code]:bg-black/10 [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[12.5px] [&_code]:font-mono [&_strong]:font-semibold [&_em]:italic [&_u]:underline [&_s]:line-through";
  const richTextHasCodeBlock = richTextHtml?.includes('class="chat-code-block"') ?? false;

  useEffect(() => {
    const textElement = messageTextRef.current;
    const container = messageContentRef.current;
    if (!textElement || !container || richTextHasCodeBlock) {
      setMessageHasMultipleLines(richTextHasCodeBlock);
      return;
    }

    const measureLines = () => {
      const range = document.createRange();
      range.selectNodeContents(textElement);
      const lineTops = new Set(
        Array.from(range.getClientRects())
          .filter((rect) => rect.width > 0 && rect.height > 0)
          .map((rect) => Math.round(rect.top)),
      );
      setMessageHasMultipleLines(lineTops.size > 1);
    };

    measureLines();
    const observer = new ResizeObserver(measureLines);
    observer.observe(container);
    window.addEventListener("resize", measureLines);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measureLines);
    };
  }, [displayContent, markdownHtml, richTextHtml, richTextHasCodeBlock]);

  const hasReplyPrefix = Boolean(prefix);
  const totalTokens =
    (tokenUsage?.inputTokens ?? 0) + (tokenUsage?.outputTokens ?? 0);
  const inputPercent =
    totalTokens > 0
      ? Math.round(((tokenUsage?.inputTokens ?? 0) / totalTokens) * 100)
      : null;
  const outputPercent =
    totalTokens > 0
      ? 100 - (inputPercent ?? 0)
      : null;
  const messageTextSize = compact
    ? "text-[12px] leading-[1.32]"
    : "text-[12.5px] leading-[1.35] md:text-[14px] md:leading-[1.45]";
  const messageMeta = (
    <span
      className={`${hasReplyPrefix || compact ? "" : "ml-1"} inline-flex shrink-0 items-center gap-1 whitespace-nowrap ${
        compact ? "text-[9px]" : "text-[10px]"
      } leading-none ${
        outgoing ? "text-white/70" : "text-ink-mute"
      }`}
    >
      {meta}
    </span>
  );
  const inlineReplyMeta =
    hasReplyPrefix && !messageHasMultipleLines && !richTextHasCodeBlock;

  const messageBody = (
    <div className="min-w-0">
      {prefix}
      {previewUrl && (
        <LinkPreview
          url={previewUrl}
          tone={outgoing ? "outgoing" : "incoming"}
        />
      )}
      <div
        ref={messageContentRef}
        className={`relative min-w-0 ${
          inlineReplyMeta ? "flex items-end justify-between gap-2" : ""
        }`}
      >
        {richText ? (
          richTextHasCodeBlock ? (
            <div
              ref={setMessageTextElement}
              className={`chat-rich-text block min-w-0 break-words ${messageTextSize} ${
                outgoing ? "chat-rich-text-outgoing" : "chat-rich-text-incoming"
              } ${deleted ? "italic opacity-65" : ""}`}
              dangerouslySetInnerHTML={{ __html: richTextHtml }}
            />
          ) : (
            <span
              ref={setMessageTextElement}
              className={`chat-rich-text align-baseline ${messageTextSize} ${
                inlineReplyMeta ? "min-w-0 flex-1" : ""
              } ${
                outgoing ? "chat-rich-text-outgoing" : "chat-rich-text-incoming"
              } ${deleted ? "italic opacity-65" : ""}`}
              dangerouslySetInnerHTML={{ __html: richTextHtml }}
            />
          )
        ) : markdownHtml !== null ? (
          <span
            ref={setMessageTextElement}
            className={`chat-rich-text align-baseline ${
              inlineReplyMeta ? "min-w-0 flex-1" : ""
            } ${
              outgoing
                ? "chat-rich-text-outgoing"
                : "chat-rich-text-incoming"
            } whitespace-pre-wrap break-words ${messageTextSize} ${markdownClass}`}
            dangerouslySetInnerHTML={{ __html: markdownHtml }}
          />
        ) : (
          <span
            ref={setMessageTextElement}
            className={`whitespace-pre-wrap break-words ${messageTextSize} ${
              inlineReplyMeta ? "min-w-0 flex-1" : ""
            } ${deleted ? "italic opacity-65" : ""}`}
          >
            {renderedContent}
          </span>
        )}
        {!compact && ((!hasReplyPrefix &&
          !messageHasMultipleLines &&
          !richTextHasCodeBlock) ||
          inlineReplyMeta) &&
          messageMeta}
        {canExpand && !expanded && (
          <>
            {" "}
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                setExpanded(true);
              }}
              className="inline appearance-none border-0 bg-transparent p-0 align-baseline font-[inherit] text-[inherit]"
              style={{ font: "inherit", color: "inherit" }}
            >
              See more...
            </button>
          </>
        )}
      </div>
      {aiSourceLinks && !deleted && <AiSourceLinks content={content} />}
      {(compact ||
        (hasReplyPrefix && !inlineReplyMeta) ||
        messageHasMultipleLines ||
        richTextHasCodeBlock) && (
        <div className={`flex justify-end ${compact ? "mt-0.5" : ""}`}>
          {messageMeta}
        </div>
      )}
      {showTokenUsage && tokenUsage && (
        <p
          className={`text-right leading-tight text-ink-mute ${
            compact ? "mt-0.5 text-[8px]" : "mt-1 text-[9px]"
          }`}
          title="Persentase menunjukkan bagian input dan output dari total token pada respons ini."
        >
          {totalTokens > 0 ? (
            <>
              Token: input {tokenUsage.inputTokens ?? "—"}
              {inputPercent !== null ? ` (${inputPercent}%)` : ""} · output{" "}
              {tokenUsage.outputTokens ?? "—"}
              {outputPercent !== null ? ` (${outputPercent}%)` : ""}
            </>
          ) : (
            "Token usage unavailable"
          )}
        </p>
      )}
    </div>
  );

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
          compact
            ? outgoing || !avatarUrl
              ? "max-w-[90%]"
              : "max-w-[calc(100%-36px)]"
            : outgoing || !avatarUrl
              ? "max-w-[94%] md:max-w-[92%]"
              : "max-w-[calc(100%-40px)]"
        }`}
      >
        <div
          role="group"
          aria-label={label}
          onPointerDown={editing ? undefined : (event) => {
            const target = event.target;
            if (target instanceof Element && target.closest(".chat-code-block pre")) {
              onPointerCancel?.(event);
              return;
            }
            onPointerDown?.(event);
          }}
          onPointerMove={editing ? undefined : (event) => {
            const target = event.target;
            if (target instanceof Element && target.closest(".chat-code-block pre")) {
              onPointerCancel?.(event);
              return;
            }
            onPointerMove?.(event);
          }}
          onPointerUp={editing ? undefined : onPointerUp}
          onPointerCancel={editing ? undefined : onPointerCancel}
          onLostPointerCapture={editing ? undefined : onLostPointerCapture}
          onContextMenu={editing ? undefined : onContextMenu}
          onDoubleClick={editing ? undefined : onDoubleClick}
          className={`flex w-fit min-w-[68px] max-w-full flex-col break-words transition-[transform,box-shadow] duration-200 ease-out [overflow-wrap:anywhere] ${
            selectMode ? "cursor-pointer" : "active:scale-[.985]"
          } ${
            editing
              ? "rounded-[16px] border border-slate-200 bg-[#f1f2f4] px-2.5 py-2 text-ink shadow-[0_2px_6px_rgba(0,0,0,.06)]"
              : outgoing
                ? compact
                  ? "rounded-[13px] rounded-br-[4px] border border-white/[.06] bg-ink px-2 py-[3px] text-white shadow-[0_1px_4px_rgba(0,0,0,.08)]"
                  : "rounded-[16px] rounded-br-[5px] border border-white/[.07] bg-ink px-2.5 py-1 md:rounded-[18px] md:rounded-br-[6px] md:px-3.5 md:py-1.5 text-white shadow-[0_2px_6px_rgba(0,0,0,.09)]"
                : compact
                  ? "rounded-[13px] rounded-bl-[4px] border border-black/[.025] bg-[#f1f2f4] px-2 py-[3px] text-ink shadow-[0_1px_4px_rgba(0,0,0,.04)]"
                  : "rounded-[16px] rounded-bl-[5px] border border-black/[.025] bg-[#f1f2f4] px-2.5 py-1 md:rounded-[18px] md:rounded-bl-[6px] md:px-3.5 md:py-1.5 text-ink shadow-[0_2px_6px_rgba(0,0,0,.04)]"
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
                  className="inline-flex h-8 items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3 text-[11px] font-semibold text-ink-soft disabled:opacity-50"
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
                  className="inline-flex h-8 items-center gap-1.5 rounded-full bg-ink px-3 text-[11px] font-semibold text-white disabled:opacity-50"
                >
                  {editSaving ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          ) : (
            messageBody
          )}
        </div>
      </div>
    </div>
  );
}
