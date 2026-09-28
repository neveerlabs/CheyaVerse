"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Search, UserPlus } from "lucide-react";
import { TelegramAvatar } from "@/components/TelegramAvatar";

type SearchUser = {
  uid: number;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  photo_url: string | null;
};

function displayName(user: SearchUser): string {
  const fullName = [user.first_name, user.last_name].filter(Boolean).join(" ").trim();
  return fullName || (user.username ? `@${user.username}` : `Telegram ${user.uid}`);
}

export function ChatSearch({ uid }: { uid: string }) {
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<SearchUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [origin, setOrigin] = useState("");
  const [focused, setFocused] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    const term = query.trim();
    if (!term) {
      setUsers([]);
      setError("");
      setLoading(false);
      return;
    }
    setUsers([]);
    setError("");
    setLoading(true);
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/users/search?q=${encodeURIComponent(term)}`,
          { cache: "no-store", signal: controller.signal },
        );
        const result = await response.json();
        if (!response.ok || result?.ok !== true) {
          throw new Error("Pencarian akun gagal. Coba lagi.");
        }
        setUsers(Array.isArray(result.users) ? result.users : []);
      } catch (cause) {
        if (cause instanceof Error && cause.name === "AbortError") return;
        setError(cause instanceof Error ? cause.message : "Pencarian gagal.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  function closeSearch() {
    inputRef.current?.blur();
    setFocused(false);
    setQuery("");
  }

  const inviteText = `Gabung ke CheyaVerse untuk chat denganku: ${origin}/login`;
  const inviteHref = `https://t.me/share/url?url=${encodeURIComponent(
    `${origin}/login`,
  )}&text=${encodeURIComponent(inviteText)}`;

  const active = focused || Boolean(query.trim());

  return (
    <div ref={rootRef} className="relative z-40 isolate">
      {active && (
        <div
          aria-hidden
          onClick={closeSearch}
          className="fixed inset-0 z-0"
        />
      )}
      <div
        onClick={() => inputRef.current?.focus()}
        className="relative z-10 flex h-12 items-center gap-3 rounded-full border border-line bg-white px-4 shadow-sm transition-colors focus-within:border-line-strong"
      >
        <Search size={18} className="flex-shrink-0 text-ink-mute" strokeWidth={2} />
        <input
          ref={inputRef}
          type="search"
          inputMode="search"
          autoComplete="off"
          placeholder="Cari kontak"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          aria-label="Cari kontak Telegram"
          aria-controls="chat-search-results"
          className="min-w-0 flex-1 bg-transparent text-[14px] text-ink outline-none placeholder:text-ink-mute"
        />
      </div>
      {query.trim() && (
        <div
          id="chat-search-results"
          className="absolute left-0 right-0 top-[calc(100%+8px)] z-50 max-h-[min(60dvh,420px)] overflow-y-auto overscroll-contain rounded-2xl border border-line bg-white shadow-[0_12px_35px_-18px_rgba(0,0,0,.3)]"
        >
          {loading && (
            <p className="px-4 py-3 text-[13px] text-ink-mute">Mencari akun…</p>
          )}
          {!loading &&
            users.map((user) => (
              <Link
                key={user.uid}
                href={`/${uid}/chat/${user.uid}`}
                onClick={() => setQuery("")}
                className="flex items-center gap-3 px-4 py-3 transition-colors [@media(hover:hover)]:hover:bg-[#fafafa]"
              >
                <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border border-line bg-[#f5f5f5]">
                  <TelegramAvatar src={user.photo_url || `/api/avatar/${user.uid}`} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-semibold text-ink">
                    {displayName(user)}
                  </span>
                  {user.username && (
                    <span className="block truncate text-[12px] text-ink-mute">
                      @{user.username}
                    </span>
                  )}
                </span>
              </Link>
            ))}
          {!loading && users.length === 0 && !error && (
            <div className="px-4 py-3">
              <p className="mb-2 text-[12.5px] leading-relaxed text-ink-soft">
                Akun itu belum terdaftar di CheyaVerse. Telegram tidak
                mengizinkan web mencari user yang belum pernah login.
              </p>
              <a
                href={inviteHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-lg bg-ink px-3 py-2 text-[12.5px] font-semibold text-white"
              >
                <UserPlus size={15} /> Undang lewat Telegram
              </a>
            </div>
          )}
          {error && (
            <p role="alert" className="px-4 py-3 text-[12.5px] text-danger">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}