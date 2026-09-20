"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Terminal, Image as ImageIcon, Info } from "lucide-react";

export function TabBar({ uid }: { uid: string }) {
  const pathname = usePathname();
  const base = `/${uid}`;

  const TABS = [
    { href: base, label: "Beranda", icon: Home },
    { href: `${base}/commands`, label: "Perintah", icon: Terminal },
    { href: `${base}/media`, label: "Media", icon: ImageIcon },
    { href: `${base}/about`, label: "Tentang", icon: Info },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 pb-[env(safe-area-inset-bottom)] bg-white/92 backdrop-blur-xl border-t border-divider">
      <div className="flex h-[54px] max-w-[600px] mx-auto">
        {TABS.map(({ href, label, icon: Icon }) => {
          const active = href === base ? pathname === base : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className="flex-1 flex flex-col items-center justify-center gap-0.5 relative transition-colors"
            >
              <span
                className={`flex items-center justify-center w-12 h-6 rounded-full transition-colors duration-200 ${
                  active ? "bg-[#f2f2f2]" : ""
                }`}
              >
                <Icon
                  size={19}
                  strokeWidth={active ? 2.4 : 1.8}
                  className={active ? "text-ink" : "text-ink-mute"}
                />
              </span>
              <span
                className={`text-[10.5px] tracking-[-.005em] leading-none ${
                  active ? "font-semibold text-ink" : "font-normal text-ink-mute"
                }`}
              >
                {label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
