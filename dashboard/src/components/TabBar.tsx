"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Image as ImageIcon, User } from "lucide-react";

export function TabBar({ uid }: { uid: string }) {
  const pathname = usePathname();
  const base = `/${uid}`;
  const mediaHref = `${base}/media`;
  const profileHref = `${base}/profile`;

  const homeActive = pathname === base;
  const mediaActive = pathname.startsWith(mediaHref);
  const profileActive = pathname.startsWith(profileHref);

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 pb-[env(safe-area-inset-bottom)] bg-white/95 backdrop-blur-xl border-t border-divider">
      <div className="relative flex h-[56px] max-w-[600px] mx-auto">
        <Link
          href={base}
          className="flex-1 flex flex-col items-center justify-center gap-[3px] transition-opacity active:opacity-60"
        >
          <Home
            size={19}
            strokeWidth={homeActive ? 2.3 : 1.7}
            className={homeActive ? "text-ink" : "text-ink-mute"}
          />
          <span
            className={`text-[10px] tracking-[-.005em] leading-none ${
              homeActive ? "font-semibold text-ink" : "text-ink-mute"
            }`}
          >
            Beranda
          </span>
        </Link>

        <div className="relative w-[78px] flex-shrink-0">
          <div
            aria-hidden
            className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 w-[64px] h-[64px] pointer-events-none"
          >
            <span
              className="absolute inset-0 rounded-full blur-[9px] opacity-75 animate-[spin_7s_linear_infinite]"
              style={{
                background:
                  "conic-gradient(from 0deg, #22d3ee, #3b82f6, #8b5cf6, #ec4899, #f59e0b, #22d3ee)",
              }}
            />
            <span
              className="absolute inset-[6px] rounded-full animate-[spin_4s_linear_infinite]"
              style={{
                background:
                  "conic-gradient(from 0deg, #22d3ee, #3b82f6, #8b5cf6, #ec4899, #f59e0b, #22d3ee)",
              }}
            />
          </div>
          <Link
            href={mediaHref}
            aria-label="Media"
            className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 w-[50px] h-[50px] rounded-full bg-ink text-white flex items-center justify-center shadow-[0_8px_22px_-6px_rgba(0,0,0,.4)] active:scale-95 transition-transform"
          >
            <ImageIcon size={20} strokeWidth={2.2} />
          </Link>
          <span
            className={`absolute bottom-[7px] left-1/2 -translate-x-1/2 text-[10px] tracking-[-.005em] leading-none ${
              mediaActive ? "font-semibold text-ink" : "text-ink-mute"
            }`}
          >
            Media
          </span>
        </div>

        <Link
          href={profileHref}
          className="flex-1 flex flex-col items-center justify-center gap-[3px] transition-opacity active:opacity-60"
        >
          <User
            size={19}
            strokeWidth={profileActive ? 2.3 : 1.7}
            className={profileActive ? "text-ink" : "text-ink-mute"}
          />
          <span
            className={`text-[10px] tracking-[-.005em] leading-none ${
              profileActive ? "font-semibold text-ink" : "text-ink-mute"
            }`}
          >
            Profil
          </span>
        </Link>
      </div>
    </nav>
  );
}
