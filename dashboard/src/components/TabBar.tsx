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
    <nav className="fixed bottom-0 left-0 right-0 z-50 h-[calc(70px+env(safe-area-inset-bottom))] pb-[env(safe-area-inset-bottom)] bg-white/95 backdrop-blur-xl border-t border-line flex">
      {TABS.map(({ href, label, icon: Icon }) => {
        const active = href === base ? pathname === base : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={`flex-1 flex flex-col items-center justify-center gap-1 pt-1 relative text-[10.5px] font-semibold transition-colors ${
              active ? "text-ink" : "text-ink-mute hover:text-ink-soft"
            }`}
          >
            {active && (
              <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-[3px] rounded-b bg-ink" />
            )}
            <Icon size={22} strokeWidth={active ? 2.4 : 2} />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}