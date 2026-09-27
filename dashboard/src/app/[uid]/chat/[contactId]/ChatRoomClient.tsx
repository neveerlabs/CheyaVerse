"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowLeft,
  MoreVertical,
  Search,
  X,
  Check,
  CheckCheck,
  Clock,
  Copy,
  Forward,
  Pin,
  Pencil,
  Reply,
  Trash2,
  UserRound,
  Share2,
  ListChecks,
} from "lucide-react";
import { useRealtime } from "@/lib/use-realtime";
import { ChatComposer } from "@/components/ChatComposer";
import { ChatMessageBubble, chatMessageTime } from "@/components/ChatMessageBubble";
import { MessageActionSheet } from "@/components/MessageActionSheet";
import { TelegramAvatar } from "@/components/TelegramAvatar";
import { VerifiedName } from "@/components/VerifiedName";
import { playSendSound } from "@/lib/chat-sounds";

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
  is_pinned: boolean;
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
  edited_at: string | null;
  deleted_at: string | null;
  reply_to_id: string | null;
  is_pinned: boolean;
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
  messageId: string | null;
  notificationId: string | null;
  replyTargetId: string | null;
  sender: "user" | "bot";
  content: string;
  created_at: string;
  delivered_at: string | null;
  read_at: string | null;
  edited_at: string | null;
  deleted_at: string | null;
  reply_to_id: string | null;
  is_pinned: boolean;
  source: "message" | "notification";
  _pending: boolean;
};

type ForwardUser = {
  uid: number;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  photo_url: string | null;
};

const MARK_READ_THROTTLE_MS = 400;
const SWIPE_TRIGGER = 55;
const SWIPE_MAX = 88;

type ViewportState = {
  top: number;
  height: number;
  keyboard: boolean;
  keyboardInset: number;
};

function chatPreviewText(content: string): string {
  return content
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|li)>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .trim();
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

const clampStyle: React.CSSProperties = {
  display: "-webkit-box",
  WebkitLineClamp: 2,
  WebkitBoxOrient: "vertical",
  overflow: "hidden",
  wordBreak: "break-word",
};

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
  const messageBoxRef = useRef<HTMLDivElement | null>(null);
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const menuRootRef = useRef<HTMLElement | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const longPressTriggeredAtRef = useRef(0);
  const pressOriginRef = useRef({ x: 0, y: 0 });
  const toastTimerRef = useRef<number | null>(null);
  const highlightTimerRef = useRef<number | null>(null);
  const initialMessagesRef = useRef(initialMessages);
  const markReadRef = useRef<(() => void) | null>(null);
  const lastMarkReadAtRef = useRef(0);
  const markReadInflightRef = useRef(false);
  const hasScrolledRef = useRef(false);
  const router = useRouter();
  const DRAFT_KEY = `cheya-draft:${uid}:system`;
  const draftReadyRef = useRef(false);
  const swipeRef = useRef<{
    id: string;
    mine: boolean;
    startX: number;
    startY: number;
    active: boolean;
    offset: number;
  } | null>(null);

  const ownName = computeUserDisplayName(user);

  const [mounted, setMounted] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [hiddenNotificationIds, setHiddenNotificationIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [pinnedNotificationIds, setPinnedNotificationIds] = useState<Set<string>>(
    () => new Set(notifications.filter((item) => item.is_pinned).map((item) => item.id)),
  );
  const [pending, setPending] = useState<Set<string>>(() => new Set());
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [selectedChatItem, setSelectedChatItem] = useState<ChatItem | null>(null);
  const [replyingTo, setReplyingTo] = useState<ChatItem | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [forwardOpen, setForwardOpen] = useState(false);
  const [forwardQuery, setForwardQuery] = useState("");
  const [forwardUsers, setForwardUsers] = useState<ForwardUser[]>([]);
  const [forwardLoading, setForwardLoading] = useState(false);
  const [toast, setToast] = useState("");
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [swipe, setSwipe] = useState<{ id: string; offset: number } | null>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [viewport, setViewport] = useState<ViewportState>({
    top: 0,
    height: 0,
    keyboard: false,
    keyboardInset: 0,
  });
  const [vvOffset, setVvOffset] = useState(0);

  function showToast(message: string) {
    setToast(message);
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(""), 2600);
  }

  function handleTextChange(value: string) {
    setText(value);
  }

  function startChatItemPress(event: React.PointerEvent, item: ChatItem) {
    if (item._pending) return;
    try {
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    } catch {}
    pressOriginRef.current = { x: event.clientX, y: event.clientY };
    swipeRef.current = {
      id: item.id,
      mine: item.sender === "user",
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
      setSelectedChatItem(item);
      longPressTimerRef.current = null;
    }, 450);
  }

  function moveChatItemPress(event: React.PointerEvent) {
    const s = swipeRef.current;
    if (!s) return;
    const dx = event.clientX - s.startX;
    const dy = event.clientY - s.startY;
    if (!s.active) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      if (Math.abs(dx) < Math.abs(dy)) {
        stopChatItemPress(event);
        return;
      }
      if (s.mine && dx > 0) {
        stopChatItemPress(event);
        return;
      }
      if (!s.mine && dx < 0) {
        stopChatItemPress(event);
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

  function stopChatItemPress(event?: React.PointerEvent) {
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
      const target = chatItemsRef.current.find((it) => it.id === s.id);
      if (target) beginReply(target);
    }
    setSwipe(null);
  }

  async function copyChatItem(item: ChatItem) {
    try {
      const plainText = new DOMParser()
        .parseFromString(item.content, "text/html")
        .body.textContent?.trim();
      if (!plainText) throw new Error("Pesan tidak berisi teks yang dapat disalin.");
      await navigator.clipboard.writeText(plainText);
      setSelectedChatItem(null);
      showToast("Pesan disalin.");
    } catch (error) {
      console.error("[chat-room] clipboard write failed:", error);
      showToast("Pesan tidak dapat disalin. Periksa izin clipboard browser.");
    }
  }

  const scrollToBottom = () => {
    const el = messageBoxRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  };

  const handleMessageScroll = () => {
    const el = messageBoxRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setShowScrollButton(distanceFromBottom > 200);
  };

  function scrollToChatItem(replyTargetId: string) {
    const target = chatItemsRef.current.find(
      (it) => it.replyTargetId === replyTargetId,
    );
    if (!target) return;
    const el = document.getElementById(target.id);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightedId(target.id);
    if (highlightTimerRef.current !== null) window.clearTimeout(highlightTimerRef.current);
    highlightTimerRef.current = window.setTimeout(() => setHighlightedId(null), 1600);
  }

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

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

  useEffect(
    () => () => {
      if (longPressTimerRef.current !== null) window.clearTimeout(longPressTimerRef.current);
      if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
      if (highlightTimerRef.current !== null) window.clearTimeout(highlightTimerRef.current);
    },
    [],
  );

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
        const target = chatItemsRef.current.find(
          (it) => it.replyTargetId === parsedReplyId,
        );
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
          replyToId: replyingTo?.replyTargetId ?? null,
        };
        window.localStorage.setItem(DRAFT_KEY, JSON.stringify(payload));
      } else {
        window.localStorage.removeItem(DRAFT_KEY);
      }
      window.dispatchEvent(new Event("cheya-draft-change"));
    } catch {}
  }, [text, replyingTo, DRAFT_KEY]);

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
    if (event.type === "message:updated") {
      const incoming = event.message as ChatMessage | undefined;
      if (incoming) {
        setMessages((prev) =>
          prev.map((message) =>
            message.id === incoming.id ? { ...message, ...incoming } : message,
          ),
        );
      }
      return;
    }
    if (event.type === "message:deleted") {
      const messageId = typeof event.messageId === "string" ? event.messageId : "";
      if (!messageId) return;
      setMessages((prev) =>
        prev.map((message) =>
          message.id === messageId
            ? { ...message, content: "", deleted_at: new Date().toISOString() }
            : message,
        ),
      );
      return;
    }
    if (event.type === "message:hidden") {
      const messageId = typeof event.messageId === "string" ? event.messageId : "";
      if (messageId) {
        setMessages((prev) => prev.filter((message) => message.id !== messageId));
      }
      return;
    }
    if (event.type === "message:pinned") {
      const messageId = typeof event.messageId === "string" ? event.messageId : "";
      const pinned = event.pinned === true;
      if (messageId) {
        setMessages((prev) =>
          prev.map((message) =>
            message.id === messageId ? { ...message, is_pinned: pinned } : message,
          ),
        );
      }
      return;
    }
    if (event.type === "notification:deleted") {
      const notificationId =
        typeof event.notificationId === "string" ? event.notificationId : "";
      if (notificationId) {
        setHiddenNotificationIds((current) => new Set(current).add(notificationId));
      }
      return;
    }
    if (event.type === "notification:pinned") {
      const notificationId =
        typeof event.notificationId === "string" ? event.notificationId : "";
      if (notificationId) {
        setPinnedNotificationIds((current) => {
          const next = new Set(current);
          if (event.pinned === true) next.add(notificationId);
          else next.delete(notificationId);
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
        prev.map((m) => (m.id === id && !m.read_at ? { ...m, read_at: readAt } : m)),
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

  const chatItems: ChatItem[] = useMemo(() => {
    const merged: ChatItem[] = [];
    const messageContents = new Set(messages.map((m) => m.content));

    for (const n of notifications) {
      if (hiddenNotificationIds.has(n.id)) continue;
      if (messageContents.has(n.message)) continue;
      merged.push({
        id: `n-${n.id}`,
        messageId: null,
        notificationId: n.id,
        replyTargetId: `n-${n.id}`,
        sender: "bot",
        content: n.message,
        created_at: n.created_at,
        delivered_at: null,
        read_at: null,
        edited_at: null,
        deleted_at: null,
        reply_to_id: null,
        is_pinned: pinnedNotificationIds.has(n.id),
        source: "notification",
        _pending: false,
      });
    }
    for (const m of messages) {
      merged.push({
        id: `m-${m.id}`,
        messageId: m.id,
        notificationId: null,
        replyTargetId: m.id,
        sender: m.sender,
        content: m.content,
        created_at: m.created_at,
        delivered_at: m.delivered_at,
        read_at: m.read_at,
        edited_at: m.edited_at,
        deleted_at: m.deleted_at,
        reply_to_id: m.reply_to_id,
        is_pinned: m.is_pinned,
        source: "message",
        _pending: pending.has(m.id),
      });
    }
    merged.sort((a, b) => a.created_at.localeCompare(b.created_at));
    return merged;
  }, [notifications, hiddenNotificationIds, pinnedNotificationIds, messages, pending]);

  const chatItemsRef = useRef<ChatItem[]>(chatItems);
  useEffect(() => {
    chatItemsRef.current = chatItems;
  }, [chatItems]);

  const visibleChatItems = searchText.trim()
    ? chatItems.filter((item) =>
        item.content.toLowerCase().includes(searchText.trim().toLowerCase()),
      )
    : chatItems;

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
          { signal: controller.signal },
        );
        if (!response.ok) {
          throw new Error(`Pencarian kontak gagal (${response.status}).`);
        }
        const result = await response.json();
        setForwardUsers(Array.isArray(result.users) ? result.users : []);
      } catch (error) {
        if (controller.signal.aborted) return;
        console.error("[chat-room] forward search failed:", error);
        setForwardUsers([]);
        showToast("Kontak tidak dapat dicari saat ini.");
      } finally {
        if (!controller.signal.aborted) setForwardLoading(false);
      }
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [forwardOpen, forwardQuery]);

  useEffect(() => {
    if (!messageBoxRef.current) return;
    const behavior: ScrollBehavior = hasScrolledRef.current ? "smooth" : "auto";
    messageBoxRef.current.scrollTo({
      top: messageBoxRef.current.scrollHeight,
      behavior,
    });
    hasScrolledRef.current = true;
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
    if (editingId) {
      const id = editingId;
      setSending(true);
      try {
        const response = await fetch(`/api/messages/${encodeURIComponent(uid)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messageId: id, content: trimmed }),
        });
        const result = await response.json();
        if (!response.ok || !result.message) {
          throw new Error("Pesan gagal diedit.");
        }
        setMessages((current) =>
          current.map((message) =>
            message.id === id ? { ...message, ...result.message } : message,
          ),
        );
        setEditingId(null);
        setText("");
        showToast("Pesan diperbarui.");
      } catch (error) {
        showToast(error instanceof Error ? error.message : "Pesan gagal diedit.");
      } finally {
        setSending(false);
      }
      return;
    }

    playSendSound();
    const replySnapshot = replyingTo;
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
      edited_at: null,
      deleted_at: null,
      reply_to_id: replySnapshot?.replyTargetId ?? null,
      is_pinned: false,
    };

    setSending(true);
    setMessages((prev) => [...prev, optimistic]);
    setPending((prev) => {
      const next = new Set(prev);
      next.add(tempId);
      return next;
    });
    setText("");
    setReplyingTo(null);
    if (taRef.current) taRef.current.style.height = "auto";

    try {
      const res = await fetch(`/api/messages/${encodeURIComponent(uid)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: trimmed,
          replyToId: replySnapshot?.replyTargetId ?? null,
        }),
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
      setReplyingTo(replySnapshot);
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

  function beginReply(item: ChatItem) {
    setReplyingTo(item);
    setSelectedChatItem(null);
    requestAnimationFrame(() => taRef.current?.focus());
  }

  function beginEdit(item: ChatItem) {
    if (!item.messageId || item.sender !== "user" || item.deleted_at) return;
    setEditingId(item.messageId);
    setReplyingTo(null);
    setText(item.content);
    setSelectedChatItem(null);
    requestAnimationFrame(() => taRef.current?.focus());
  }

  async function deleteChatMessage(item: ChatItem, scope: "me" | "everyone") {
    const notificationId = item.notificationId;
    if (item.source === "notification" && notificationId) {
      try {
        const response = await fetch(
          `/api/notifications/${encodeURIComponent(uid)}?id=${encodeURIComponent(notificationId)}`,
          { method: "DELETE" },
        );
        if (!response.ok) throw new Error("Pesan gagal dihapus.");
        setHiddenNotificationIds((current) => new Set(current).add(notificationId));
        setSelectedChatItem(null);
        showToast("Pesan dihapus.");
      } catch (error) {
        showToast(error instanceof Error ? error.message : "Pesan gagal dihapus.");
      }
      return;
    }
    if (!item.messageId) return;
    if (scope === "everyone" && !window.confirm("Hapus pesan ini untuk semua orang?")) {
      return;
    }
    try {
      const response = await fetch(
        `/api/messages/${encodeURIComponent(uid)}?messageId=${encodeURIComponent(item.messageId)}&scope=${scope}`,
        { method: "DELETE" },
      );
      if (!response.ok) throw new Error("Pesan gagal dihapus.");
      setSelectedChatItem(null);
      if (scope === "me") {
        setMessages((current) =>
          current.filter((message) => message.id !== item.messageId),
        );
      } else {
        setMessages((current) =>
          current.map((message) =>
            message.id === item.messageId
              ? { ...message, content: "", deleted_at: new Date().toISOString() }
              : message,
          ),
        );
      }
      showToast("Pesan dihapus.");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Pesan gagal dihapus.");
    }
  }

  async function toggleChatMessagePin(item: ChatItem) {
    if (!item.replyTargetId) return;
    try {
      const response = await fetch(`/api/messages/${encodeURIComponent(uid)}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "pin", messageId: item.replyTargetId }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error("Pesan gagal disematkan.");
      const notificationId = item.notificationId;
      if (notificationId) {
        setPinnedNotificationIds((current) => {
          const next = new Set(current);
          if (result.pinned) next.add(notificationId);
          else next.delete(notificationId);
          return next;
        });
      } else {
        setMessages((current) =>
          current.map((message) =>
            message.id === item.messageId
              ? { ...message, is_pinned: result.pinned === true }
              : message,
          ),
        );
      }
      setSelectedChatItem(null);
      showToast(result.pinned ? "Pesan disematkan." : "Sematan dilepas.");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Aksi gagal.");
    }
  }

  async function forwardChatMessage(targetUid: number) {
    if (!selectedChatItem?.replyTargetId) return;
    try {
      const response = await fetch(`/api/messages/${encodeURIComponent(uid)}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "forward",
          messageId: selectedChatItem.replyTargetId,
          targetUid,
        }),
      });
      if (!response.ok) throw new Error("Pesan gagal diteruskan.");
      setForwardOpen(false);
      setSelectedChatItem(null);
      setForwardQuery("");
      showToast("Pesan diteruskan.");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Pesan gagal diteruskan.");
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendMessage();
    }
  }

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
          <div className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-full border border-[#dfe3e8] bg-white px-1.5">
            <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border border-line bg-[#f5f5f5]">
              <TelegramAvatar src="/icon.png" />
            </span>
            <span className="flex min-w-0 flex-1 flex-col justify-center">
              <VerifiedName
                name="CheyaVerse"
                size="sm"
                nameClassName="text-[14px]"
              />
              <span className="mt-0.5 block truncate text-[11px] leading-tight text-ink-mute">
                service notifications
              </span>
            </span>
          </div>
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
        inputRef={taRef}
        onChange={handleTextChange}
        onSend={() => void sendMessage()}
        onInput={autoGrow}
        onKeyDown={onKeyDown}
        reply={
          replyingTo ? (
            <div className="relative flex items-stretch gap-2.5 border-b border-line bg-gradient-to-r from-[#f6f6f6] to-[#fafafa] px-3 py-2 pr-10">
              <span className="w-[3px] flex-shrink-0 rounded-full bg-ink" />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-[11.5px] font-semibold leading-none tracking-[-.005em] text-ink">
                  Reply to {replyingTo.sender === "user" ? ownName : "CheyaVerse"}
                </span>
                <span
                  className="text-[13px] leading-snug text-ink-soft"
                  style={clampStyle}
                >
                  {chatPreviewText(replyingTo.content) || "Pesan"}
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
            <button
              type="button"
              aria-label="Tutup pencarian"
              onClick={() => {
                setSearchOpen(false);
                setSearchText("");
              }}
            >
              <X size={17} className="text-ink-mute" />
            </button>
          </div>
        )}

        <div
          onContextMenu={(event) => event.preventDefault()}
          className="flex min-w-0 flex-col gap-2 px-3 py-3"
        >
          {visibleChatItems.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center py-16 text-center">
              <p className="mb-1 text-[14px] font-medium text-ink">
                {searchText ? "Pesan tidak ditemukan" : "Belum ada pesan"}
              </p>
              {!searchText && (
                <p className="text-[12.5px] text-ink-mute">
                  Mulai percakapan dengan CheyaVerse.
                </p>
              )}
            </div>
          ) : (
            visibleChatItems.map((item) => {
              const isUser = item.sender === "user";
              const reply = item.reply_to_id
                ? chatItems.find(
                    (message) => message.replyTargetId === item.reply_to_id,
                  )
                : null;
              const repliedName = reply
                ? reply.sender === "user"
                  ? ownName
                  : "CheyaVerse"
                : "";
              const replyPreview = reply?.deleted_at
                ? "Pesan dihapus"
                : chatPreviewText(reply?.content ?? "") || "Balasan";
              const prefix = item.reply_to_id ? (
                reply ? (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      scrollToChatItem(item.reply_to_id!);
                    }}
                    className={`mb-1.5 block w-full max-w-full overflow-hidden rounded-lg border-l-[3px] px-2 py-1 text-left transition-colors ${
                      isUser
                        ? "border-white/50 bg-white/[.12] active:bg-white/[.22]"
                        : "border-ink/40 bg-black/[.04] active:bg-black/[.09]"
                    }`}
                  >
                    <span
                      className={`block truncate text-[11px] font-semibold leading-none ${
                        isUser ? "text-white/95" : "text-ink"
                      }`}
                    >
                      {repliedName}
                    </span>
                    <span
                      className={`mt-0.5 block text-[12.5px] leading-tight ${
                        isUser ? "text-white/80" : "text-ink-soft"
                      }`}
                      style={clampStyle}
                    >
                      {replyPreview}
                    </span>
                  </button>
                ) : (
                  <span
                    className={`mb-1.5 block max-w-full overflow-hidden rounded-lg border-l-[3px] px-2 py-1 ${
                      isUser
                        ? "border-white/50 bg-white/[.12]"
                        : "border-ink/40 bg-black/[.04]"
                    }`}
                  >
                    <span
                      className={`block truncate text-[11px] font-semibold leading-none ${
                        isUser ? "text-white/95" : "text-ink"
                      }`}
                    >
                      Pesan
                    </span>
                    <span
                      className={`mt-0.5 block text-[12.5px] leading-tight ${
                        isUser ? "text-white/80" : "text-ink-soft"
                      }`}
                      style={clampStyle}
                    >
                      Balasan
                    </span>
                  </span>
                )
              ) : null;
              const isSwiping = swipe?.id === item.id;
              const swipeOffset = isSwiping ? swipe!.offset : 0;
              const swipeProgress = Math.min(1, Math.abs(swipeOffset) / SWIPE_TRIGGER);
              return (
                <div
                  key={item.id}
                  id={item.id}
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
                      outgoing={isUser}
                      avatarUrl={isUser ? `/api/avatar/${uid}` : "/icon.png"}
                      content={item.deleted_at ? "Pesan dihapus" : item.content}
                      richText={item.sender === "bot" && !item.deleted_at}
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
                      deleted={Boolean(item.deleted_at)}
                      edited={Boolean(item.edited_at && !item.deleted_at)}
                      pinned={item.is_pinned}
                      highlight={highlightedId === item.id}
                      prefix={prefix}
                      onPointerDown={(event) => {
                        if (!item._pending) startChatItemPress(event, item);
                      }}
                      onPointerMove={moveChatItemPress}
                      onPointerUp={(event) => stopChatItemPress(event)}
                      onPointerCancel={(event) => stopChatItemPress(event)}
                      onContextMenu={(event) => {
                        event.preventDefault();
                        if (item._pending) return;
                        longPressTriggeredAtRef.current = Date.now();
                        setSelectedChatItem(item);
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

      {selectedChatItem &&
        mounted &&
        createPortal(
          <MessageActionSheet
            onClose={() => setSelectedChatItem(null)}
            preview={
              chatPreviewText(
                selectedChatItem.deleted_at ? "Pesan dihapus" : selectedChatItem.content,
              ) || "Pesan"
            }
          >
            {!selectedChatItem.deleted_at && selectedChatItem.replyTargetId && (
              <button
                type="button"
                onClick={() => beginReply(selectedChatItem)}
                className="flex w-full items-center gap-3 px-4 py-3 text-[13px] text-ink"
              >
                <Reply size={17} /> Balas
              </button>
            )}
            <button
              type="button"
              onClick={() => void copyChatItem(selectedChatItem)}
              className="flex w-full items-center gap-3 px-4 py-3 text-[13px] text-ink"
            >
              <Copy size={17} /> Salin
            </button>
            {selectedChatItem.source === "message" &&
              selectedChatItem.sender === "user" &&
              !selectedChatItem.deleted_at && (
                <button
                  type="button"
                  onClick={() => beginEdit(selectedChatItem)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-[13px] text-ink"
                >
                  <Pencil size={17} /> Edit
                </button>
              )}
            <button
              type="button"
              onClick={() => void deleteChatMessage(selectedChatItem, "me")}
              className="flex w-full items-center gap-3 px-4 py-3 text-[13px] text-ink"
            >
              <Trash2 size={17} /> Hapus untuk saya
            </button>
            {selectedChatItem.source === "message" &&
              selectedChatItem.sender === "user" &&
              !selectedChatItem.deleted_at && (
                <button
                  type="button"
                  onClick={() => void deleteChatMessage(selectedChatItem, "everyone")}
                  className="flex w-full items-center gap-3 px-4 py-3 text-[13px] text-danger"
                >
                  <Trash2 size={17} /> Hapus untuk semua orang
                </button>
              )}
            {!selectedChatItem.deleted_at && selectedChatItem.replyTargetId && (
              <>
                <button
                  type="button"
                  onClick={() => setForwardOpen(true)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-[13px] text-ink"
                >
                  <Forward size={17} /> Teruskan
                </button>
                <button
                  type="button"
                  onClick={() => void toggleChatMessagePin(selectedChatItem)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-[13px] text-ink"
                >
                  <Pin size={17} />{" "}
                  {selectedChatItem.is_pinned ? "Lepas sematan" : "Sematkan"}
                </button>
              </>
            )}
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

      {forwardOpen &&
        selectedChatItem &&
        mounted &&
        createPortal(
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
                <button
                  type="button"
                  aria-label="Tutup"
                  onClick={() => setForwardOpen(false)}
                >
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
                  {forwardLoading && (
                    <p className="px-2 py-3 text-[12px] text-ink-mute">Mencari…</p>
                  )}
                  {!forwardLoading &&
                    forwardUsers.map((target) => {
                      const fullName = [target.first_name, target.last_name]
                        .filter(Boolean)
                        .join(" ")
                        .trim();
                      const name =
                        fullName || target.username || `Telegram ${target.uid}`;
                      return (
                        <button
                          key={target.uid}
                          type="button"
                          onClick={() => void forwardChatMessage(target.uid)}
                          className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left"
                        >
                          <span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-[#f5f5f5]">
                            {target.photo_url ? (
                              <img
                                src={target.photo_url}
                                alt=""
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <UserRound size={17} className="text-ink-mute" />
                            )}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13px] font-medium text-ink">
                              {name}
                            </span>
                            {target.username && (
                              <span className="block truncate text-[11px] text-ink-mute">
                                @{target.username}
                              </span>
                            )}
                          </span>
                          <Forward size={16} className="text-ink-mute" />
                        </button>
                      );
                    })}
                  {forwardQuery.trim() &&
                    !forwardLoading &&
                    forwardUsers.length === 0 && (
                      <p className="px-2 py-3 text-[12px] text-ink-mute">
                        Kontak tidak ditemukan.
                      </p>
                    )}
                </div>
              </div>
            </section>
          </div>,
          document.body,
        )}

      {toast &&
        mounted &&
        createPortal(
          <div
            role="status"
            className="fixed bottom-20 left-1/2 z-[90] -translate-x-1/2 rounded-full bg-ink px-4 py-2 text-[12px] text-white shadow-lg"
          >
            {toast}
          </div>,
          document.body,
        )}
    </>
  );
}