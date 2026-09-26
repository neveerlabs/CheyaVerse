"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  CheckCheck,
  Clock3,
  Copy,
  Forward,
  MoreVertical,
  Pin,
  Search,
  Send,
  Trash2,
  UserRound,
  X,
  Pencil,
  Reply,
  Bell,
  BellOff,
} from "lucide-react";
import type { DirectMessage, TelegramUser } from "@/lib/storage";
import { useRealtime } from "@/lib/use-realtime";

type ChatContact = Pick<
  TelegramUser,
  "uid" | "username" | "first_name" | "last_name" | "photo_url"
>;
type SearchUser = ChatContact;
const MESSAGE_ROW_GUTTER = "px-1";

function userName(user: ChatContact): string {
  const fullName = [user.first_name, user.last_name].filter(Boolean).join(" ").trim();
  return fullName || (user.username ? `@${user.username}` : `Telegram ${user.uid}`);
}

function messageTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}

function formatPresence(lastSeen: number | null): string {
  if (lastSeen === null) return "offline";
  const elapsedSeconds = Math.max(0, Math.floor(Date.now() / 1000) - lastSeen);
  if (elapsedSeconds < 90) return "online";
  if (elapsedSeconds < 3600) {
    const minutes = Math.floor(elapsedSeconds / 60);
    return `terakhir online ${minutes} menit lalu`;
  }
  if (elapsedSeconds < 86_400) {
    const hours = Math.floor(elapsedSeconds / 3600);
    return `terakhir online ${hours} jam lalu`;
  }
  const days = Math.floor(elapsedSeconds / 86_400);
  return `terakhir online ${days} hari lalu`;
}

function StatusIcon({
  message,
  pending,
}: {
  message: DirectMessage;
  pending: boolean;
}) {
  if (pending) return <Clock3 size={12} className="text-white/65" />;
  if (message.read_at) return <CheckCheck size={14} className="text-sky-300" />;
  if (message.delivered_at) return <CheckCheck size={14} className="text-slate-300" />;
  return <Check size={14} className="text-sky-200" />;
}

export function DirectChatRoomClient({
  uid,
  contact,
  initialMessages,
}: {
  uid: string;
  contact: ChatContact;
  initialMessages: DirectMessage[];
}) {
  const myUid = Number(uid);
  const name = userName(contact);
  const headerName = contact.username ? `@${contact.username}` : name;
  const [messages, setMessages] = useState(initialMessages);
  const messagesRef = useRef(initialMessages);
  const initialMessagesRef = useRef(initialMessages);
  const [pinned, setPinned] = useState<DirectMessage | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedMessage, setSelectedMessage] = useState<DirectMessage | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [forwardOpen, setForwardOpen] = useState(false);
  const [forwardQuery, setForwardQuery] = useState("");
  const [forwardUsers, setForwardUsers] = useState<SearchUser[]>([]);
  const [forwardLoading, setForwardLoading] = useState(false);
  const [toast, setToast] = useState("");
  const [replyingTo, setReplyingTo] = useState<DirectMessage | null>(null);
  const [muted, setMuted] = useState(false);
  const [contactLastSeen, setContactLastSeen] = useState<number | null>(null);
  const [contactTyping, setContactTyping] = useState(false);
  const [, setPresenceClock] = useState(0);
  const presenceLabel = contactTyping ? "mengetik..." : formatPresence(contactLastSeen);
  const [viewport, setViewport] = useState({ top: 0, height: 0, keyboard: false });
  const messageBoxRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const refreshBusyRef = useRef(false);
  const pendingIdsRef = useRef(new Set<string>());
  const toastTimerRef = useRef<number | null>(null);
  const previousTitleRef = useRef("");
  const typingActiveRef = useRef(false);
  const typingLastSentAtRef = useRef(0);
  const typingTimeoutRef = useRef<number | null>(null);
  const contactTypingTimeoutRef = useRef<number | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const longPressTriggeredAtRef = useRef(0);
  const pressOriginRef = useRef({ x: 0, y: 0 });

  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(""), 2600);
  }, []);

  function startMessagePress(event: React.PointerEvent, message: DirectMessage) {
    if (
      event.pointerType !== "touch" ||
      pendingIdsRef.current.has(message.id)
    ) return;
    pressOriginRef.current = { x: event.clientX, y: event.clientY };
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
    }
    longPressTimerRef.current = window.setTimeout(() => {
      longPressTriggeredAtRef.current = Date.now();
      setSelectedMessage(message);
      longPressTimerRef.current = null;
    }, 450);
  }

  function stopMessagePress() {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }

  function moveMessagePress(event: React.PointerEvent) {
    const distance = Math.hypot(
      event.clientX - pressOriginRef.current.x,
      event.clientY - pressOriginRef.current.y,
    );
    if (distance > 10) stopMessagePress();
  }

  async function sendTypingState(typing: boolean) {
    try {
      const response = await fetch(`/api/chats/${contact.uid}/typing`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ typing }),
      });
      if (!response.ok) {
        throw new Error(`Typing state request failed (${response.status})`);
      }
    } catch (error) {
      console.error("[direct-chat] failed to update typing state:", error);
    }
  }

  function handleTextChange(value: string) {
    setText(value);
    const typing = value.trim().length > 0;
    if (!typing) {
      if (typingTimeoutRef.current !== null) {
        window.clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
      if (typingActiveRef.current) {
        typingActiveRef.current = false;
        void sendTypingState(false);
      }
      return;
    }

    const now = Date.now();
    if (!typingActiveRef.current || now - typingLastSentAtRef.current >= 1500) {
      typingActiveRef.current = true;
      typingLastSentAtRef.current = now;
      void sendTypingState(true);
    }
    if (typingTimeoutRef.current !== null) {
      window.clearTimeout(typingTimeoutRef.current);
    }
    typingTimeoutRef.current = window.setTimeout(() => {
      typingActiveRef.current = false;
      typingTimeoutRef.current = null;
      void sendTypingState(false);
    }, 2500);
  }

  function stopTyping() {
    if (typingTimeoutRef.current !== null) {
      window.clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
    if (typingActiveRef.current) {
      typingActiveRef.current = false;
      void sendTypingState(false);
    }
  }

  function toggleMuted() {
    const next = !muted;
    try {
      window.localStorage.setItem(`cheya-chat-muted:${contact.uid}`, next ? "1" : "0");
      setMuted(next);
      setMenuOpen(false);
      showToast(next ? "Notifikasi browser percakapan dibisukan." : "Notifikasi browser percakapan aktif.");
    } catch (error) {
      console.error("[direct-chat] could not save notification preference:", error);
      showToast("Pengaturan notifikasi tidak dapat disimpan.");
    }
  }

  function beginReply(message: DirectMessage) {
    setReplyingTo(message);
    setSelectedMessage(null);
    setMenuOpen(false);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }

  const refreshMessages = useCallback(async () => {
    if (refreshBusyRef.current) return;
    refreshBusyRef.current = true;
    try {
      const response = await fetch(`/api/chats/${contact.uid}`, {
        cache: "no-store",
      });
      if (!response.ok) throw new Error(`Chat refresh failed: ${response.status}`);
      const result = (await response.json()) as {
        items?: DirectMessage[];
        pinned?: DirectMessage | null;
      };
      if (!Array.isArray(result.items)) throw new Error("Invalid chat response");
      const pending = messagesRef.current.filter((message) =>
        pendingIdsRef.current.has(message.id),
      );
      setMessages([...result.items, ...pending].sort((a, b) =>
        a.created_at.localeCompare(b.created_at),
      ));
      setPinned(result.pinned ?? null);
    } catch (error) {
      console.error("[direct-chat] failed to refresh messages:", error);
    } finally {
      refreshBusyRef.current = false;
    }
  }, [contact.uid]);

  useEffect(() => {
    let active = true;
    const refreshPresence = async () => {
      try {
        const response = await fetch(`/api/presence?uid=${contact.uid}`, {
          cache: "no-store",
        });
        if (!response.ok) throw new Error(`Presence request failed (${response.status})`);
        const result = await response.json();
        if (active && result?.ok === true) {
          setContactLastSeen(
            typeof result.lastSeen === "number" ? result.lastSeen : null,
          );
        }
      } catch (error) {
        console.error("[direct-chat] failed to refresh contact presence:", error);
      }
    };
    void refreshPresence();
    const interval = window.setInterval(() => {
      setPresenceClock((value) => value + 1);
      void refreshPresence();
    }, 15_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [contact.uid]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    try {
      setMuted(window.localStorage.getItem(`cheya-chat-muted:${contact.uid}`) === "1");
    } catch (error) {
      console.error("[direct-chat] notification preference unavailable:", error);
    }
  }, [contact.uid]);

  useEffect(() => {
    const viewportElement = window.visualViewport;
    if (!viewportElement) {
      setViewport({ top: 0, height: window.innerHeight, keyboard: false });
      return;
    }
    const update = () => {
      const top = Math.max(0, viewportElement.offsetTop);
      const height = Math.max(1, viewportElement.height);
      const keyboard =
        window.innerHeight - (viewportElement.height + viewportElement.offsetTop) > 120;
      setViewport({ top, height, keyboard });
    };
    update();
    viewportElement.addEventListener("resize", update);
    viewportElement.addEventListener("scroll", update);
    window.addEventListener("orientationchange", update);
    return () => {
      viewportElement.removeEventListener("resize", update);
      viewportElement.removeEventListener("scroll", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);

  useEffect(() => {
    if (initialMessagesRef.current === initialMessages) return;
    initialMessagesRef.current = initialMessages;
    setMessages((current) => {
      const pending = current.filter((message) =>
        pendingIdsRef.current.has(message.id),
      );
      return [...initialMessages, ...pending].sort((a, b) =>
        a.created_at.localeCompare(b.created_at),
      );
    });
  }, [initialMessages]);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
      if (longPressTimerRef.current !== null) window.clearTimeout(longPressTimerRef.current);
      if (typingTimeoutRef.current !== null) window.clearTimeout(typingTimeoutRef.current);
      if (contactTypingTimeoutRef.current !== null) {
        window.clearTimeout(contactTypingTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const intervalMs = () =>
      document.visibilityState === "visible" ? 2500 : 15000;
    const refresh = () => {
      if (document.visibilityState === "visible") void refreshMessages();
    };
    let interval = window.setInterval(refresh, intervalMs());
    const onVisible = () => {
      window.clearInterval(interval);
      interval = window.setInterval(refresh, intervalMs());
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refreshMessages]);

  useEffect(() => {
    if (!forwardOpen || !forwardQuery.trim()) {
      setForwardUsers([]);
      setForwardLoading(false);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setForwardLoading(true);
      try {
        const response = await fetch(
          `/api/users/search?q=${encodeURIComponent(forwardQuery.trim())}`,
          { cache: "no-store", signal: controller.signal },
        );
        const result = await response.json();
        if (!response.ok || result.ok !== true) {
          throw new Error("Pencarian kontak gagal.");
        }
        setForwardUsers(Array.isArray(result.users) ? result.users : []);
      } catch (error) {
        if (!(error instanceof Error && error.name === "AbortError")) {
          console.error("[direct-chat] forward contact search failed:", error);
        }
      } finally {
        if (!controller.signal.aborted) setForwardLoading(false);
      }
    }, 200);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [forwardOpen, forwardQuery]);

  useRealtime(uid, (event) => {
    if (event.type === "direct-chat:typing" && event.senderUid === contact.uid) {
      const typing = event.typing === true;
      setContactTyping(typing);
      if (contactTypingTimeoutRef.current !== null) {
        window.clearTimeout(contactTypingTimeoutRef.current);
        contactTypingTimeoutRef.current = null;
      }
      if (typing) {
        contactTypingTimeoutRef.current = window.setTimeout(() => {
          setContactTyping(false);
          contactTypingTimeoutRef.current = null;
        }, 4000);
      }
      return;
    }
    if (event.type === "direct-message:new") {
      const incoming = event.message as DirectMessage | undefined;
      if (
        incoming &&
        ((incoming.sender_uid === myUid && incoming.recipient_uid === contact.uid) ||
          (incoming.sender_uid === contact.uid && incoming.recipient_uid === myUid))
      ) {
        setMessages((current) => {
          const index = current.findIndex((message) => message.id === incoming.id);
          if (index >= 0) {
            const next = current.slice();
            next[index] = { ...next[index], ...incoming };
            return next;
          }
          return [...current, incoming].sort((a, b) =>
            a.created_at.localeCompare(b.created_at),
          );
        });
        if (incoming.recipient_uid === myUid && document.visibilityState === "hidden") {
          if (!muted && typeof Notification !== "undefined" && Notification.permission === "granted") {
            try {
              new Notification(name, {
                body: incoming.media_file_id ? "Pesan suara tidak didukung" : incoming.content,
                icon: contact.photo_url || "/icon.png",
                tag: `cheyaverse-chat-${contact.uid}`,
              });
            } catch (error) {
              console.error("[direct-chat] browser notification failed:", error);
            }
          }
          const oldTitle = previousTitleRef.current || document.title;
          previousTitleRef.current = oldTitle;
          document.title = `Pesan baru · ${name}`;
          window.setTimeout(() => {
            document.title = oldTitle;
            previousTitleRef.current = "";
          }, 5000);
        }
      }
      return;
    }
    if (event.type === "direct-message:updated") {
      const incoming = event.message as DirectMessage | undefined;
      if (incoming) {
        setMessages((current) =>
          current.map((message) =>
            message.id === incoming.id
              ? { ...message, ...incoming, is_pinned: message.is_pinned }
              : message,
          ),
        );
      }
      return;
    }
    if (event.type === "direct-message:deleted") {
      void refreshMessages();
    }
    if (event.type === "direct-message:read" || event.type === "direct-message:delivered") {
      void refreshMessages();
    }
  });

  useEffect(() => {
    if (!messageBoxRef.current) return;
    messageBoxRef.current.scrollTo({
      top: messageBoxRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages.length]);

  async function sendMessage() {
    const content = text.trim();
    if (!content || sending) return;
    stopTyping();
    setSending(true);
    setText("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    if (editingId) {
      const editId = editingId;
      try {
        const response = await fetch(
          `/api/chats/${contact.uid}/messages/${encodeURIComponent(editId)}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content }),
          },
        );
        const result = await response.json();
        if (!response.ok || !result.message) {
          throw new Error("Pesan gagal diedit.");
        }
        setMessages((current) =>
          current.map((message) =>
            message.id === editId ? { ...message, ...result.message } : message,
          ),
        );
        setEditingId(null);
        showToast("Pesan diperbarui.");
      } catch (error) {
        setText(content);
        showToast(error instanceof Error ? error.message : "Pesan gagal diedit.");
      } finally {
        setSending(false);
      }
      return;
    }

    const tempId = `pending-${crypto.randomUUID()}`;
    const optimistic: DirectMessage = {
      id: tempId,
      sender_uid: myUid,
      recipient_uid: contact.uid,
      content,
      created_at: new Date().toISOString(),
      delivered_at: null,
      read_at: null,
      edited_at: null,
      deleted_at: null,
      forwarded_from_uid: null,
      is_pinned: false,
      media_file_id: null,
      media_message_id: null,
      media_content_type: null,
      media_duration_ms: null,
      reply_to_id: replyingTo?.id ?? null,
    };
    pendingIdsRef.current.add(tempId);
    setMessages((current) => [...current, optimistic]);
    try {
      const response = await fetch(`/api/chats/${contact.uid}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, replyToId: replyingTo?.id ?? null }),
      });
      const result = await response.json();
      if (!response.ok || result.ok !== true || !result.message) {
        throw new Error("Pesan gagal disimpan. Silakan coba lagi.");
      }
      pendingIdsRef.current.delete(tempId);
      const saved = result.message as DirectMessage;
      setReplyingTo(null);
      setMessages((current) => {
        const withoutTemporaryOrDuplicate = current.filter(
          (message) => message.id !== tempId && message.id !== saved.id,
        );
        return [...withoutTemporaryOrDuplicate, saved].sort((a, b) =>
          a.created_at.localeCompare(b.created_at),
        );
      });
    } catch (error) {
      pendingIdsRef.current.delete(tempId);
      setMessages((current) => current.filter((message) => message.id !== tempId));
      setText(content);
      showToast(error instanceof Error ? error.message : "Pesan gagal dikirim.");
    } finally {
      setSending(false);
    }
  }

  async function deleteMessage(message: DirectMessage, scope: "me" | "everyone") {
    if (
      scope === "everyone" &&
      !window.confirm("Hapus pesan ini untuk semua orang?")
    ) return;
    try {
      const response = await fetch(
        `/api/chats/${contact.uid}/messages/${encodeURIComponent(message.id)}?scope=${scope}`,
        { method: "DELETE" },
      );
      if (!response.ok) throw new Error("Pesan gagal dihapus.");
      setSelectedMessage(null);
      if (scope === "me") {
        setMessages((current) => current.filter((item) => item.id !== message.id));
      } else {
        setMessages((current) =>
          current.map((item) =>
            item.id === message.id ? { ...item, content: "", deleted_at: new Date().toISOString() } : item,
          ),
        );
      }
      showToast("Pesan dihapus.");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Pesan gagal dihapus.");
    }
  }

  async function togglePin(message: DirectMessage) {
    try {
      const response = await fetch(`/api/chats/${contact.uid}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "pin", messageId: message.id }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error("Pesan gagal disematkan.");
      setMessages((current) =>
        current.map((item) => ({ ...item, is_pinned: item.id === message.id && result.pinned })),
      );
      setPinned(result.pinned ? message : null);
      setSelectedMessage(null);
      showToast(result.pinned ? "Pesan disematkan." : "Sematan dilepas.");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Aksi gagal.");
    }
  }

  async function forwardMessage(targetUid: number) {
    if (!selectedMessage) return;
    try {
      const response = await fetch(`/api/chats/${contact.uid}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "forward",
          messageId: selectedMessage.id,
          targetUid,
        }),
      });
      if (!response.ok) throw new Error("Pesan gagal diteruskan.");
      setForwardOpen(false);
      setSelectedMessage(null);
      setForwardQuery("");
      showToast("Pesan diteruskan.");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Pesan gagal diteruskan.");
    }
  }

  function beginEdit(message: DirectMessage) {
    setEditingId(message.id);
    setText(message.content);
    setSelectedMessage(null);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }

  async function copyMessage(message: DirectMessage) {
    try {
      await navigator.clipboard.writeText(
        message.media_file_id ? "Pesan suara tidak didukung" : message.content,
      );
      showToast("Pesan disalin.");
    } catch (error) {
      console.error("[direct-chat] clipboard write failed:", error);
      showToast("Tidak dapat menyalin pesan.");
    }
    setSelectedMessage(null);
  }

  const visibleMessages = messages.filter((message) =>
    searchText.trim()
      ? (message.media_file_id ? "pesan suara tidak didukung" : message.content)
          .toLowerCase()
          .includes(searchText.trim().toLowerCase())
      : true,
  );

  return (
    <div
      className="fixed left-0 right-0 z-50 mx-auto flex max-w-[600px] flex-col overflow-hidden"
      style={{ top: viewport.top, height: viewport.height || "100dvh" }}
    >
      <header className="relative z-20 flex h-[62px] flex-shrink-0 items-center gap-2 bg-transparent px-3">
        <Link
          href={`/${uid}/chat`}
          aria-label="Kembali ke chat"
          className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full border border-[#dfe3e8] bg-white text-ink-soft transition-colors active:bg-[#f2f3f5]"
        >
          <ArrowLeft size={21} />
        </Link>
        <Link
          href={`/${uid}/profile/contact/${contact.uid}`}
          className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-full border border-[#dfe3e8] bg-white px-1.5 transition-colors active:bg-[#f2f3f5]"
          aria-label={`Lihat profil ${name}`}
        >
          <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border border-line bg-[#f5f5f5]">
            <img
              src={contact.photo_url || `/api/avatar/${contact.uid}`}
              alt=""
              className="h-full w-full object-cover"
            />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[14px] font-semibold text-ink">{headerName}</span>
            <span className={`block truncate text-[11px] ${presenceLabel === "online" ? "text-emerald-600" : "text-ink-mute"}`}>
              {presenceLabel}
            </span>
          </span>
        </Link>
        <button
          type="button"
          aria-label="Opsi percakapan"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((value) => !value)}
          className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full border border-[#dfe3e8] bg-white text-ink-soft transition-colors active:bg-[#f2f3f5]"
        >
          <MoreVertical size={19} />
        </button>
        {menuOpen && (
          <div className="absolute right-3 top-[54px] z-30 w-56 overflow-hidden rounded-2xl border border-line bg-white py-1 shadow-xl animate-fade-up">
            <Link
              href={`/${uid}/profile/contact/${contact.uid}`}
              onClick={() => setMenuOpen(false)}
              className="block px-4 py-3 text-left text-[13px] text-ink"
            >
              Lihat profil
            </Link>
            <button
              type="button"
              onClick={toggleMuted}
              className="flex w-full items-center gap-2 px-4 py-3 text-left text-[13px] text-ink"
            >
              {muted ? <Bell size={15} /> : <BellOff size={15} />}
              {muted ? "Aktifkan notifikasi browser" : "Bisukan notifikasi browser"}
            </button>
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
            {pinned && (
              <button
                type="button"
                onClick={() => {
                  document.getElementById(`direct-message-${pinned.id}`)?.scrollIntoView({
                    behavior: "smooth",
                    block: "center",
                  });
                  setMenuOpen(false);
                }}
                className="flex w-full items-center gap-2 px-4 py-3 text-left text-[13px] text-ink"
              >
                <Pin size={15} /> Pesan disematkan
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                void refreshMessages();
                setMenuOpen(false);
              }}
              className="block w-full px-4 py-3 text-left text-[13px] text-ink"
            >
              Muat ulang pesan
            </button>
          </div>
        )}
      </header>

      {searchOpen && (
        <div className="flex flex-shrink-0 items-center gap-2 border-b border-line px-4 py-2">
          <Search size={16} className="text-ink-mute" />
          <input
            autoFocus
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder="Cari isi pesan"
            className="min-w-0 flex-1 bg-transparent py-1 text-[13px] outline-none"
          />
          <button type="button" aria-label="Tutup pencarian" onClick={() => { setSearchOpen(false); setSearchText(""); }}>
            <X size={17} className="text-ink-mute" />
          </button>
        </div>
      )}

      {pinned && (
        <button
          type="button"
          onClick={() => {
            document.getElementById(`direct-message-${pinned.id}`)?.scrollIntoView({
              behavior: "smooth",
              block: "center",
            });
          }}
          className="flex flex-shrink-0 items-center gap-2 border-b border-line bg-[#f5f6f8] px-4 py-2 text-left"
        >
          <Pin size={14} className="flex-shrink-0 text-ink-soft" />
          <span className="truncate text-[12px] text-ink-soft">
            {pinned.deleted_at
              ? "Pesan dihapus"
              : pinned.media_file_id
                ? "Pesan suara tidak didukung"
                : pinned.content}
          </span>
        </button>
      )}

      <div
        ref={messageBoxRef}
        onContextMenu={(event) => event.preventDefault()}
        className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain px-3 py-3"
      >
        {visibleMessages.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center py-16 text-center">
            <p className="mb-1 text-[14px] font-medium text-ink">
              {searchText ? "Pesan tidak ditemukan" : "Belum ada pesan"}
            </p>
            {!searchText && (
              <p className="text-[12.5px] text-ink-mute">Mulai percakapan dengan {name}.</p>
            )}
          </div>
        ) : (
          visibleMessages.map((message) => {
            const mine = message.sender_uid === myUid;
            const isPending = pendingIdsRef.current.has(message.id);
            return (
              <div
                key={message.id}
                id={`direct-message-${message.id}`}
                className={`flex min-w-0 ${MESSAGE_ROW_GUTTER} ${mine ? "justify-end" : "justify-start gap-2.5"}`}
              >
                {!mine && (
                  <span className="mt-0.5 h-8 w-8 flex-shrink-0 overflow-hidden rounded-full border border-line bg-[#f0f0f0]">
                    <img
                      src={contact.photo_url || `/api/avatar/${contact.uid}`}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  </span>
                )}
                <div
                  role="group"
                  aria-label={`Pesan dari ${mine ? "Anda" : name}`}
                  onPointerDown={(event) => startMessagePress(event, message)}
                  onPointerMove={moveMessagePress}
                  onPointerUp={stopMessagePress}
                  onPointerLeave={stopMessagePress}
                  onPointerCancel={stopMessagePress}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    if (isPending) return;
                    longPressTriggeredAtRef.current = Date.now();
                    setSelectedMessage(message);
                  }}
                  className={`max-w-[88%] touch-pan-y rounded-2xl px-2.5 py-[5px] text-left shadow-[0_1px_2px_rgba(0,0,0,.06)] transition-transform duration-150 active:scale-[.99] ${
                    mine
                      ? "rounded-tr-md bg-ink text-white"
                      : "rounded-tl-md bg-[#f2f2f2] text-ink"
                  } ${isPending ? "opacity-70" : ""}`}
                >
                  {message.forwarded_from_uid && (
                    <span className={`mb-1 block text-[10px] italic ${mine ? "text-white/60" : "text-ink-mute"}`}>
                      Diteruskan
                    </span>
                  )}
                  {message.reply_to_id && (
                    <span className={`mb-1 block max-w-full truncate border-l-2 pl-2 text-[10px] ${
                      mine ? "border-white/50 text-white/70" : "border-ink/30 text-ink-mute"
                    }`}>
                      {messages.find((item) => item.id === message.reply_to_id)?.media_file_id
                        ? "Pesan suara tidak didukung"
                        : messages.find((item) => item.id === message.reply_to_id)?.content ?? "Balasan"}
                    </span>
                  )}
                  <span className={`block whitespace-pre-wrap break-words text-[13.5px] leading-[1.45] ${
                    message.deleted_at ? "italic opacity-65" : ""
                  }`}>
                    {message.deleted_at
                      ? "Pesan dihapus"
                      : message.media_file_id
                        ? "Pesan suara tidak didukung"
                        : message.content}
                  </span>
                  <span className={`mt-1 flex items-center justify-end gap-1 text-[10px] ${
                    mine ? "text-white/65" : "text-ink-mute"
                  }`}>
                    {message.edited_at && !message.deleted_at && <span>diedit</span>}
                    {message.is_pinned && <Pin size={10} />}
                    {messageTime(message.created_at)}
                    {mine && <StatusIcon message={message} pending={isPending} />}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void sendMessage();
        }}
        className={`flex flex-shrink-0 items-end gap-2 bg-transparent px-3 pt-2 ${
          viewport.keyboard
            ? "pb-2"
            : "pb-[calc(8px+env(safe-area-inset-bottom))]"
        }`}
      >
        <div className="min-w-0 flex-1">
          {replyingTo && (
            <div className="mb-1 flex items-center gap-2 rounded-xl border border-line bg-white/90 px-3 py-2 text-[11px] text-ink-soft">
              <Reply size={14} className="shrink-0 text-ink-mute" />
              <span className="min-w-0 flex-1 truncate">
                Membalas: {replyingTo.media_file_id ? "Pesan suara tidak didukung" : replyingTo.content}
              </span>
              <button type="button" aria-label="Batal membalas" onClick={() => setReplyingTo(null)}>
                <X size={14} />
              </button>
            </div>
          )}
          {editingId && (
            <div className="mb-1 flex items-center justify-between rounded-lg bg-[#f5f5f5] px-3 py-1.5 text-[11px] text-ink-soft">
              <span>Mengedit pesan</span>
              <button
                type="button"
                onClick={() => {
                  setEditingId(null);
                  setText("");
                }}
                aria-label="Batalkan edit"
              >
                <X size={14} />
              </button>
            </div>
          )}
          <textarea
            ref={textareaRef}
            rows={1}
            value={text}
            onChange={(event) => handleTextChange(event.target.value)}
            onInput={(event) => {
              event.currentTarget.style.height = "auto";
              event.currentTarget.style.height = `${Math.min(event.currentTarget.scrollHeight, 120)}px`;
            }}
            placeholder="Pesan"
            className="max-h-[120px] min-h-11 w-full resize-none rounded-full border border-line bg-white px-4 py-2.5 text-[14px] leading-5 outline-none"
          />
        </div>
        <button
          type="submit"
          disabled={sending || !text.trim()}
          aria-label={editingId ? "Simpan edit" : "Kirim pesan"}
          className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full border border-line bg-white text-ink transition-colors active:bg-[#f2f3f5] disabled:opacity-50"
        >
          <Send size={17} />
        </button>
      </form>

      {selectedMessage && (
        <div
          role="presentation"
          onClick={() => setSelectedMessage(null)}
          className="fixed inset-0 z-[70] flex items-end justify-center bg-black/25 px-4 pb-[calc(16px+env(safe-area-inset-bottom))]"
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Aksi pesan"
            onClick={(event) => event.stopPropagation()}
            className="w-full max-w-[560px] overflow-hidden rounded-2xl bg-white pb-1 shadow-2xl"
          >
            <div className="border-b border-line px-4 py-3">
              <p className="line-clamp-2 whitespace-pre-wrap break-words text-[12.5px] text-ink-soft">
                {selectedMessage.deleted_at
                  ? "Pesan dihapus"
                  : selectedMessage.media_file_id
                    ? "Pesan suara tidak didukung"
                    : selectedMessage.content}
              </p>
            </div>
            {!selectedMessage.deleted_at && (
              <button
                type="button"
                onClick={() => beginReply(selectedMessage)}
                className="flex w-full items-center gap-3 px-4 py-3 text-[13px] text-ink"
              >
                <Reply size={17} /> Balas
              </button>
            )}
            <button type="button" onClick={() => void copyMessage(selectedMessage)} className="flex w-full items-center gap-3 px-4 py-3 text-[13px] text-ink">
              <Copy size={17} /> Salin
            </button>
            {selectedMessage.sender_uid === myUid &&
              !selectedMessage.deleted_at &&
              !selectedMessage.media_file_id && (
              <button type="button" onClick={() => beginEdit(selectedMessage)} className="flex w-full items-center gap-3 px-4 py-3 text-[13px] text-ink">
                <Pencil size={17} /> Edit
              </button>
            )}
            <button
              type="button"
              onClick={() => void deleteMessage(selectedMessage, "me")}
              className="flex w-full items-center gap-3 px-4 py-3 text-[13px] text-ink"
            >
              <Trash2 size={17} /> Hapus untuk saya
            </button>
            {selectedMessage.sender_uid === myUid && !selectedMessage.deleted_at && (
              <button
                type="button"
                onClick={() => void deleteMessage(selectedMessage, "everyone")}
                className="flex w-full items-center gap-3 px-4 py-3 text-[13px] text-danger"
              >
                <Trash2 size={17} /> Hapus untuk semua orang
              </button>
            )}
            <button
              type="button"
              onClick={() => setForwardOpen(true)}
              className="flex w-full items-center gap-3 px-4 py-3 text-[13px] text-ink"
            >
              <Forward size={17} /> Teruskan
            </button>
            <button
              type="button"
              onClick={() => void togglePin(selectedMessage)}
              className="flex w-full items-center gap-3 px-4 py-3 text-[13px] text-ink"
            >
              <Pin size={17} /> {selectedMessage.is_pinned ? "Lepas sematan" : "Sematkan"}
            </button>
            <button type="button" onClick={() => setSelectedMessage(null)} className="flex w-full items-center justify-center gap-2 border-t border-line px-4 py-3 text-[13px] font-semibold text-ink-soft">
              <X size={15} /> Tutup
            </button>
          </section>
        </div>
      )}

      {forwardOpen && selectedMessage && (
        <div
          role="presentation"
          onClick={() => setForwardOpen(false)}
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/30 px-5"
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Teruskan pesan"
            onClick={(event) => event.stopPropagation()}
            className="w-full max-w-[420px] overflow-hidden rounded-2xl bg-white shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <h2 className="text-[14px] font-semibold text-ink">Teruskan pesan</h2>
              <button type="button" aria-label="Tutup" onClick={() => setForwardOpen(false)}>
                <X size={18} className="text-ink-mute" />
              </button>
            </div>
            <div className="p-4">
              <input
                autoFocus
                value={forwardQuery}
                onChange={(event) => setForwardQuery(event.target.value)}
                placeholder="Cari nama atau username"
                className="w-full rounded-xl border border-line px-3 py-2.5 text-[13px] outline-none"
              />
              <div className="mt-2 max-h-64 overflow-y-auto">
                {forwardLoading && <p className="px-2 py-3 text-[12px] text-ink-mute">Mencari…</p>}
                {!forwardLoading && forwardUsers.map((user) => (
                  <button
                    key={user.uid}
                    type="button"
                    onClick={() => void forwardMessage(user.uid)}
                    className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-[#f7f7f7]"
                  >
                    <span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-[#f5f5f5]">
                      {user.photo_url ? (
                        <img src={user.photo_url} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <UserRound size={17} className="text-ink-mute" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-ink">{userName(user)}</span>
                      {user.username && <span className="block truncate text-[11px] text-ink-mute">@{user.username}</span>}
                    </span>
                    <Forward size={16} className="text-ink-mute" />
                  </button>
                ))}
                {forwardQuery.trim() && !forwardLoading && forwardUsers.length === 0 && (
                  <p className="px-2 py-3 text-[12px] text-ink-mute">Kontak tidak ditemukan.</p>
                )}
              </div>
            </div>
          </section>
        </div>
      )}

      {toast && (
        <div role="status" className="fixed bottom-20 left-1/2 z-[90] -translate-x-1/2 rounded-full bg-ink px-4 py-2 text-[12px] text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
