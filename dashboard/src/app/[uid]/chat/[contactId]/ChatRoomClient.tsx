"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  Info,
  MoreVertical,
  Search,
  X,
  Check,
  CheckCheck,
  Clock,
  Copy,
} from "lucide-react";
import { useRealtime } from "@/lib/use-realtime";
import { ChatComposer } from "@/components/ChatComposer";
import { ChatMessageBubble, chatMessageTime } from "@/components/ChatMessageBubble";
import { MessageActionSheet } from "@/components/MessageActionSheet";

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
  content: string;
  created_at: string;
  delivered_at: string | null;
  read_at: string | null;
  _pending: boolean;
};

type Recognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: {
    resultIndex: number;
    results: ArrayLike<{ 0: { transcript: string } }>;
  }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};
type RecognitionWindow = Window & {
  SpeechRecognition?: new () => Recognition;
  webkitSpeechRecognition?: new () => Recognition;
};

const MARK_READ_THROTTLE_MS = 400;

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
  const initialMessagesRef = useRef(initialMessages);
  const [pending, setPending] = useState<Set<string>>(() => new Set());
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [recording, setRecording] = useState(false);
  const [selectedChatItem, setSelectedChatItem] = useState<ChatItem | null>(null);
  const recognitionRef = useRef<Recognition | null>(null);
  const voiceBaseTextRef = useRef("");
  const longPressTimerRef = useRef<number | null>(null);
  const longPressTriggeredAtRef = useRef(0);
  const pressOriginRef = useRef({ x: 0, y: 0 });

  const markReadRef = useRef<(() => void) | null>(null);
  const lastMarkReadAtRef = useRef(0);
  const markReadInflightRef = useRef(false);

  function startChatItemPress(event: React.PointerEvent, item: ChatItem) {
    if (event.pointerType !== "touch") return;
    pressOriginRef.current = { x: event.clientX, y: event.clientY };
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
    }
    longPressTimerRef.current = window.setTimeout(() => {
      longPressTriggeredAtRef.current = Date.now();
      setSelectedChatItem(item);
      longPressTimerRef.current = null;
    }, 450);
  }

  function moveChatItemPress(event: React.PointerEvent) {
    if (
      Math.hypot(
        event.clientX - pressOriginRef.current.x,
        event.clientY - pressOriginRef.current.y,
      ) > 10
    ) {
      stopChatItemPress();
    }
  }

  function stopChatItemPress() {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }

  async function copyChatItem(item: ChatItem) {
    try {
      const plainText = new DOMParser()
        .parseFromString(item.content, "text/html")
        .body.textContent?.trim();
      if (!plainText) throw new Error("Pesan tidak berisi teks yang dapat disalin.");
      await navigator.clipboard.writeText(plainText);
      setSelectedChatItem(null);
    } catch (error) {
      console.error("[chat-room] clipboard write failed:", error);
      window.alert("Pesan tidak dapat disalin. Periksa izin clipboard browser.");
    }
  }

  useEffect(() => {
    if (initialMessagesRef.current === initialMessages) return;
    initialMessagesRef.current = initialMessages;
    setMessages((current) => {
      const merged = new Map(initialMessages.map((message) => [message.id, message]));
      for (const message of current) {
        if (pending.has(message.id)) merged.set(message.id, message);
      }
      return [...merged.values()].sort((a, b) =>
        a.created_at.localeCompare(b.created_at),
      );
    });
  }, [initialMessages, pending]);

  useEffect(() => {
    setMounted(true);
    const t = window.setTimeout(() => setRevealed(true), 30);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(
    () => () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (error) {
          console.error("[chat-room] failed to stop speech recognition:", error);
        }
      }
      if (longPressTimerRef.current !== null) window.clearTimeout(longPressTimerRef.current);
    },
    [],
  );

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
    const vv = window.visualViewport;
    const root = document.documentElement;
    const update = () => {
      const layoutHeight = window.innerHeight || document.documentElement.clientHeight;
      const visualHeight = vv?.height ?? layoutHeight;
      const visualTop = vv?.offsetTop ?? 0;
      const keyboardInset = Math.max(0, layoutHeight - visualHeight - visualTop);
      root.style.setProperty("--chat-vv-top", `${Math.max(0, visualTop)}px`);
      root.style.setProperty("--chat-vv-height", `${Math.max(1, visualHeight)}px`);
      root.style.setProperty("--chat-kb", `${keyboardInset}px`);
      root.style.setProperty(
        "--chat-footer-pad",
        keyboardInset > 120 ? "8px" : "calc(8px + env(safe-area-inset-bottom))",
      );
    };
    update();
    vv?.addEventListener("resize", update);
    vv?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      vv?.removeEventListener("resize", update);
      vv?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
      root.style.removeProperty("--chat-vv-top");
      root.style.removeProperty("--chat-vv-height");
      root.style.removeProperty("--chat-kb");
      root.style.removeProperty("--chat-footer-pad");
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
        content: n.message,
        created_at: n.created_at,
        delivered_at: null,
        read_at: null,
        _pending: false,
      });
    }
    for (const m of messages) {
      merged.push({
        id: `m-${m.id}`,
        sender: m.sender,
        content: m.content,
        created_at: m.created_at,
        delivered_at: m.delivered_at,
        read_at: m.read_at,
        _pending: pending.has(m.id),
      });
    }
    merged.sort((a, b) => a.created_at.localeCompare(b.created_at));
    return merged;
  }, [notifications, messages, pending]);

  const visibleChatItems = searchText.trim()
    ? chatItems.filter((item) =>
        item.content.toLowerCase().includes(searchText.trim().toLowerCase()),
      )
    : chatItems;

  function toggleVoiceInput() {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (error) {
        console.error("[chat-room] failed to stop speech recognition:", error);
        window.alert("Dikte suara tidak dapat dihentikan.");
      }
      recognitionRef.current = null;
      setRecording(false);
      return;
    }
    const speech = window as RecognitionWindow;
    const Constructor = speech.SpeechRecognition ?? speech.webkitSpeechRecognition;
    if (!Constructor) {
      window.alert("Dikte suara tidak didukung browser ini.");
      return;
    }
    const recognition = new Constructor();
    voiceBaseTextRef.current = text.trim();
    recognition.lang = navigator.language || "id-ID";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onresult = (event) => {
      let transcript = "";
      for (let index = 0; index < event.results.length; index++) {
        transcript += event.results[index][0].transcript;
      }
      if (transcript.trim()) {
        setText(
          `${voiceBaseTextRef.current}${voiceBaseTextRef.current ? " " : ""}${transcript.trim()}`,
        );
      }
    };
    recognition.onerror = () => {
      recognitionRef.current = null;
      setRecording(false);
      window.alert("Dikte suara gagal. Periksa izin mikrofon lalu coba lagi.");
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      setRecording(false);
    };
    recognitionRef.current = recognition;
    setRecording(true);
    try {
      recognition.start();
    } catch (error) {
      console.error("[chat-room] speech recognition could not start:", error);
      recognitionRef.current = null;
      setRecording(false);
      window.alert("Dikte suara tidak dapat dimulai. Periksa izin mikrofon.");
    }
  }

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

      } else {
        throw new Error("Pesan gagal dikirim. Silakan coba lagi.");
      }
    } catch (error) {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setText(trimmed);
      setPending((prev) => {
        const next = new Set(prev);
        next.delete(tempId);
        return next;
      });
      window.alert(error instanceof Error ? error.message : "Pesan gagal dikirim.");
    } finally {
      setSending(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendMessage();
    }
  }

  const fadeCls = `transition-opacity duration-500 ease-out ${
    revealed ? "opacity-100" : "opacity-0"
  }`;

  const header = (
    <header
      className={`fixed left-0 right-0 top-[var(--chat-vv-top,0px)] z-40 bg-transparent pt-[calc(12px+env(safe-area-inset-top))] pb-3 ${fadeCls}`}
    >
      <div className="relative mx-auto max-w-[600px] px-5">
        <div className="flex items-center gap-2 -mx-3">
          <Link
            href={`/${uid}/chat`}
            aria-label="Kembali"
            className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full border border-[#dfe3e8] bg-white text-ink-soft active:scale-90 transition-transform"
          >
            <ChevronLeft size={20} strokeWidth={2.2} />
          </Link>

          <div className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-full border border-[#dfe3e8] bg-white px-1.5">
            <div className="h-8 w-8 flex-shrink-0 overflow-hidden rounded-full border border-line bg-[#f0f0f0]">
              <img
                src="/icon.png"
                alt=""
                draggable={false}
                className="w-full h-full object-cover"
              />
            </div>
            <div className="flex min-w-0 flex-1 flex-col justify-center">
              <span className="truncate text-[14px] font-semibold text-ink">
                CheyaVerse
              </span>
              <span className="mt-0.5 truncate text-[11px] leading-tight text-ink-mute">
                service notifications
              </span>
            </div>
          </div>

          <button
            type="button"
            aria-label="Menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((value) => !value)}
            className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full border border-[#dfe3e8] bg-white text-ink-soft active:scale-90 transition-transform"
          >
            <MoreVertical size={18} strokeWidth={2.2} />
          </button>
        </div>
        {menuOpen && (
          <div className="absolute right-5 top-[calc(100%-4px)] z-50 w-52 overflow-hidden rounded-xl border border-line bg-white py-1 shadow-xl">
            <button
              type="button"
              onClick={() => {
                setSearchOpen((value) => !value);
                setMenuOpen(false);
              }}
              className="flex w-full items-center gap-2 px-4 py-3 text-left text-[13px] text-ink"
            >
              <Search size={15} /> Cari di percakapan
            </button>
            <Link
              href={`/${uid}/profile`}
              onClick={() => setMenuOpen(false)}
              className="block px-4 py-3 text-[13px] text-ink"
            >
              Profil akun
            </Link>
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                router.refresh();
              }}
              className="block w-full px-4 py-3 text-left text-[13px] text-ink"
            >
              Muat ulang chat
            </button>
          </div>
        )}
      </div>
    </header>
  );

  const footer = (
    <footer
      className={`chat-footer fixed left-0 right-0 z-30 bg-transparent pointer-events-none ${fadeCls}`}
      style={{
          bottom: "var(--chat-kb, 0px)",
          willChange: "opacity",
        }}
      >
        <ChatComposer
          value={text}
          sending={sending}
          inputRef={taRef}
          onChange={setText}
          onSend={() => void sendMessage()}
          onInput={autoGrow}
          onKeyDown={onKeyDown}
          onToggleDictation={toggleVoiceInput}
          dictating={recording}
          className="mx-auto max-w-[600px] pointer-events-auto pb-[var(--chat-footer-pad,calc(8px+env(safe-area-inset-bottom)))]"
        />
    </footer>
  );

  return (
    <>
      <section
        className={`fixed left-0 right-0 top-[var(--chat-vv-top,0px)] mx-auto max-w-[600px] overflow-x-hidden overflow-y-auto overscroll-contain pt-[calc(80px+env(safe-area-inset-top))] pb-[calc(96px+env(safe-area-inset-bottom))] ${fadeCls}`}
        style={{ height: "var(--chat-vv-height, 100dvh)" }}
      >
        {visibleChatItems.length === 0 ? (
          <div className="py-20 text-center">
            <div className="w-14 h-14 rounded-full bg-[#f5f5f5] mx-auto mb-4 flex items-center justify-center">
              <Info size={22} className="text-ink-mute" strokeWidth={1.8} />
            </div>
            <p className="text-[14.5px] font-medium text-ink mb-1.5">
              Belum ada pesan
            </p>
            <p className="text-[12.5px] text-ink-mute leading-relaxed px-8">
              {searchText ? "Coba kata pencarian lain." : "Mulai percakapan dengan CheyaVerse"}
            </p>
          </div>
        ) : (
          <div className="flex min-w-0 flex-col gap-2 px-3">
            {visibleChatItems.map((item) => {
              const isUser = item.sender === "user";
              return (
                <ChatMessageBubble
                  key={item.id}
                  outgoing={isUser}
                  avatarUrl={isUser ? `/api/avatar/${uid}` : "/icon.png"}
                  content={item.content}
                  richText
                  timestamp={chatMessageTime(item.created_at)}
                  status={
                    <StatusIcon
                      pending={item._pending}
                      deliveredAt={item.delivered_at}
                      readAt={item.read_at}
                    />
                  }
                  label={`Pesan dari ${isUser ? "Anda" : "CheyaVerse"}`}
                  pending={item._pending}
                  onPointerDown={(event) => startChatItemPress(event, item)}
                  onPointerMove={moveChatItemPress}
                  onPointerUp={stopChatItemPress}
                  onPointerLeave={stopChatItemPress}
                  onPointerCancel={stopChatItemPress}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    longPressTriggeredAtRef.current = Date.now();
                    setSelectedChatItem(item);
                  }}
                />
              );
            })}
            <div ref={bottomRef} />
          </div>
        )}
      </section>

      {mounted && createPortal(header, document.body)}
      {mounted && createPortal(footer, document.body)}
      {selectedChatItem && mounted && createPortal(
        <MessageActionSheet
          onClose={() => setSelectedChatItem(null)}
          preview={
            new DOMParser()
              .parseFromString(selectedChatItem.content, "text/html")
              .body.textContent?.trim() || "Pesan"
          }
        >
            <button
              type="button"
              onClick={() => void copyChatItem(selectedChatItem)}
              className="flex w-full items-center gap-3 px-4 py-3 text-[13px] text-ink"
            >
              <Copy size={17} /> Salin
            </button>
            <button
              type="button"
              onClick={() => setSelectedChatItem(null)}
              className="flex w-full items-center justify-center border-t border-line px-4 py-3 text-[13px] font-semibold text-ink-soft"
            >
              Tutup
            </button>
        </MessageActionSheet>,
        document.body,
      )}
      {searchOpen && mounted && createPortal(
        <div className="fixed left-0 right-0 top-[var(--chat-vv-top,0px)] z-[60] border-b border-line bg-white px-4 py-2">
          <div className="mx-auto flex max-w-[560px] items-center gap-2">
            <Search size={16} className="text-ink-mute" />
            <input
              autoFocus
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="Cari isi pesan"
              className="min-w-0 flex-1 bg-transparent py-1 text-[13px] outline-none"
            />
            <button
              type="button"
              aria-label="Tutup pencarian"
              onClick={() => { setSearchOpen(false); setSearchText(""); }}
            >
              <X size={17} className="text-ink-mute" />
            </button>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
