"use client";

import type {
  CSSProperties,
  FormEvent as TextareaFormEvent,
  FormEvent,
  KeyboardEvent,
  RefObject,
  ReactNode,
} from "react";
import { Mic, Send } from "lucide-react";

type ChatComposerProps = {
  value: string;
  sending: boolean;
  placeholder?: string;
  sendLabel?: string;
  inputRef: RefObject<HTMLTextAreaElement>;
  onChange: (value: string) => void;
  onSend: () => void;
  onInput?: (event: TextareaFormEvent<HTMLTextAreaElement>) => void;
  onKeyDown?: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onToggleDictation?: () => void;
  dictating?: boolean;
  above?: ReactNode;
  className?: string;
  style?: CSSProperties;
};

export function ChatComposer({
  value,
  sending,
  placeholder = "Pesan",
  sendLabel = "Kirim",
  inputRef,
  onChange,
  onSend,
  onInput,
  onKeyDown,
  onToggleDictation,
  dictating = false,
  above,
  className = "",
  style,
}: ChatComposerProps) {
  const hasText = value.trim().length > 0;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSend();
  }

  return (
    <form
      onSubmit={submit}
      className={`pointer-events-auto flex w-full flex-shrink-0 flex-col gap-1 bg-transparent px-3 pt-2 pb-[calc(8px+env(safe-area-inset-bottom))] ${className}`}
      style={style}
    >
      {above}
      <div className="flex w-full min-w-0 items-end gap-2">
        <div className="flex min-h-11 min-w-0 flex-1 items-end rounded-full border border-line bg-white px-3 py-1.5">
          <textarea
            ref={inputRef}
            rows={1}
            placeholder={placeholder}
            enterKeyHint="send"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onInput={onInput}
            onKeyDown={onKeyDown}
            className="min-h-7 min-w-0 flex-1 resize-none overflow-y-auto bg-transparent p-0 text-[14px] leading-[22px] tracking-[-.005em] text-ink outline-none placeholder:text-ink-mute [overflow-wrap:anywhere]"
            style={{ maxHeight: 120, fontFamily: "inherit" }}
          />
          {onToggleDictation && (
            <button
              type="button"
              aria-label={dictating ? "Hentikan dikte" : "Dikte suara"}
              aria-pressed={dictating}
              onClick={onToggleDictation}
              className="ml-2 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-ink-soft active:bg-[#f2f3f5]"
            >
              <Mic size={17} strokeWidth={2.2} className={dictating ? "text-danger" : ""} />
            </button>
          )}
        </div>
        <button
          type="submit"
          aria-label={sendLabel}
          disabled={sending || !hasText}
          className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full border border-ink bg-ink text-white transition-transform active:scale-90 disabled:opacity-50"
        >
          <Send size={18} strokeWidth={2.2} />
        </button>
      </div>
    </form>
  );
}
