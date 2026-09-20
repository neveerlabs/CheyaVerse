"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";

export function CommandRow({ cmd, desc }: { cmd: string; desc: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(cmd.split(" ")[0]);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  }

  const main = cmd.split(" ")[0];
  const args = cmd.slice(main.length).trim();

  return (
    <div
      className="group flex items-start gap-4 px-1 py-4 w-full relative
                 before:absolute before:bottom-0 before:left-0 before:right-0
                 before:h-px before:bg-divider last:before:hidden"
    >
      <div className="flex-1 min-w-0 flex flex-col gap-2">
        <div className="flex items-baseline gap-1.5 flex-wrap">
          <code
            className="inline-flex items-center font-mono text-[13px] font-semibold
                       text-ink bg-[#f5f5f5] rounded-md px-2 py-[3px]
                       tracking-[-.01em] leading-none"
          >
            {main}
          </code>
          {args && (
            <code
              className="font-mono text-[12px] font-normal text-ink-mute
                         tracking-[-.01em] leading-none"
            >
              {args}
            </code>
          )}
        </div>
        <p className="text-[12.5px] text-ink-soft leading-snug pr-2">
          {desc}
        </p>
      </div>

      <button
        type="button"
        onClick={copy}
        aria-label={`Copy ${main}`}
        className={`flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center
                    transition-all duration-200 active:scale-90 mt-0.5
                    ${
                      copied
                        ? "bg-success/10 text-success"
                        : "bg-transparent text-ink-mute hover:bg-[#f5f5f5] hover:text-ink"
                    }`}
      >
        {copied ? <Check size={16} strokeWidth={2.4} /> : <Copy size={15} strokeWidth={2} />}
      </button>
    </div>
  );
}
