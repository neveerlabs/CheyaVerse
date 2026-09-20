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
    <form
      onSubmit={onSubmit}
      className="mb-7 rounded-2xl bg-white border border-line p-4 animate-fade-up"
    >
      <label className="block text-[11px] font-bold text-ink-mute uppercase tracking-[.08em] mb-2.5 pl-0.5">
        Cari Media
      </label>
      <div className="flex gap-2">
        <input
          value={v}
          onChange={(e) => setV(e.target.value)}
          placeholder="Tempel ID atau link…"
          inputMode="numeric"
          maxLength={120}
          className={`flex-1 min-w-0 px-3.5 py-3 rounded-xl bg-[#fafafa] text-ink text-[14px] outline-none border-[1.5px] transition-all placeholder:text-ink-mute font-[inherit] ${
            err ? "border-danger" : "border-line focus:border-ink focus:bg-white"
          }`}
        />
        <button
          type="submit"
          aria-label="Cari"
          className="w-12 rounded-xl bg-ink hover:bg-accent-hover text-white flex items-center justify-center transition-all active:scale-[.96] flex-shrink-0"
        >
          <Search size={20} strokeWidth={2.4} />
        </button>
      </div>
      {err && (
        <p className="mt-2 pl-1 text-[12px] text-danger font-medium">
          ID media harus 7 digit
        </p>
      )}
    </form>
  );
}