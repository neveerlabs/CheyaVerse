"use client";

import type {
  CSSProperties,
  FormEvent as TextareaFormEvent,
  FormEvent,
  KeyboardEvent,
  RefObject,
  ReactNode,
} from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Mic, Send } from "lucide-react";
import { renderMarkdownInline } from "@/lib/markdown";

type ChatComposerProps = {
  value: string;
  sending: boolean;
  placeholder?: string;
  sendLabel?: string;
  inputRef: RefObject<HTMLTextAreaElement>;
  onChange: (value: string) => void;
  onSend: () => void;
  onFocus?: () => void;
  onInput?: (event: TextareaFormEvent<HTMLTextAreaElement>) => void;
  onKeyDown?: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onToggleDictation?: () => void;
  dictating?: boolean;
  above?: ReactNode;
  reply?: ReactNode;
  className?: string;
  style?: CSSProperties;
};

const MIRROR_CLASS =
  "pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words text-[14px] leading-[22px] tracking-[-.005em] text-ink [overflow-wrap:anywhere] [&_strong]:font-bold [&_em]:italic [&_s]:line-through [&_a]:underline";

const TEXTAREA_CLASS =
  "relative z-10 block w-full resize-none overflow-y-auto bg-transparent p-0 text-[14px] leading-[22px] tracking-[-.005em] text-transparent caret-ink outline-none placeholder:text-ink-mute [overflow-wrap:anywhere]";

export function ChatComposer({
  value,
  sending,
  placeholder = "Message",
  sendLabel = "Send",
  inputRef,
  onChange,
  onSend,
  onFocus,
  onInput,
  onKeyDown,
  onToggleDictation,
  dictating = false,
  above,
  reply,
  className = "",
  style,
}: ChatComposerProps) {
  const hasText = value.trim().length > 0;
  const mirrorRef = useRef<HTMLDivElement | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(pointer: coarse)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const ta = inputRef.current;
    const mirror = mirrorRef.current;
    if (!ta || !mirror) return;
    const sync = () => {
      mirror.scrollTop = ta.scrollTop;
      mirror.scrollLeft = ta.scrollLeft;
    };
    ta.addEventListener("scroll", sync);
    return () => ta.removeEventListener("scroll", sync);
  }, [inputRef]);

  useEffect(() => {
    const ta = inputRef.current;
    const mirror = mirrorRef.current;
    if (!ta || !mirror) return;

    ta.style.height = "auto";
    const contentHeight = ta.scrollHeight;
    ta.style.height = `${Math.max(22, Math.min(contentHeight, 120))}px`;
    ta.style.overflowY = contentHeight > 120 ? "auto" : "hidden";
    if (
      document.activeElement === ta &&
      ta.selectionStart >= value.length &&
      ta.selectionEnd >= value.length
    ) {
      ta.scrollTop = ta.scrollHeight;
    }
    mirror.scrollTop = ta.scrollTop;
    mirror.scrollLeft = ta.scrollLeft;
  }, [inputRef, value]);

  const mirrorHtml = useMemo(() => {
    if (!value) return "";
    return renderMarkdownInline(value);
  }, [value]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSend();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    onKeyDown?.(event);
    if (event.defaultPrevented) return;
    if (event.key !== "Enter") return;
    if (event.shiftKey) return;
    if (isMobile) return;
    event.preventDefault();
    onSend();
  }

  return (
    <form
      onSubmit={submit}
      className={`pointer-events-auto flex w-full flex-shrink-0 flex-col gap-1 bg-transparent px-3 pt-2 pb-[calc(8px+env(safe-area-inset-bottom))] ${className}`}
      style={{ ...style, touchAction: "none" }}
    >
      {above}
      <div className="flex w-full min-w-0 items-end gap-2">
        <div
          data-chat-composer-input="true"
          onClick={(event) => {
            const target = event.target;
            if (target instanceof Element && target.closest("button")) return;
            inputRef.current?.focus();
          }}
          className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-[22px] border border-line bg-white transition-[border-color,box-shadow] focus-within:border-[#c7cdd5] focus-within:ring-4 focus-within:ring-black/[.035]"
        >
          {reply}
          <div className="flex min-h-11 w-full items-end px-3 py-1.5">
            <div className="relative min-w-0 flex-1">
              <div
                ref={mirrorRef}
                aria-hidden
                className={MIRROR_CLASS}
                dangerouslySetInnerHTML={{ __html: mirrorHtml || "&nbsp;" }}
              />
              <textarea
                ref={inputRef}
                rows={1}
                placeholder={placeholder}
                enterKeyHint={isMobile ? "enter" : "send"}
                value={value}
                onChange={(event) => onChange(event.target.value)}
                onFocus={onFocus}
                onInput={onInput}
                onKeyDown={handleKeyDown}
                className={TEXTAREA_CLASS}
                style={{
                  minHeight: 22,
                  maxHeight: 120,
                  fontFamily: "inherit",
                  touchAction: "auto",
                  overscrollBehavior: "contain",
                }}
              />
            </div>
            {onToggleDictation && (
              <button
                type="button"
                aria-label={dictating ? "Stop dictation" : "Voice dictation"}
                aria-pressed={dictating}
                onClick={onToggleDictation}
                className="ml-2 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-ink-soft active:bg-[#f2f3f5]"
              >
                <Mic
                  size={17}
                  strokeWidth={2.2}
                  className={dictating ? "text-danger" : ""}
                />
              </button>
            )}
          </div>
        </div>
        <button
          type="submit"
          aria-label={sendLabel}
          disabled={sending || !hasText}
          onPointerDown={(event) => event.preventDefault()}
          className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full border border-[#dfe3e8] bg-white text-ink hover:bg-white active:bg-white"
        >
          <Send size={18} strokeWidth={2.2} />
        </button>
      </div>
    </form>
  );
}
