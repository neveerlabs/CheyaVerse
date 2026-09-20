"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

export function HomeLookup({ uid }: { uid: number }) {
  const [v, setV] = useState("");
  const [err, setErr] = useState(false);
  const router = useRouter();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const m = v.match(/(\d{7})/);
    if (m) {
      setErr(false);
      router.push(`/${uid}/m/${m[1]}`);
    } else {
      setErr(true);
      setTimeout(() => setErr(false), 1800);
    }
  }

  return (
    <form onSubmit={onSubmit} className="px-1 mb-7 animate-fade-up">
      <div
        className={`flex items-center gap-3 px-4 h-12 rounded-full bg-[#f5f5f5] transition-all duration-150 ${
          err
            ? "ring-2 ring-danger/40"
            : "focus-within:bg-[#efefef]"
        }`}
      >
        <Search size={18} className="text-ink-mute flex-shrink-0" strokeWidth={2} />
        <input
          value={v}
          onChange={(e) => setV(e.target.value)}
          placeholder="Cari ID media…"
          inputMode="numeric"
          maxLength={120}
          className="flex-1 min-w-0 bg-transparent text-ink text-[14px] outline-none
                     placeholder:text-ink-mute font-[inherit] tracking-[-.005em]"
        />
        {v && (
          <button
            type="submit"
            className="text-[12.5px] font-semibold text-ink-mute hover:text-ink transition-colors flex-shrink-0"
          >
            Cari
          </button>
        )}
      </div>
      {err && (
        <p className="mt-2 pl-4 text-[12px] text-danger font-medium">
          ID media harus 7 digit
        </p>
      )}
    </form>
  );
}
