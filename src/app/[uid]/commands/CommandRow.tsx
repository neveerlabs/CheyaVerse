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

  return (
    <button
      type="button"
      onClick={copy}
      className="group flex items-start gap-4 px-[18px] py-[15px] w-full text-left
                 transition-colors hover:bg-[#fafafa] active:bg-[#f5f5f5] relative
                 before:absolute before:top-0 before:left-[18px] before:right-[18px]
                 before:h-px before:bg-divider first:before:hidden"
    >
      <span className="flex-1 min-w-0">
        <code className="block font-mono text-[13.5px] font-semibold text-ink
                         tracking-[-.01em] break-all">
          {cmd}
        </code>
        <span className="block text-[12.5px] text-ink-soft mt-1 leading-snug">
          {desc}
        </span>
      </span>
      <span className="w-5 h-5 flex-shrink-0 flex items-center justify-center
                       text-ink-mute group-hover:text-ink transition-colors mt-0.5">
        {copied ? <Check size={16} /> : <Copy size={16} />}
      </span>
    </button>
  );
}