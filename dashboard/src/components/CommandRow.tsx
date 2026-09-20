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
      className="group flex items-start gap-4 px-1 py-[15px] w-full text-left
                 transition-opacity hover:opacity-60 active:opacity-40 relative
                 before:absolute before:bottom-0 before:left-0 before:right-0
                 before:h-px before:bg-divider last:before:hidden"
    >
      <span className="flex-1 min-w-0 flex flex-col gap-1">
        <code className="block font-mono text-[13.5px] font-medium text-ink
                         tracking-[-.005em] break-all">
          {cmd}
        </code>
        <span className="block text-[12.5px] text-ink-soft leading-snug">
          {desc}
        </span>
      </span>
      <span className="w-5 h-5 flex-shrink-0 flex items-center justify-center
                       text-ink-mute mt-0.5">
        {copied ? <Check size={15} /> : <Copy size={15} />}
      </span>
    </button>
  );
}
