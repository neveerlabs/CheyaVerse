"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  Info,
  MoreVertical,
  Mic,
  Send,
  Check,
  CheckCheck,
  Clock,
} from "lucide-react";
import { useRealtime } from "@/lib/use-realtime";
import { VerifiedName } from "@/components/VerifiedName";

type Notification = {
  id: string;
  uid: number;
  title: string;
  message: string;
  ip: string | null;
  location: string | null;
  device: string | null;
  read: number;
  created_at: string;
};

type ChatMessage = {
  id: string;
  uid: number;
  sender: "user" | "bot";
  sender_role: string;
  title: string | null;
  content: string;
  created_at: string;
  delivered_at: string | null;
  read_at: string | null;
};

type TelegramUser = {
  uid: number;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  photo_file_id: string | null;
  role: string;
  created_at: string | null;
  updated_at: string | null;
};

type ChatItem = {
  id: string;
  sender: "user" | "bot";
  title: string;
  content: string;
  created_at: string;
  delivered_at: string | null;
  read_at: string | null;
  _pending: boolean;
};

const MARK_READ_THROTTLE_MS = 400;

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    const now = new Date();
    const sameDay =
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate();
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    if (sameDay) return `${hh}:${mm}`;
    const dd = String(d.getDate()).padStart(2, "0");
    const mo = String(d.getMonth() + 1).padStart(2, "0");
    const yy = String(d.getFullYear()).slice(2);
    return `${dd}/${mo}/${yy} ${hh}:${mm}`;
  } catch {
    return "";
  }
}

function computeUserDisplayName(user: TelegramUser | null): string {
  if (!user) return "Anda";
  const full = [user.first_name, user.last_name].filter(Boolean).join(" ").trim();
  if (full) return full;
  if (user.username) return user.username;
  return "Anda";
}

function StatusIcon({
  pending,
  deliveredAt,
  readAt,
}: {
  pending: boolean;
  deliveredAt: string | null;
  readAt: string | null;
}) {
  if (pending) {
    return <Clock size={11} strokeWidth={2.2} className="text-white/70" />;
  }
  if (readAt) {
    return <CheckCheck size={13} strokeWidth={2.2} className="text-[#60a5fa]" />;
  }
  if (deliveredAt) {
    return <CheckCheck size={13} strokeWidth={2.2} className="text-white/70" />;
  }
  return <Check size={13} strokeWidth={2.2} className="text-white/70" />;
}

export function ChatRoomClient({
  uid,
  notifications,
  initialMessages,
  user,
}: {
  uid: string;
  notifications: Notification[];
  initialMessages: ChatMessage[];
  user: TelegramUser | null;
}) {
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [pending, setPending] = useState<Set<string>>(() => new Set());
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  const markReadRef = useRef<(() => void) | null>(null);
  const lastMarkReadAtRef = useRef(0);
  const markReadInflightRef = useRef(false);

  useEffect(() => {
    if (sending) return;
    setMessages(initialMessages);
  }, [initialMessages, sending]);

  useEffect(() => {
    setMounted(true);
    const t = window.setTimeout(() => setRevealed(true), 30);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;

    const doMarkRead = async () => {
      if (cancelled) return;
      if (markReadInflightRef.current) return;
      markReadInflightRef.current = true;
      try {
        const res = await fetch(
          `/api/notifications/${encodeURIComponent(uid)}`,
          { method: "POST", cache: "no-store" },
        );
        if (!res.ok) return;
        if (!cancelled) router.refresh();
      } catch {
      } finally {
        markReadInflightRef.current = false;
      }
    };

    const throttled = () => {
      const now = Date.now();
      if (now - lastMarkReadAtRef.current < MARK_READ_THROTTLE_MS) return;
      lastMarkReadAtRef.current = now;
      void doMarkRead();
    };

    markReadRef.current = throttled;
    void doMarkRead();

    return () => {
      cancelled = true;
      markReadRef.current = null;
    };
  }, [uid, router]);

  useRealtime(uid, (event) => {
    if (event.type === "message:new") {
      const incoming = event.message as ChatMessage | undefined;
      if (incoming) {
        setMessages((prev) => {
          const idx = prev.findIndex((x) => x.id === incoming.id);
          if (idx >= 0) {
            const copy = prev.slice();
            copy[idx] = { ...copy[idx], ...incoming };
            return copy;
          }
          return [...prev, incoming];
        });
        setPending((prev) => {
          if (!prev.has(incoming.id)) return prev;
          const next = new Set(prev);
          next.delete(incoming.id);
          return next;
        });
      }
      return;
    }
    if (event.type === "message:delivered") {
      const id = typeof event.messageId === "string" ? event.messageId : "";
      const deliveredAt =
        typeof event.delivered_at === "string" ? event.delivered_at : null;
      if (!id || !deliveredAt) return;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === id && !m.delivered_at ? { ...m, delivered_at: deliveredAt } : m,
        ),
      );
      return;
    }
    if (event.type === "message:read") {
      const id = typeof event.messageId === "string" ? event.messageId : "";
      const readAt = typeof event.read_at === "string" ? event.read_at : null;
      if (!id || !readAt) return;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === id && !m.read_at ? { ...m, read_at: readAt } : m,
        ),
      );
      return;
    }
    if (event.type === "notification:new") {
      markReadRef.current?.();
      router.refresh();
      return;
    }
    if (event.type === "notification:read") {
      markReadRef.current?.();
      return;
    }
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const vv = window.visualViewport;
    const root = document.documentElement;
    if (!vv) return;

    let rafId = 0;
    let kbLocked = 0;
    let lastBigAt = 0;
    const BIG_THRESHOLD = 150;
    const RESET_DELAY_MS = 500;

    const apply = () => {
      rafId = 0;
      const layoutH =
        window.innerHeight || document.documentElement.clientHeight || 0;
      const vvH = vv.height || layoutH;
      const diff = Math.max(0, layoutH - vvH);
      const now = Date.now();

      if (diff > BIG_THRESHOLD) {
        lastBigAt = now;
        if (diff > kbLocked) {
          kbLocked = diff;
          root.style.setProperty("--kb", `${kbLocked}px`);
        }
        return;
      }

      if (now - lastBigAt > RESET_DELAY_MS) {
        if (kbLocked !== 0) {
          kbLocked = 0;
          root.style.setProperty("--kb", "0px");
        }
      }
    };

    const schedule = () => {
      if (rafId) return;
      rafId = requestAnimationFrame(apply);
    };

    apply();
    vv.addEventListener("resize", schedule);
    window.addEventListener("resize", schedule);
    window.addEventListener("orientationchange", schedule);

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      vv.removeEventListener("resize", schedule);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("orientationchange", schedule);
      root.style.removeProperty("--kb");
    };
  }, []);

  const chatItems: ChatItem[] = useMemo(() => {
    const merged: ChatItem[] = [];
    const messageContents = new Set(messages.map((m) => m.content));

    for (const n of notifications) {
      if (messageContents.has(n.message)) continue;
      merged.push({
        id: `n-${n.id}`,
        sender: "bot",
        title: "service notifications",
        content: n.message,
        created_at: n.created_at,
        delivered_at: null,
        read_at: null,
        _pending: false,
      });
    }
    for (const m of messages) {
      const title =
        m.sender === "bot"
          ? "service notifications"
          : m.title || computeUserDisplayName(user);
      merged.push({
        id: `m-${m.id}`,
        sender: m.sender,
        title,
        content: m.content,
        created_at: m.created_at,
        delivered_at: m.delivered_at,
        read_at: m.read_at,
        _pending: pending.has(m.id),
      });
    }
    merged.sort((a, b) => a.created_at.localeCompare(b.created_at));
    return merged;
  }, [notifications, messages, user, pending]);

  useEffect(() => {
    const el = bottomRef.current;
    if (!el) return;
    try {
      el.scrollIntoView({ behavior: "auto", block: "end" });
    } catch {}
  }, [chatItems.length]);

  function autoGrow(e: React.FormEvent<HTMLTextAreaElement>) {
    const t = e.currentTarget;
    t.style.height = "auto";
    const next = Math.min(t.scrollHeight, 120);
    t.style.height = next + "px";
  }

  async function sendMessage() {
    const trimmed = text.trim();
    if (!trimmed || sending) return;

    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const displayName = computeUserDisplayName(user);
    const nowIso = new Date().toISOString();

    const optimistic: ChatMessage = {
      id: tempId,
      uid: Number(uid),
      sender: "user",
      sender_role: "user",
      title: displayName,
      content: trimmed,
      created_at: nowIso,
      delivered_at: null,
      read_at: null,
    };

    setMessages((prev) => [...prev, optimistic]);
    setPending((prev) => {
      const next = new Set(prev);
      next.add(tempId);
      return next;
    });
    setText("");
    if (taRef.current) taRef.current.style.height = "auto";
    setSending(true);

    try {
      const res = await fetch(`/api/messages/${encodeURIComponent(uid)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: trimmed }),
      });
      if (res.ok) {
        const j = await res.json().catch(() => ({}));
        const saved = j?.message as ChatMessage | undefined;
        setMessages((prev) => {
          const withoutTemp = prev.filter((m) => m.id !== tempId);
          if (!saved) return withoutTemp;
          if (withoutTemp.some((m) => m.id === saved.id)) return withoutTemp;
          return [...withoutTemp, saved];
        });
        setPending((prev) => {
          const next = new Set(prev);
          next.delete(tempId);
          return next;
        });

        if (saved) {
          const savedId = saved.id;
          window.setTimeout(() => {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === savedId && !m.read_at
                  ? { ...m, read_at: new Date().toISOString() }
                  : m,
              ),
            );
          }, 1500);
        }
      } else {
        setPending((prev) => {
          const next = new Set(prev);
          next.delete(tempId);
          return next;
        });
        setMessages((prev) =>
          prev.map((m) =>
            m.id === tempId ? { ...m, delivered_at: null, read_at: null } : m,
          ),
        );
      }
    } catch {
      setPending((prev) => {
        const next = new Set(prev);
        next.delete(tempId);
        return next;
      });
    }
    setSending(false);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendMessage();
    }
  }

  const hasText = text.trim().length > 0;

  const fadeCls = `transition-opacity duration-500 ease-out ${
    revealed ? "opacity-100" : "opacity-0"
  }`;

  const header = (
    <header
      className={`fixed left-0 right-0 top-0 z-40 pt-[calc(12px+env(safe-area-inset-top))] pb-3 ${fadeCls}`}
    >
      <div className="mx-auto max-w-[600px] px-5">
        <div className="flex items-center gap-2 -mx-3">
          <Link
            href={`/${uid}/chat`}
            aria-label="Kembali"
            className="w-10 h-10 rounded-full border border-line bg-white flex items-center justify-center text-ink-soft active:scale-90 transition-transform flex-shrink-0 shadow-[0_1px_2px_rgba(0,0,0,.03)]"
          >
            <ChevronLeft size={20} strokeWidth={2.2} />
          </Link>

          <div className="flex-1 min-w-0 flex items-center gap-2.5 h-10 pl-1.5 pr-3 rounded-full border border-line bg-white shadow-[0_1px_2px_rgba(0,0,0,.03)]">
            <div className="w-8 h-8 rounded-full overflow-hidden bg-[#f0f0f0] border border-line flex-shrink-0">
              <img
                src="/icon.png"
                alt=""
                draggable={false}
                className="w-full h-full object-cover"
              />
            </div>
            <div className="min-w-0 flex-1 flex flex-col justify-center">
              <VerifiedName name="CheyaVerse" size="sm" />
              <div className="text-[10px] text-ink-mute truncate leading-tight mt-0.5">
                service notifications
              </div>
            </div>
          </div>

          <button
            type="button"
            aria-label="Menu"
            className="w-10 h-10 rounded-full border border-line bg-white flex items-center justify-center text-ink-soft active:scale-90 transition-transform flex-shrink-0 shadow-[0_1px_2px_rgba(0,0,0,.03)]"
          >
            <MoreVertical size={18} strokeWidth={2.2} />
          </button>
        </div>
      </div>
    </header>
  );

  const footer = (
    <footer
      className={`chat-footer fixed left-0 right-0 z-30 pointer-events-none ${fadeCls}`}
      style={{
        bottom: "var(--kb, 0px)",
        willChange: "opacity",
      }}
    >
      <div className="relative mx-auto max-w-[600px] px-2 flex items-end gap-1.5 pointer-events-auto pt-4 pb-[calc(8px+env(safe-area-inset-bottom))]">
        <div className="flex-1 min-w-0 flex items-center rounded-[22px] border border-line bg-white pl-3.5 pr-3.5 py-[6px] min-h-[40px] shadow-[0_1px_2px_rgba(0,0,0,.03)]">
          <textarea
            ref={taRef}
            rows={1}
            placeholder="Pesan"
            enterKeyHint="send"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onInput={autoGrow}
            onKeyDown={onKeyDown}
            className="flex-1 min-w-0 bg-transparent text-ink text-[14px] leading-[22px] outline-none resize-none overflow-y-auto max-h-[120px] placeholder:text-ink-mute font-[inherit] tracking-[-.005em] p-0 m-0"
          />
        </div>
        {hasText ? (
          <button
            type="button"
            aria-label="Kirim"
            onClick={sendMessage}
            disabled={sending}
            className="w-10 h-10 rounded-full border border-line bg-white flex items-center justify-center text-ink active:scale-90 transition-transform flex-shrink-0 shadow-[0_1px_2px_rgba(0,0,0,.03)]"
          >
            <Send
              size={18}
              strokeWidth={2.2}
              className="animate-send-icon-in"
            />
          </button>
        ) : (
          <button
            type="button"
            aria-label="Rekam suara"
            className="w-10 h-10 rounded-full border border-line bg-white flex items-center justify-center text-ink-soft active:scale-90 transition-transform flex-shrink-0 shadow-[0_1px_2px_rgba(0,0,0,.03)]"
          >
            <Mic size={18} strokeWidth={2.2} />
          </button>
        )}
      </div>
    </footer>
  );

  return (
    <>
      <section
        className={`pt-[calc(80px+env(safe-area-inset-top))] pb-[calc(96px+env(safe-area-inset-bottom))] ${fadeCls}`}
      >
        {chatItems.length === 0 ? (
          <div className="py-20 text-center">
            <div className="w-14 h-14 rounded-full bg-[#f5f5f5] mx-auto mb-4 flex items-center justify-center">
              <Info size={22} className="text-ink-mute" strokeWidth={1.8} />
            </div>
            <p className="text-[14.5px] font-medium text-ink mb-1.5">
              Belum ada pesan
            </p>
            <p className="text-[12.5px] text-ink-mute leading-relaxed px-8">
              Mulai percakapan dengan CheyaVerse
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {chatItems.map((item) => {
              const isUser = item.sender === "user";
              if (isUser) {
                return (
                  <div key={item.id} className="flex flex-row-reverse gap-2.5 -mr-3 pl-1">
                    <div className="flex-1 min-w-0 flex flex-col items-end">
                      <div className="inline-flex items-end gap-x-2 max-w-full bg-ink text-white rounded-2xl rounded-tr-md px-2.5 py-[5px]">
                        <span
                          className="text-[13.5px] leading-[1.35] whitespace-pre-wrap break-words min-w-0 [&_b]:font-semibold [&_i]:italic [&_a]:underline"
                          dangerouslySetInnerHTML={{ __html: item.content }}
                        />
                        <span className="inline-flex items-center gap-0.5 flex-shrink-0 leading-none pb-[2px]">
                          <span className="text-[10px] text-white/70 tabular-nums leading-none">
                            {formatTime(item.created_at)}
                          </span>
                          <StatusIcon
                            pending={item._pending}
                            deliveredAt={item.delivered_at}
                            readAt={item.read_at}
                          />
                        </span>
                      </div>
                    </div>
                  </div>
                );
              }
              return (
                <div key={item.id} className="flex gap-2.5 pr-1 -ml-3">
                  <div className="w-8 h-8 rounded-full overflow-hidden bg-[#f0f0f0] border border-line flex-shrink-0 mt-0.5">
                    <img
                      src="/icon.png"
                      alt=""
                      draggable={false}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="inline-block max-w-full bg-[#f5f5f5] rounded-2xl rounded-tl-md px-3 py-2">
                      <div className="text-[11.5px] font-semibold text-ink mb-0.5">
                        {item.title}
                      </div>
                      <div
                        className="text-[13px] text-ink-soft leading-[1.5] whitespace-pre-wrap break-words [&_b]:font-semibold [&_b]:text-ink [&_i]:italic [&_a]:text-ink [&_a]:underline"
                        dangerouslySetInnerHTML={{ __html: item.content }}
                      />
                      <div className="flex justify-end mt-1">
                        <span className="text-[10px] text-ink-mute tabular-nums leading-none">
                          {formatTime(item.created_at)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>
        )}
      </section>

      {mounted && createPortal(header, document.body)}
      {mounted && createPortal(footer, document.body)}
    </>
  );
}
