"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  Check,
  CheckCheck,
  Clock3,
  Copy,
  Forward,
  MoreVertical,
  Pin,
  Search,
  Trash2,
  UserRound,
  X,
  Pencil,
  Reply,
  Bell,
  BellOff,
  Share2,
  ListChecks,
  Ban,
} from "lucide-react";
import { TelegramAvatar } from "@/components/TelegramAvatar";
import { ChatComposer } from "@/components/ChatComposer";
import { ChatMessageBubble, chatMessageTime } from "@/components/ChatMessageBubble";
import { MessageActionSheet } from "@/components/MessageActionSheet";
import type { DirectMessage, TelegramUser } from "@/lib/storage";
import { useRealtime } from "@/lib/use-realtime";

type ChatContact = Pick<
  TelegramUser,
  "uid" | "username" | "first_name" | "last_name" | "photo_url"
>;
type SearchUser = ChatContact;

type ViewportState = {
  top: number;
  height: number;
  keyboard: boolean;
  keyboardInset: number;
};

const SWIPE_TRIGGER = 55;
const SWIPE_MAX = 88;

function userName(user: ChatContact): string {
  const fullName = [user.first_name, user.last_name].filter(Boolean).join(" ").trim();
  return fullName || (user.username ? `@${user.username}` : `Telegram ${user.uid}`);
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

const clampStyle: React.CSSProperties = {
  display: "-webkit-box",
  WebkitLineClamp: 2,
  WebkitBoxOrient: "vertical",
  overflow: "hidden",
  wordBreak: "break-word",
};

export function DirectChatRoomClient({
  uid,
  contact,
  ownPhotoUrl,
  ownName,
  initialMessages,
}: {
  uid: string;
  contact: ChatContact;
  ownPhotoUrl: string | null;
  ownName: string;
  initialMessages: DirectMessage[];
}) {
  const myUid = Number(uid);
  const router = useRouter();
  const name = userName(contact);
  const headerName = contact.username || name;
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
  const [mounted, setMounted] = useState(false);
  const [replyingTo, setReplyingTo] = useState<DirectMessage | null>(null);
  const [muted, setMuted] = useState(false);
  const [contactLastSeen, setContactLastSeen] = useState<number | null>(null);
  const [contactTyping, setContactTyping] = useState(false);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [swipe, setSwipe] = useState<{ id: string; offset: number } | null>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [, setPresenceClock] = useState(0);
  const presenceLabel = contactTyping ? "mengetik..." : formatPresence(contactLastSeen);
  const [viewport, setViewport] = useState<ViewportState>({
    top: 0,
    height: 0,
    keyboard: false,
    keyboardInset: 0,
  });
  const [vvOffset, setVvOffset] = useState(0);
  const messageBoxRef = useRef<HTMLDivElement | null>(null);
  const hasScrolledRef = useRef(false);
  const menuRootRef = useRef<HTMLElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const refreshBusyRef = useRef(false);
  const pendingIdsRef = useRef(new Set<string>());
  const toastTimerRef = useRef<number | null>(null);
  const highlightTimerRef = useRef<number | null>(null);
  const previousTitleRef = useRef("");
  const typingActiveRef = useRef(false);
  const typingLastSentAtRef = useRef(0);
  const typingTimeoutRef = useRef<number | null>(null);
  const contactTypingTimeoutRef = useRef<number | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const longPressTriggeredAtRef = useRef(0);
  const pressOriginRef = useRef({ x: 0, y: 0 });
  const swipeRef = useRef<{
    id: string;
    mine: boolean;
    startX: number;
    startY: number;
    active: boolean;
    offset: number;
  } | null>(null);
  const DRAFT_KEY = `cheya-draft:${uid}:${contact.uid}`;
  const draftReadyRef = useRef(false);

  const repliedSenderName = useCallback(
    (msg: DirectMessage | null): string => {
      if (!msg) return "";
      return msg.sender_uid === myUid ? ownName : name;
    },
    [myUid, name, ownName],
  );

  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(""), 2600);
  }, []);

  const scrollToMessage = useCallback((messageId: string) => {
    const el = document.getElementById(`direct-message-${messageId}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightedId(messageId);
    if (highlightTimerRef.current !== null) window.clearTimeout(highlightTimerRef.current);
    highlightTimerRef.current = window.setTimeout(() => setHighlightedId(null), 1600);
  }, []);

  function startMessagePress(event: React.PointerEvent, message: DirectMessage) {
    if (pendingIdsRef.current.has(message.id)) return;
    try {
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    } catch {}
    pressOriginRef.current = { x: event.clientX, y: event.clientY };
    swipeRef.current = {
      id: message.id,
      mine: message.sender_uid === myUid,
      startX: event.clientX,
      startY: event.clientY,
      active: false,
      offset: 0,
    };
    if (event.pointerType !== "touch") return;
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
    }
    longPressTimerRef.current = window.setTimeout(() => {
      longPressTriggeredAtRef.current = Date.now();
      setSelectedMessage(message);
      longPressTimerRef.current = null;
    }, 450);
  }

  function stopMessagePress(event?: React.PointerEvent) {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    if (event) {
      try {
        (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
      } catch {}
    }
    const s = swipeRef.current;
    if (!s) return;
    swipeRef.current = null;
    if (s.active && Math.abs(s.offset) >= SWIPE_TRIGGER) {
      const target = messagesRef.current.find((m) => m.id === s.id);
      if (target) beginReply(target);
    }
    setSwipe(null);
  }

  function moveMessagePress(event: React.PointerEvent) {
    const s = swipeRef.current;
    if (!s) return;
    const dx = event.clientX - s.startX;
    const dy = event.clientY - s.startY;
    if (!s.active) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      if (Math.abs(dx) < Math.abs(dy)) {
        stopMessagePress(event);
        return;
      }
      if (s.mine && dx > 0) {
        stopMessagePress(event);
        return;
      }
      if (!s.mine && dx < 0) {
        stopMessagePress(event);
        return;
      }
      s.active = true;
      if (longPressTimerRef.current !== null) {
        window.clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
    }
    let offset = s.mine ? Math.min(0, dx) : Math.max(0, dx);
    const absOffset = Math.abs(offset);
    if (absOffset > SWIPE_TRIGGER) {
      const excess = absOffset - SWIPE_TRIGGER;
      offset = Math.sign(offset) * (SWIPE_TRIGGER + excess * 0.3);
    }
    offset = Math.max(-SWIPE_MAX, Math.min(SWIPE_MAX, offset));
    s.offset = offset;
    setSwipe({ id: s.id, offset });
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

  const scrollToBottom = useCallback(() => {
    const el = messageBoxRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, []);

  const handleMessageScroll = useCallback(() => {
    const el = messageBoxRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setShowScrollButton(distanceFromBottom > 200);
  }, []);

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
      setViewport({ top: 0, height: 0, keyboard: false, keyboardInset: 0 });
      return;
    }
    let frame = 0;
    const update = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        const isEditing =
          document.activeElement instanceof HTMLInputElement ||
          document.activeElement instanceof HTMLTextAreaElement;
        const layoutHeight = document.documentElement.clientHeight;
        const delta = layoutHeight - viewportElement.height;
        const keyboard = isEditing && delta > 120;
        const nextHeight = keyboard ? Math.max(1, viewportElement.height) : 0;
        const nextInset = keyboard ? Math.max(0, delta) : 0;
        setViewport((current) => {
          if (current.keyboard === keyboard && keyboard) {
            return current;
          }
          if (
            current.keyboard === keyboard &&
            Math.abs(current.height - nextHeight) < 4 &&
            Math.abs(current.keyboardInset - nextInset) < 4
          ) {
            return current;
          }
          return {
            top: 0,
            height: nextHeight,
            keyboard,
            keyboardInset: nextInset,
          };
        });
      });
    };
    update();
    viewportElement.addEventListener("resize", update);
    viewportElement.addEventListener("scroll", update);
    document.addEventListener("focusin", update);
    document.addEventListener("focusout", update);
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      viewportElement.removeEventListener("resize", update);
      viewportElement.removeEventListener("scroll", update);
      document.removeEventListener("focusin", update);
      document.removeEventListener("focusout", update);
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);

  useEffect(() => {
    const viewportElement = window.visualViewport;
    if (!viewportElement) return;
    let frame = 0;
    const update = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        const next = viewportElement.offsetTop;
        setVvOffset((prev) => (Math.abs(prev - next) < 1 ? prev : next));
      });
    };
    update();
    viewportElement.addEventListener("scroll", update);
    viewportElement.addEventListener("resize", update);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      viewportElement.removeEventListener("scroll", update);
      viewportElement.removeEventListener("resize", update);
    };
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!menuRootRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [menuOpen]);

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
      if (highlightTimerRef.current !== null) window.clearTimeout(highlightTimerRef.current);
      if (longPressTimerRef.current !== null) window.clearTimeout(longPressTimerRef.current);
      if (typingTimeoutRef.current !== null) window.clearTimeout(typingTimeoutRef.current);
      if (contactTypingTimeoutRef.current !== null) {
        window.clearTimeout(contactTypingTimeoutRef.current);
      }
    };
  }, []);

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

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.history.pushState({ chatRoom: true }, "", window.location.href);
    const onPopState = () => {
      router.replace(`/${uid}/chat`);
    };
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
    };
  }, [uid, router]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const trimmed = raw.trim();
      let parsedText = "";
      let parsedReplyId: string | null = null;
      if (trimmed.startsWith("{")) {
        try {
          const parsed = JSON.parse(trimmed) as {
            text?: unknown;
            replyToId?: unknown;
          };
          if (typeof parsed?.text === "string") parsedText = parsed.text;
          if (typeof parsed?.replyToId === "string") parsedReplyId = parsed.replyToId;
        } catch {}
      } else {
        parsedText = raw;
      }
      if (parsedText) setText(parsedText);
      if (parsedReplyId) {
        const target = messagesRef.current.find((m) => m.id === parsedReplyId);
        if (target) setReplyingTo(target);
      }
    } catch {}
  }, [DRAFT_KEY]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!draftReadyRef.current) {
      draftReadyRef.current = true;
      return;
    }
    try {
      if (text.trim()) {
        const payload = {
          text,
          replyToId: replyingTo?.id ?? null,
        };
        window.localStorage.setItem(DRAFT_KEY, JSON.stringify(payload));
      } else {
        window.localStorage.removeItem(DRAFT_KEY);
      }
      window.dispatchEvent(new Event("cheya-draft-change"));
    } catch {}
  }, [text, replyingTo, DRAFT_KEY]);

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
        if (messagesRef.current.some((message) => message.id === incoming.id)) return;
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
        void refreshMessages();
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
    const behavior: ScrollBehavior = hasScrolledRef.current ? "smooth" : "auto";
    messageBoxRef.current.scrollTo({
      top: messageBoxRef.current.scrollHeight,
      behavior,
    });
    hasScrolledRef.current = true;
  }, [messages.length]);

  async function sendMessage() {
    const content = text.trim();
    if (!content || sending) return;
    stopTyping();
    const replySnapshot = replyingTo;
    setSending(true);
    setText("");
    setReplyingTo(null);
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
      reply_to_id: replySnapshot?.id ?? null,
    };
    pendingIdsRef.current.add(tempId);
    setMessages((current) => [...current, optimistic]);
    try {
      const response = await fetch(`/api/chats/${contact.uid}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, replyToId: replySnapshot?.id ?? null }),
      });
      const result = await response.json();
      if (!response.ok || result.ok !== true || !result.message) {
        throw new Error("Pesan gagal disimpan. Silakan coba lagi.");
      }
      pendingIdsRef.current.delete(tempId);
      const saved = result.message as DirectMessage;
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
      setReplyingTo(replySnapshot);
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

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  const vvApplied = viewport.keyboard ? vvOffset : 0;
  const footerBottom = viewport.keyboard
    ? Math.max(0, viewport.keyboardInset - vvOffset)
    : 0;

  const header = (
    <header
      ref={menuRootRef}
      className="fixed left-0 right-0 z-40 bg-transparent pt-[calc(12px+env(safe-area-inset-top))] pb-3"
      style={{ top: vvApplied }}
    >
      <div className="relative mx-auto max-w-[600px] px-5">
        <div className="flex items-center gap-2 -mx-3">
          <Link
            href={`/${uid}/chat`}
            aria-label="Kembali ke chat"
            className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full border border-[#dfe3e8] bg-white text-ink-soft transition-transform active:scale-90"
          >
            <ArrowLeft size={21} />
          </Link>
          <Link
            href={`/${uid}/profile/contact/${contact.uid}`}
            className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-full border border-[#dfe3e8] bg-white px-1.5"
            aria-label={`Lihat profil ${name}`}
          >
            <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border border-line bg-[#f5f5f5]">
              <TelegramAvatar src={contact.photo_url || `/api/avatar/${contact.uid}`} />
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
            className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full border border-[#dfe3e8] bg-white text-ink-soft transition-transform active:scale-90"
          >
            <MoreVertical size={19} />
          </button>
        </div>
        {menuOpen && (
          <div className="absolute right-5 top-[calc(100%-4px)] z-50 w-56 overflow-hidden rounded-2xl border border-line bg-white py-1 shadow-xl animate-fade-up">
            <button
              type="button"
              onClick={() => setMenuOpen(false)}
              className="flex w-full items-center gap-2 px-4 py-3 text-left text-[13px] text-ink"
            >
              <Share2 size={15} /> Bagikan kontak
            </button>
            <button
              type="button"
              onClick={() => setMenuOpen(false)}
              className="flex w-full items-center gap-2 px-4 py-3 text-left text-[13px] text-ink"
            >
              <ListChecks size={15} /> Pilih pesan
            </button>
            <button
              type="button"
              onClick={() => setMenuOpen(false)}
              className="flex w-full items-center gap-2 px-4 py-3 text-left text-[13px] text-ink"
            >
              <Trash2 size={15} /> Bersihkan untuk saya
            </button>
            <button
              type="button"
              onClick={() => setMenuOpen(false)}
              className="flex w-full items-center gap-2 px-4 py-3 text-left text-[13px] text-danger"
            >
              <Trash2 size={15} /> Bersihkan untuk semua
            </button>
            <button
              type="button"
              onClick={() => setMenuOpen(false)}
              className="flex w-full items-center gap-2 px-4 py-3 text-left text-[13px] text-danger"
            >
              <Ban size={15} /> Blokir kontak
            </button>
            <button
              type="button"
              onClick={toggleMuted}
              className="flex w-full items-center gap-2 border-t border-line px-4 py-3 text-left text-[13px] text-ink"
            >
              {muted ? <Bell size={15} /> : <BellOff size={15} />}
              {muted ? "Aktifkan notifikasi browser" : "Bisukan notifikasi browser"}
            </button>
          </div>
        )}
      </div>
    </header>
  );

  const footer = (
    <footer
      className="chat-footer pointer-events-none fixed left-0 right-0 z-30 bg-transparent"
      style={{ bottom: footerBottom }}
    >
      {showScrollButton && (
        <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-3">
          <button
            type="button"
            onClick={scrollToBottom}
            aria-label="Ke pesan terbaru"
            className="pointer-events-auto flex h-9 w-9 items-center justify-center rounded-full border border-line bg-white text-ink-soft shadow-[0_2px_8px_rgba(0,0,0,.12)] active:scale-90 transition-transform"
          >
            <ArrowDown size={18} strokeWidth={2.2} />
          </button>
        </div>
      )}
      <ChatComposer
        value={text}
        sending={sending}
        sendLabel={editingId ? "Simpan edit" : "Kirim pesan"}
        inputRef={textareaRef}
        onChange={handleTextChange}
        onSend={() => void sendMessage()}
        onInput={(event) => {
          event.currentTarget.style.height = "auto";
          event.currentTarget.style.height = `${Math.min(event.currentTarget.scrollHeight, 120)}px`;
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            void sendMessage();
          }
        }}
        reply={
          replyingTo ? (
            <div className="relative flex items-stretch gap-2.5 border-b border-line bg-gradient-to-r from-[#f6f6f6] to-[#fafafa] px-3 py-2 pr-10">
              <span className="w-[3px] flex-shrink-0 rounded-full bg-ink" />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-[11.5px] font-semibold leading-none tracking-[-.005em] text-ink">
                  Reply to {repliedSenderName(replyingTo)}
                </span>
                <span
                  className="text-[13px] leading-snug text-ink-soft"
                  style={clampStyle}
                >
                  {replyingTo.media_file_id
                    ? "Pesan suara tidak didukung"
                    : replyingTo.content}
                </span>
              </div>
              <button
                type="button"
                aria-label="Batal membalas"
                onClick={() => setReplyingTo(null)}
                className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-black/[.05] text-ink-mute transition-colors active:bg-black/10"
              >
                <X size={13} strokeWidth={2.4} />
              </button>
            </div>
          ) : undefined
        }
        above={
          editingId ? (
            <div className="flex items-center justify-between rounded-lg bg-[#f5f5f5] px-3 py-1.5 text-[11px] text-ink-soft">
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
          ) : undefined
        }
        className="mx-auto max-w-[600px] pointer-events-auto"
        style={{
          paddingBottom: viewport.keyboard
            ? "8px"
            : "calc(8px + env(safe-area-inset-bottom))",
        }}
      />
    </footer>
  );

  return (
    <>
      {mounted && createPortal(header, document.body)}
      <section
        ref={messageBoxRef}
        onScroll={handleMessageScroll}
        className="fixed left-0 right-0 z-10 mx-auto max-w-[600px] overflow-x-hidden overflow-y-auto overscroll-contain pt-[calc(80px+env(safe-area-inset-top))] pb-[calc(96px+env(safe-area-inset-bottom))]"
        style={{
          top: vvApplied,
          height: viewport.keyboard ? viewport.height : "100dvh",
        }}
      >
        {searchOpen && (
          <div className="flex flex-shrink-0 items-center gap-2 bg-transparent px-4 py-2">
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
            className="flex flex-shrink-0 items-center gap-2 bg-transparent px-4 py-2 text-left"
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
          onContextMenu={(event) => event.preventDefault()}
          className="flex min-w-0 flex-col gap-2 px-3 py-3"
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
              const reply = message.reply_to_id
                ? messages.find((item) => item.id === message.reply_to_id)
                : null;
              const repliedName = repliedSenderName(reply);
              const replyPreview = reply?.media_file_id
                ? "Pesan suara tidak didukung"
                : reply?.content ?? "Balasan";
              const prefix = (message.forwarded_from_uid || message.reply_to_id) ? (
                <>
                  {message.forwarded_from_uid && (
                    <span className={`mb-1.5 block text-[10px] font-medium italic ${mine ? "text-white/65" : "text-ink-mute"}`}>
                      Diteruskan
                    </span>
                  )}
                  {message.reply_to_id && reply && (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        scrollToMessage(reply.id);
                      }}
                      className={`mb-1.5 block w-full max-w-full overflow-hidden rounded-lg border-l-[3px] px-2 py-1 text-left transition-colors ${
                        mine
                          ? "border-white/50 bg-white/[.12] active:bg-white/[.22]"
                          : "border-ink/40 bg-black/[.04] active:bg-black/[.09]"
                      }`}
                    >
                      <span
                        className={`block truncate text-[11px] font-semibold leading-none ${
                          mine ? "text-white/95" : "text-ink"
                        }`}
                      >
                        {repliedName}
                      </span>
                      <span
                        className={`mt-0.5 block text-[12.5px] leading-tight ${
                          mine ? "text-white/80" : "text-ink-soft"
                        }`}
                        style={clampStyle}
                      >
                        {replyPreview}
                      </span>
                    </button>
                  )}
                  {message.reply_to_id && !reply && (
                    <span
                      className={`mb-1.5 block max-w-full overflow-hidden rounded-lg border-l-[3px] px-2 py-1 ${
                        mine
                          ? "border-white/50 bg-white/[.12]"
                          : "border-ink/40 bg-black/[.04]"
                      }`}
                    >
                      <span
                        className={`block truncate text-[11px] font-semibold leading-none ${
                          mine ? "text-white/95" : "text-ink"
                        }`}
                      >
                        Pesan
                      </span>
                      <span
                        className={`mt-0.5 block text-[12.5px] leading-tight ${
                          mine ? "text-white/80" : "text-ink-soft"
                        }`}
                        style={clampStyle}
                      >
                        Balasan
                      </span>
                    </span>
                  )}
                </>
              ) : null;
              const content = message.deleted_at
                ? "Pesan dihapus"
                : message.media_file_id
                  ? "Pesan suara tidak didukung"
                  : message.content;
              const isSwiping = swipe?.id === message.id;
              const swipeOffset = isSwiping ? swipe!.offset : 0;
              const swipeProgress = Math.min(1, Math.abs(swipeOffset) / SWIPE_TRIGGER);
              return (
                <div
                  key={message.id}
                  id={`direct-message-${message.id}`}
                  className="relative w-full min-w-0"
                  style={{ touchAction: "pan-y" }}
                >
                  {isSwiping && (
                    <span
                      className="pointer-events-none absolute top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-ink text-white shadow-[0_2px_8px_rgba(0,0,0,.15)]"
                      style={{
                        left: swipeOffset > 0 ? 6 : undefined,
                        right: swipeOffset < 0 ? 6 : undefined,
                        opacity: swipeProgress,
                        transform: `translateY(-50%) scale(${0.75 + swipeProgress * 0.25})`,
                      }}
                    >
                      <Reply size={15} strokeWidth={2.4} />
                    </span>
                  )}
                  <div
                    style={{
                      transform: isSwiping ? `translate3d(${swipeOffset}px, 0, 0)` : undefined,
                      transition: isSwiping ? "none" : "transform 200ms cubic-bezier(.2,.8,.2,1)",
                      willChange: "transform",
                    }}
                  >
                    <ChatMessageBubble
                      outgoing={mine}
                      avatarUrl={
                        mine
                          ? ownPhotoUrl || `/api/avatar/${myUid}`
                          : contact.photo_url || `/api/avatar/${contact.uid}`
                      }
                      content={content}
                      timestamp={chatMessageTime(message.created_at)}
                      status={<StatusIcon message={message} pending={isPending} />}
                      prefix={prefix}
                      edited={Boolean(message.edited_at && !message.deleted_at)}
                      pinned={Boolean(message.is_pinned)}
                      deleted={Boolean(message.deleted_at)}
                      pending={isPending}
                      highlight={highlightedId === message.id}
                      label={`Pesan dari ${mine ? "Anda" : name}`}
                      onPointerDown={(event) => startMessagePress(event, message)}
                      onPointerMove={moveMessagePress}
                      onPointerUp={(event) => stopMessagePress(event)}
                      onPointerCancel={(event) => stopMessagePress(event)}
                      onContextMenu={(event) => {
                        event.preventDefault();
                        if (isPending) return;
                        longPressTriggeredAtRef.current = Date.now();
                        setSelectedMessage(message);
                      }}
                    />
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>
      {mounted && createPortal(footer, document.body)}

      {selectedMessage && (
        <MessageActionSheet
          onClose={() => setSelectedMessage(null)}
          preview={
            selectedMessage.deleted_at
              ? "Pesan dihapus"
              : selectedMessage.media_file_id
                ? "Pesan suara tidak didukung"
                : selectedMessage.content
          }
        >
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
        </MessageActionSheet>
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
                    className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left [@media(hover:hover)]:hover:bg-[#f7f7f7]"
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
    </>
  );
}