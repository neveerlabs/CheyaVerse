"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Home, Image as ImageIcon, User, Send, Github,
} from "lucide-react";
import { useEffect, useState } from "react";
import { BotChatLauncher } from "@/components/BotChatLauncher";

export function TabBar({ uid }: { uid: string }) {
  const pathname = usePathname();
  const router = useRouter();

  const base = `/${uid}`;
  const mediaHref = `${base}/media`;
  const profileHref = `${base}/profile`;
  const chatHref = `${base}/chat`;
  const projectsHref = `${base}/project`;
  const mediaViewerActive = pathname.startsWith(`${base}/m/`);

  const homeActive = pathname === base;
  const mediaActive = pathname.startsWith(mediaHref);
  const profileActive = pathname.startsWith(profileHref);
  const chatActive = pathname.startsWith(chatHref);
  const projectsActive =
    pathname.startsWith(projectsHref) || pathname.startsWith(`${base}/keranjang`);
  const hideBotChatOnPage =
    pathname.startsWith(`${base}/profile/settings`) ||
    pathname === `${base}/profile/privacy` ||
    pathname === `${base}/profile/agreement` ||
    pathname === `${base}/profile/support` ||
    pathname === `${base}/profile/cover` ||
    pathname === `${base}/profile/link-device` ||
    pathname === `${base}/about` ||
    /^\/\d+\/(?:project|keranjang)\/[^/]+\/[^/]+\/?$/.test(pathname);
  const [keyboardOverlayActive, setKeyboardOverlayActive] = useState(false);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    const updateKeyboardState = () => {
      const focused = document.activeElement;
      const target = focused instanceof HTMLElement ? focused : null;
      const textEntryFocused =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        Boolean(target?.isContentEditable);
      const keyboardVisible =
        window.matchMedia("(max-width: 767px)").matches &&
        window.innerHeight - viewport.height > 120;
      setKeyboardOverlayActive(keyboardVisible && textEntryFocused);
    };

    updateKeyboardState();
    viewport.addEventListener("resize", updateKeyboardState);
    viewport.addEventListener("scroll", updateKeyboardState);
    document.addEventListener("focusin", updateKeyboardState);
    document.addEventListener("focusout", updateKeyboardState);
    return () => {
      viewport.removeEventListener("resize", updateKeyboardState);
      viewport.removeEventListener("scroll", updateKeyboardState);
      document.removeEventListener("focusin", updateKeyboardState);
      document.removeEventListener("focusout", updateKeyboardState);
    };
  }, []);

  const refreshCurrentTab = (href: string) => {
    if (pathname === href) router.refresh();
  };

  return (
    <>
    {!mediaViewerActive && (
      <BotChatLauncher
        uid={uid}
        hideLauncher={keyboardOverlayActive || hideBotChatOnPage}
      />
    )}
    <nav
      data-app-tabbar="true"
      style={keyboardOverlayActive ? { display: "none" } : undefined}
      className="app-tabbar-fixed fixed bottom-0 left-0 right-0 z-50 rounded-t-[20px] border-t border-slate-200/70 bg-white/85 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_30px_-24px_rgba(15,23,42,.45)] backdrop-blur-2xl"
    >
      <div className="relative flex h-[56px] max-w-[600px] mx-auto">
        <Link
          prefetch={false}
          href={base}
          onClick={() => refreshCurrentTab(base)}
          className="group flex-1 flex flex-col items-center justify-center gap-[3px] transition-opacity active:opacity-60"
        >
          <Home
            size={19}
            strokeWidth={homeActive ? 2.3 : 1.7}
            className={homeActive ? "text-black" : "text-ink-mute group-hover:text-black"}
          />
          <span
            className={`text-[10px] tracking-[-.005em] leading-none ${
              homeActive ? "font-semibold text-black" : "text-ink-mute group-hover:text-black"
            }`}
          >
            Home
          </span>
        </Link>

        <Link
          prefetch={false}
          href={chatHref}
          onClick={() => refreshCurrentTab(chatHref)}
          className="group relative flex-1 flex flex-col items-center justify-center gap-[3px] transition-opacity active:opacity-60"
        >
          <div className="relative">
            <Send
              size={19}
              strokeWidth={chatActive ? 2.3 : 1.7}
              className={chatActive ? "text-black" : "text-ink-mute group-hover:text-black"}
            />
          </div>
          <span
            className={`text-[10px] tracking-[-.005em] leading-none ${
              chatActive ? "font-semibold text-black" : "text-ink-mute group-hover:text-black"
            }`}
          >
            Chat
          </span>
        </Link>

        <div className="group relative w-[78px] flex-shrink-0">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 top-0 z-0 h-[60px] w-[60px] -translate-x-1/2 -translate-y-1/2 rounded-full"
          >
            <span className="media-tab-glow" />
          </span>
          <Link
            prefetch={false}
            href={mediaHref}
            onClick={() => refreshCurrentTab(mediaHref)}
            aria-label="Media"
            className="media-tab-button absolute left-1/2 top-0 z-10 flex h-[52px] w-[52px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-transparent text-white transition-[transform,box-shadow] active:scale-95"
          >
            <span className="media-tab-sheen" aria-hidden="true" />
            <ImageIcon size={20} strokeWidth={2.1} className="relative z-10 drop-shadow-[0_1px_3px_rgba(255,255,255,.28)]" />
          </Link>
          <span
            className={`absolute bottom-[7px] left-1/2 -translate-x-1/2 text-[10px] tracking-[-.005em] leading-none ${
              mediaActive ? "font-semibold text-black" : "text-ink-mute group-hover:text-black"
            }`}
          >
            Media
          </span>
        </div>

        <Link
          prefetch={false}
          href={projectsHref}
          onClick={() => refreshCurrentTab(projectsHref)}
          className="group flex-1 flex flex-col items-center justify-center gap-[3px] transition-opacity active:opacity-60"
        >
          <Github
            size={19}
            strokeWidth={projectsActive ? 2.3 : 1.7}
            className={projectsActive ? "text-black" : "text-ink-mute group-hover:text-black"}
          />
          <span
            className={`text-[10px] tracking-[-.005em] leading-none ${
              projectsActive ? "font-semibold text-black" : "text-ink-mute group-hover:text-black"
            }`}
          >
            Projects
          </span>
        </Link>

        <Link
          prefetch={false}
          href={profileHref}
          onClick={() => refreshCurrentTab(profileHref)}
          className="group flex-1 flex flex-col items-center justify-center gap-[3px] transition-opacity active:opacity-60"
        >
          <User
            size={19}
            strokeWidth={profileActive ? 2.3 : 1.7}
            className={profileActive ? "text-black" : "text-ink-mute group-hover:text-black"}
          />
          <span
            className={`text-[10px] tracking-[-.005em] leading-none ${
              profileActive ? "font-semibold text-black" : "text-ink-mute group-hover:text-black"
            }`}
          >
            Profile
          </span>
        </Link>
      </div>
    </nav>
    </>
  );
}