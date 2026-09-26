"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Search, UserRound, UserPlus } from "lucide-react";

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
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError("");
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

  const inviteText = `Gabung ke CheyaVerse untuk chat denganku: ${origin}/login`;
  const inviteHref = `https://t.me/share/url?url=${encodeURIComponent(
    `${origin}/login`,
  )}&text=${encodeURIComponent(inviteText)}`;

  return (
    <div className="relative">
      <div className="flex items-center gap-3 rounded-full bg-[#f5f5f5] px-4 h-12 transition-colors focus-within:bg-[#efefef]">
        <Search size={18} className="flex-shrink-0 text-ink-mute" strokeWidth={2} />
        <input
          type="search"
          inputMode="search"
          autoComplete="off"
          placeholder="Cari nama atau username Telegram"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="min-w-0 flex-1 bg-transparent text-[14px] text-ink outline-none placeholder:text-ink-mute"
        />
      </div>
      {query.trim() && (
        <div className="absolute left-0 right-0 top-14 z-20 overflow-hidden rounded-2xl border border-line bg-white shadow-[0_12px_35px_-18px_rgba(0,0,0,.3)]">
          {loading && (
            <p className="px-4 py-3 text-[13px] text-ink-mute">Mencari akun…</p>
          )}
          {!loading &&
            users.map((user) => (
              <Link
                key={user.uid}
                href={`/${uid}/chat/${user.uid}`}
                onClick={() => setQuery("")}
                className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-[#fafafa] active:bg-[#f5f5f5]"
              >
                <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border border-line bg-[#f5f5f5]">
                  {user.photo_url ? (
                    // Telegram profile photos may be remote URLs.
                    <img src={user.photo_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <UserRound size={18} className="text-ink-mute" />
                  )}
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
