"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
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
  ListChecks,
  Bell,
  BellOff,
  Send,
} from "lucide-react";
import { useRealtime } from "@/lib/use-realtime";
import { ChatComposer } from "@/components/ChatComposer";
import { ChatMessageBubble, chatMessageTime } from "@/components/ChatMessageBubble";
import { ClearChatsDialog } from "@/components/ClearChatsDialog";
import { TelegramAvatar } from "@/components/TelegramAvatar";
import { VerifiedName } from "@/components/VerifiedName";
import { playReceiveSound, playSendSound } from "@/lib/chat-sounds";
import { chatPreviewText } from "@/lib/chat-preview";

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

type ForwardContact = {
  uid: number;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  photo_url: string | null;
};

const MARK_READ_THROTTLE_MS = 400;
const SWIPE_TRIGGER = 55;
const SWIPE_MAX = 88;
const SELECT_GRACE_MS = 500;
const LONG_PRESS_MS = 400;
const MOVE_THRESHOLD = 15;
const MUTE_KEY_PREFIX = "cheya-system-muted:";

type ViewportState = {
  top: number;
  height: number;
  keyboard: boolean;
  keyboardInset: number;
};

function formatDateSeparator(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  const startOfDay = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const todayStart = startOfDay(now);
  const messageStart = startOfDay(date);
  const diffDays = Math.round((todayStart - messageStart) / 86_400_000);

  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) {
    return date.toLocaleDateString("id-ID", { weekday: "long" });
  }
  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString("id-ID", { day: "numeric", month: "long" });
  }
  return date.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function computeUserDisplayName(user: TelegramUser | null): string {
  if (!user) return "Anda";
  const full = [user.first_name, user.last_name].filter(Boolean).join(" ").trim();
  if (full) return full;
  if (user.username) return user.username;
  return "Anda";
}

function contactLabel(user: ForwardContact): string {
  if (user.username) return user.username;
  const fullName = [user.first_name, user.last_name].filter(Boolean).join(" ").trim();
  return fullName || `Telegram ${user.uid}`;
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
    return <CheckCheck size={13} strokeWidth={2.2} className="text-sky-400" />;
  }
  if (deliveredAt) {
    return <CheckCheck size={13} strokeWidth={2.2} className="text-white/75" />;
  }
  return <Check size={13} strokeWidth={2.2} className="text-white/75" />;
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
  const pressWasLongPressRef = useRef(false);
  const justEnteredSelectRef = useRef(false);
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
  const selectModeRef = useRef(false);
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
  const [replyingTo, setReplyingTo] = useState<ChatItem | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [forwardOpen, setForwardOpen] = useState(false);
  const [forwardQuery, setForwardQuery] = useState("");
  const [forwardUsers, setForwardUsers] = useState<ForwardContact[]>([]);
  const [forwardLoading, setForwardLoading] = useState(false);
  const [forwardTargets, setForwardTargets] = useState<string[]>([]);
  const [forwardSelectedUids, setForwardSelectedUids] = useState<number[]>([]);
  const [forwarding, setForwarding] = useState(false);
  const [contacts, setContacts] = useState<ForwardContact[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contactsLoaded, setContactsLoaded] = useState(false);
  const [toast, setToast] = useState("");
  const [clearDialogMode, setClearDialogMode] = useState<"all" | "selected" | null>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [swipe, setSwipe] = useState<{ id: string; offset: number } | null>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [muted, setMuted] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [viewport, setViewport] = useState<ViewportState>({
    top: 0,
    height: 0,
    keyboard: false,
    keyboardInset: 0,
  });
  const [vvOffset, setVvOffset] = useState(0);

  const mutedRef = useRef(false);

  function showToast(message: string) {
    setToast(message);
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(""), 2600);
  }

  function handleTextChange(value: string) {
    setText(value);
  }

  useEffect(() => {
    selectModeRef.current = selectMode;
  }, [selectMode]);

  useEffect(() => {
    try {
      const value = window.localStorage.getItem(`${MUTE_KEY_PREFIX}${uid}`) === "1";
      setMuted(value);
      mutedRef.current = value;
    } catch {}
  }, [uid]);

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

  const selectedItemsList = useMemo(
    () => chatItems.filter((it) => selectedIds.has(it.id)),
    [chatItems, selectedIds],
  );

  function enterSelectMode(id: string) {
    justEnteredSelectRef.current = true;
    setSelectMode(true);
    setSelectedIds(new Set([id]));
    setMenuOpen(false);
    window.setTimeout(() => {
      justEnteredSelectRef.current = false;
    }, SELECT_GRACE_MS);
  }

  function enterSelectModeEmpty() {
    justEnteredSelectRef.current = false;
    setSelectMode(true);
    setSelectedIds(new Set());
    setMenuOpen(false);
  }

  function exitSelectMode() {
    justEnteredSelectRef.current = false;
    setSelectMode(false);
    setSelectedIds(new Set());
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      if (next.size === 0) setSelectMode(false);
      return next;
    });
  }

  function toggleMuted() {
    const next = !muted;
    try {
      window.localStorage.setItem(
        `${MUTE_KEY_PREFIX}${uid}`,
        next ? "1" : "0",
      );
      setMuted(next);
      mutedRef.current = next;
      setMenuOpen(false);
      showToast(
        next
          ? "Browser notifications muted for this chat."
          : "Browser notifications enabled for this chat.",
      );
    } catch {
      showToast("Could not save notification preference.");
    }
  }

  function clearLongPressTimer() {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }

  function startChatItemPress(event: React.PointerEvent, item: ChatItem) {
    if (item._pending) return;
    if (selectModeRef.current) return;
    pressOriginRef.current = { x: event.clientX, y: event.clientY };
    pressWasLongPressRef.current = false;
    swipeRef.current = {
      id: item.id,
      mine: item.sender === "user",
      startX: event.clientX,
      startY: event.clientY,
      active: false,
      offset: 0,
    };
    if (event.pointerType === "mouse") return;
    clearLongPressTimer();
    longPressTimerRef.current = window.setTimeout(() => {
      longPressTriggeredAtRef.current = Date.now();
      pressWasLongPressRef.current = true;
      if (!selectModeRef.current) {
        enterSelectMode(item.id);
      } else if (!justEnteredSelectRef.current) {
        toggleSelect(item.id);
      }
      longPressTimerRef.current = null;
    }, LONG_PRESS_MS);
  }

  function moveChatItemPress(event: React.PointerEvent) {
    const s = swipeRef.current;
    if (!s) return;
    const dx = event.clientX - s.startX;
    const dy = event.clientY - s.startY;
    if (!s.active) {
      if (Math.abs(dx) < MOVE_THRESHOLD && Math.abs(dy) < MOVE_THRESHOLD) return;
      s.active = true;
      clearLongPressTimer();
    }
    const isVertical = Math.abs(dx) < Math.abs(dy);
    const wrongDirection = (s.mine && dx > 0) || (!s.mine && dx < 0);
    if (isVertical || wrongDirection || selectModeRef.current) {
      s.offset = 0;
      return;
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

  function stopChatItemPress() {
    clearLongPressTimer();
    const s = swipeRef.current;
    if (!s) return;
    swipeRef.current = null;
    const wasLongPress = pressWasLongPressRef.current;
    pressWasLongPressRef.current = false;
    const wasGesture = s.active;
    const wasSwipe =
      wasGesture && Math.abs(s.offset) >= SWIPE_TRIGGER && !selectModeRef.current;
    setSwipe(null);
    if (wasSwipe) {
      const target = chatItemsRef.current.find((it) => it.id === s.id);
      if (target) beginReply(target);
      return;
    }
    if (
      !wasGesture &&
      !wasLongPress &&
      selectModeRef.current &&
      !justEnteredSelectRef.current
    ) {
      toggleSelect(s.id);
    }
  }

  function cancelChatItemPress() {
    clearLongPressTimer();
    swipeRef.current = null;
    pressWasLongPressRef.current = false;
    setSwipe(null);
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
      if (selectModeRef.current) {
        setSelectMode(false);
        setSelectedIds(new Set());
        selectModeRef.current = false;
        justEnteredSelectRef.current = false;
        window.history.pushState({ chatRoom: true }, "", window.location.href);
        return;
      }
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
      setMessages((prev) => prev.filter((message) => message.id !== messageId));
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
      playReceiveSound();
      markReadRef.current?.();
      router.refresh();
      return;
    }
    if (event.type === "notification:read") {
      markReadRef.current?.();
      return;
    }
  });

  const visibleChatItems = searchText.trim()
    ? chatItems.filter((item) =>
        item.content.toLowerCase().includes(searchText.trim().toLowerCase()),
      )
    : chatItems;

  useEffect(() => {
    if (!forwardOpen) return;
    if (contactsLoaded || contactsLoading) return;
    let cancelled = false;
    setContactsLoading(true);
    fetch("/api/chats/contacts", { cache: "no-store" })
      .then((res) => res.json())
      .then((json) => {
        if (cancelled) return;
        if (json?.ok === true && Array.isArray(json.contacts)) {
          setContacts(json.contacts);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) {
          setContactsLoading(false);
          setContactsLoaded(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [forwardOpen, contactsLoaded, contactsLoading]);

  useEffect(() => {
    if (!forwardOpen) return;
    const term = forwardQuery.trim();
    if (!term) {
      setForwardUsers([]);
      setForwardLoading(false);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setForwardLoading(true);
      try {
        const response = await fetch(
          `/api/users/search?q=${encodeURIComponent(term)}`,
          { signal: controller.signal },
        );
        if (!response.ok) {
          throw new Error(`Pencarian kontak gagal (${response.status}).`);
        }
        const result = await response.json();
        setForwardUsers(Array.isArray(result.users) ? result.users : []);
      } catch (error) {
        if (controller.signal.aborted) return;
        setForwardUsers([]);
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
    exitSelectMode();
    requestAnimationFrame(() => taRef.current?.focus());
  }

  function beginEdit(item: ChatItem) {
    if (!item.messageId || item.sender !== "user" || item.deleted_at) return;
    setEditingId(item.messageId);
    setReplyingTo(null);
    setText(item.content);
    exitSelectMode();
    requestAnimationFrame(() => taRef.current?.focus());
  }

  async function copySelected() {
    const texts = selectedItemsList
      .filter((it) => !it.deleted_at)
      .map((it) => chatPreviewText(it.content))
      .filter(Boolean);
    if (texts.length === 0) return;
    try {
      await navigator.clipboard.writeText(texts.join("\n\n"));
      showToast("Pesan disalin.");
    } catch {
      showToast("Pesan tidak dapat disalin. Periksa izin clipboard browser.");
    }
    exitSelectMode();
  }

  async function deleteOneItem(item: ChatItem, scope: "me" | "everyone") {
    if (item.source === "notification" && item.notificationId) {
      const response = await fetch(
        `/api/notifications/${encodeURIComponent(uid)}?id=${encodeURIComponent(item.notificationId)}`,
        { method: "DELETE" },
      );
      if (!response.ok) throw new Error("Pesan gagal dihapus.");
      setHiddenNotificationIds((current) => new Set(current).add(item.notificationId!));
      return;
    }
    if (!item.messageId) return;
    const response = await fetch(
      `/api/messages/${encodeURIComponent(uid)}?messageId=${encodeURIComponent(item.messageId)}&scope=${scope}`,
      { method: "DELETE" },
    );
    if (!response.ok) throw new Error("Pesan gagal dihapus.");
    setMessages((current) =>
      current.filter((message) => message.id !== item.messageId),
    );
  }

  async function deleteSelected() {
    if (selectedItemsList.length === 0) return;
    setClearDialogMode("selected");
  }

  async function deleteSelectedWithScope(scope: "me" | "everyone") {
    const snapshot = selectedItemsList.slice();

    const notifIds = snapshot
      .filter((it) => it.source === "notification" && it.notificationId)
      .map((it) => it.notificationId!);
    const msgIds = snapshot
      .filter((it) => it.source === "message" && it.messageId)
      .map((it) => it.messageId!);

    setMessages((current) => current.filter((m) => !msgIds.includes(m.id)));
    if (notifIds.length > 0) {
      setHiddenNotificationIds((current) => {
        const next = new Set(current);
        for (const id of notifIds) next.add(id);
        return next;
      });
    }
    exitSelectMode();

    try {
      await Promise.all([
        ...notifIds.map((id) =>
          fetch(
            `/api/notifications/${encodeURIComponent(uid)}?id=${encodeURIComponent(id)}`,
            { method: "DELETE" },
          ).then((res) => {
            if (!res.ok) throw new Error("Pesan gagal dihapus.");
          }),
        ),
        ...msgIds.map((id) =>
          fetch(
            `/api/messages/${encodeURIComponent(uid)}?messageId=${encodeURIComponent(id)}&scope=${scope}`,
            { method: "DELETE" },
          ).then((res) => {
            if (!res.ok) throw new Error("Pesan gagal dihapus.");
          }),
        ),
      ]);
      showToast("Pesan dihapus.");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Pesan gagal dihapus.");
    }
  }

  async function clearMessages(scope: "me" | "everyone") {
    if (clearing) return;
    const list = chatItemsRef.current.slice();
    if (list.length === 0) {
      setMenuOpen(false);
      setClearDialogMode(null);
      return;
    }
    const messageSnapshot = messages.slice();
    const hiddenSnapshot = hiddenNotificationIds;
    setClearing(true);
    setMenuOpen(false);
    setClearDialogMode(null);
    setMessages([]);
    setHiddenNotificationIds(new Set(notifications.map((n) => n.id)));
    try {
      await Promise.all(
        list.map((item) => {
          if (item.source === "notification" && item.notificationId) {
            return fetch(
              `/api/notifications/${encodeURIComponent(uid)}?id=${encodeURIComponent(item.notificationId)}`,
              { method: "DELETE" },
            ).then((response) => {
              if (!response.ok) throw new Error("Some messages could not be cleared.");
            });
          }
          if (item.messageId) {
            return fetch(
              `/api/messages/${encodeURIComponent(uid)}?messageId=${encodeURIComponent(item.messageId)}&scope=${scope}`,
              { method: "DELETE" },
            ).then((response) => {
              if (!response.ok) throw new Error("Some messages could not be cleared.");
            });
          }
          return Promise.resolve();
        }),
      );
      showToast(scope === "everyone" ? "Chat cleared for everyone." : "Chat cleared for you.");
    } catch {
      setMessages(messageSnapshot);
      setHiddenNotificationIds(hiddenSnapshot);
      showToast("Failed to clear chat.");
    } finally {
      setClearing(false);
    }
  }

  function replySelected() {
    if (selectedItemsList.length !== 1) return;
    const it = selectedItemsList[0];
    if (it.deleted_at || !it.replyTargetId) return;
    beginReply(it);
  }

  function editSelected() {
    if (selectedItemsList.length !== 1) return;
    beginEdit(selectedItemsList[0]);
  }

  function openForwardFromSelection() {
    const ids = selectedItemsList
      .filter((it) => !it.deleted_at && it.replyTargetId)
      .map((it) => it.replyTargetId!);
    if (ids.length === 0) return;
    setForwardTargets(ids);
    setForwardSelectedUids([]);
    setForwardQuery("");
    setForwardUsers([]);
    setForwardOpen(true);
  }

  function toggleForwardContact(targetUid: number) {
    setForwardSelectedUids((current) =>
      current.includes(targetUid)
        ? current.filter((uid) => uid !== targetUid)
        : [...current, targetUid],
    );
  }

  async function forwardMessages() {
    if (
      forwarding ||
      forwardTargets.length === 0 ||
      forwardSelectedUids.length === 0
    ) return;
    const ids = forwardTargets.slice();
    const targetUids = forwardSelectedUids.filter(
      (targetUid) => targetUid !== Number(uid),
    );
    if (targetUids.length === 0) {
      showToast("Pilih kontak lain untuk meneruskan pesan.");
      return;
    }
    setForwarding(true);
    try {
      const results = await Promise.all(
        targetUids.map(async (targetUid) => {
          const responses = await Promise.all(
            ids.map((id) =>
              fetch(`/api/messages/${encodeURIComponent(uid)}/actions`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  action: "forward",
                  messageId: id,
                  targetUid,
                }),
              }),
            ),
          );
          return responses.every((response) => response.ok);
        }),
      );
      const sentCount = results.filter(Boolean).length;
      const failedCount = results.length - sentCount;
      if (sentCount > 0) {
        showToast(
          failedCount > 0
            ? `Pesan diteruskan ke ${sentCount} kontak; ${failedCount} gagal.`
            : `Pesan diteruskan ke ${sentCount} kontak.`,
        );
      } else {
        showToast("Pesan gagal diteruskan. Coba lagi.");
      }
      if (failedCount > 0) {
        setForwardSelectedUids(
          targetUids.filter((_targetUid, index) => !results[index]),
        );
      }
      if (failedCount === 0) {
        setForwardOpen(false);
        setForwardTargets([]);
        setForwardSelectedUids([]);
        setForwardQuery("");
        setForwardUsers([]);
        exitSelectMode();
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Pesan gagal diteruskan.");
    } finally {
      setForwarding(false);
    }
  }

  const vvApplied = viewport.keyboard ? vvOffset : 0;
  const footerBottom = viewport.keyboard
    ? Math.max(0, viewport.keyboardInset - vvOffset)
    : 0;

  const canEditSelected =
    selectedItemsList.length === 1 &&
    selectedItemsList[0].source === "message" &&
    selectedItemsList[0].sender === "user" &&
    !selectedItemsList[0].deleted_at;
  const hasUndeletedSelection = selectedItemsList.some((item) => !item.deleted_at);

  const filteredContacts = useMemo(() => {
    const term = forwardQuery.trim().toLowerCase();
    if (!term) return contacts;
    return contacts.filter((c) => {
      const fullName = [c.first_name, c.last_name]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      const username = (c.username ?? "").toLowerCase();
      return fullName.includes(term) || username.includes(term);
    });
  }, [contacts, forwardQuery]);

  const mergedForwardUsers = useMemo(() => {
    const map = new Map<number, ForwardContact>();
    for (const c of filteredContacts) {
      if (c.uid !== Number(uid)) map.set(c.uid, c);
    }
    for (const u of forwardUsers) {
      if (u.uid !== Number(uid) && !map.has(u.uid)) {
        map.set(u.uid, u as ForwardContact);
      }
    }
    return Array.from(map.values());
  }, [filteredContacts, forwardUsers, uid]);

  const header = (
    <header
      ref={menuRootRef}
      className="fixed left-0 right-0 z-40 bg-transparent pt-[calc(12px+env(safe-area-inset-top))] pb-3"
      style={{ top: vvApplied }}
    >
      <div className="relative mx-auto max-w-[600px] px-5">
        {selectMode ? (
          <div className="flex items-center gap-2 -mx-3">
            <button
              type="button"
              onClick={exitSelectMode}
              aria-label="Close selection"
              className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full border border-[#dfe3e8] bg-white text-ink-soft shadow-sm transition-transform active:scale-90"
            >
              <X size={21} />
            </button>
            <div className="flex h-11 min-w-0 flex-1 items-center rounded-full border border-[#dfe3e8] bg-white px-4 shadow-sm">
              <span className="truncate text-[14px] font-semibold text-ink">
                {selectedIds.size} selected
              </span>
            </div>
            <div className="flex h-11 flex-shrink-0 items-center overflow-hidden rounded-full border border-[#dfe3e8] bg-white shadow-sm">
              {hasUndeletedSelection && (
                <>
                  <button
                    type="button"
                    onClick={() => void copySelected()}
                    aria-label="Copy messages"
                    className="flex h-full w-10 items-center justify-center text-ink-soft transition-colors active:bg-[#f5f5f5]"
                  >
                    <Copy size={17} strokeWidth={2.2} />
                  </button>
                  <button
                    type="button"
                    onClick={openForwardFromSelection}
                    aria-label="Forward messages"
                    className="flex h-full w-10 items-center justify-center text-ink-soft transition-colors active:bg-[#f5f5f5]"
                  >
                    <Forward size={17} strokeWidth={2.2} />
                  </button>
                </>
              )}
              {canEditSelected && (
                <button
                  type="button"
                  onClick={editSelected}
                  aria-label="Edit message"
                  className="flex h-full w-10 items-center justify-center text-ink-soft transition-colors active:bg-[#f5f5f5]"
                >
                  <Pencil size={17} strokeWidth={2.2} />
                </button>
              )}
              <button
                type="button"
                onClick={() => void deleteSelected()}
                aria-label="Delete messages"
                className="flex h-full w-10 items-center justify-center text-danger transition-colors active:bg-[#f5f5f5]"
              >
                <Trash2 size={17} strokeWidth={2.2} />
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 -mx-3">
              <Link
                href={`/${uid}/chat`}
                aria-label="Back to chat"
                className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full border border-[#dfe3e8] bg-white text-ink-soft transition-transform active:scale-90"
              >
                <ArrowLeft size={21} />
              </Link>
              <div className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-full border border-[#dfe3e8] bg-white pl-0.5 pr-3">
                <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border border-line bg-[#f5f5f5]">
                  <TelegramAvatar src="/icon.png" />
                </span>
                <span className="flex min-w-0 flex-1 flex-col justify-center self-stretch">
                  <VerifiedName
                    name="CheyaVerse"
                    size="sm"
                    nameClassName="text-[15px] leading-tight"
                  />
                  <span className="block truncate text-[12px] leading-tight text-ink-mute -mt-0.5">
                    service notifications
                  </span>
                </span>
              </div>
              <button
                type="button"
                aria-label="Chat options"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((value) => !value)}
                className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full border border-[#dfe3e8] bg-white text-ink-soft transition-transform active:scale-90"
              >
                <MoreVertical size={19} />
              </button>
            </div>
            {menuOpen && (
              <div className="absolute right-5 top-[calc(100%-4px)] z-50 w-64 overflow-hidden rounded-2xl border border-line bg-white py-1 shadow-xl animate-fade-up">
                <button
                  type="button"
                  onClick={enterSelectModeEmpty}
                  className="flex w-full items-center gap-2 px-4 py-3 text-left text-[13px] text-ink"
                >
                  <ListChecks size={15} /> Select messages
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    setClearDialogMode("all");
                  }}
                  className="flex w-full items-center gap-2 px-4 py-3 text-left text-[13px] text-danger"
                >
                  <Trash2 size={15} /> Clear chats
                </button>
                <button
                  type="button"
                  onClick={toggleMuted}
                  className="flex w-full items-center gap-2 border-t border-line px-4 py-3 text-left text-[13px] text-ink"
                >
                  {muted ? <Bell size={15} /> : <BellOff size={15} />}
                  {muted
                    ? "Unmute browser notifications"
                    : "Mute browser notifications"}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </header>
  );

  const footer = selectMode ? (
    <footer
      className="chat-footer pointer-events-none fixed left-0 right-0 z-30 bg-transparent"
      style={{ bottom: footerBottom }}
    >
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0"
        style={{
          height: "120px",
          background:
            "linear-gradient(to top, #ffffff 0%, #ffffff 60%, rgba(255,255,255,0) 100%)",
        }}
      />
      <div
        className="pointer-events-auto relative mx-auto flex max-w-[600px] gap-2 px-3 pt-2"
        style={{
          paddingBottom: viewport.keyboard
            ? "8px"
            : "calc(8px + env(safe-area-inset-bottom))",
        }}
      >
        {selectedIds.size === 1 && hasUndeletedSelection && (
          <button
            type="button"
            onClick={replySelected}
            className="flex flex-1 items-center justify-center gap-2 rounded-[22px] border border-line bg-white py-2.5 text-[14px] font-semibold text-ink shadow-sm transition-colors active:bg-[#f5f5f5]"
          >
            <Reply size={18} strokeWidth={2.2} /> Reply
          </button>
        )}
        {hasUndeletedSelection && (
          <button
            type="button"
            onClick={openForwardFromSelection}
            className="flex flex-1 items-center justify-center gap-2 rounded-[22px] border border-line bg-white py-2.5 text-[14px] font-semibold text-ink shadow-sm transition-colors active:bg-[#f5f5f5]"
          >
            <Forward size={18} strokeWidth={2.2} /> Forward
          </button>
        )}
      </div>
    </footer>
  ) : (
    <footer
      className="chat-footer pointer-events-none fixed left-0 right-0 z-30 bg-transparent"
      style={{ bottom: footerBottom }}
    >
      {showScrollButton && (
        <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-3">
          <button
            type="button"
            onClick={scrollToBottom}
            aria-label="Jump to latest message"
            className="pointer-events-auto flex h-10 w-10 items-center justify-center rounded-full border border-line bg-white/90 text-ink-soft shadow-[0_2px_8px_-2px_rgba(0,0,0,.18)] backdrop-blur-md transition-all duration-200 hover:bg-white hover:text-ink hover:shadow-[0_4px_12px_-2px_rgba(0,0,0,.22)] active:scale-95 md:h-11 md:w-11"
          >
            <ArrowDown size={18} strokeWidth={2.2} />
          </button>
        </div>
      )}
      <ChatComposer
        value={text}
        sending={sending}
        sendLabel={editingId ? "Save edit" : "Send message"}
        inputRef={taRef}
        onChange={handleTextChange}
        onSend={() => void sendMessage()}
        onInput={autoGrow}
        reply={
          replyingTo ? (
            <div className="relative flex items-stretch gap-2.5 border-b border-line bg-gradient-to-r from-[#f6f6f6] to-[#fafafa] px-3 py-2 pr-10">
              <span className="w-1 flex-shrink-0 rounded-full bg-ink" />
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
                aria-label="Cancel reply"
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
              <span>Editing message</span>
              <button
                type="button"
                onClick={() => {
                  setEditingId(null);
                  setText("");
                }}
                aria-label="Cancel edit"
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

  let previousDayKey = "";

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
        {searchOpen && !selectMode && (
          <div className="flex flex-shrink-0 items-center gap-2 bg-transparent px-4 py-2">
            <Search size={16} className="text-ink-mute" />
            <input
              autoFocus
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="Search messages"
              className="min-w-0 flex-1 bg-transparent py-1 text-[13px] outline-none"
            />
            <button
              type="button"
              aria-label="Close search"
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
                {searchText ? "No messages found" : "No messages yet"}
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
                  ) ?? null
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
                      if (selectMode) return;
                      event.stopPropagation();
                      scrollToChatItem(item.reply_to_id!);
                    }}
                    className={`mb-1.5 block w-full max-w-full overflow-hidden rounded-xl border-l-4 px-2.5 py-1.5 text-left transition-colors ${
                      isUser
                        ? "border-white/50 bg-white/[.12] active:bg-white/[.22]"
                        : "border-ink/40 bg-black/[.04] active:bg-black/[.09]"
                    }`}
                  >
                    <span
                      className={`block min-w-0 break-words text-[11px] font-semibold leading-tight ${
                        isUser ? "text-white/95" : "text-ink"
                      }`}
                    >
                      {reply?.sender === "bot" ? (
                        <VerifiedName
                          name={repliedName}
                          size="sm"
                          nameClassName={`text-[11px] leading-none ${
                            isUser ? "text-white/95" : "text-ink"
                          }`}
                        />
                      ) : (
                        repliedName
                      )}
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
                    className={`mb-1.5 block max-w-full overflow-hidden rounded-xl border-l-4 px-2.5 py-1.5 ${
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
                      Message
                    </span>
                    <span
                      className={`mt-0.5 block text-[12.5px] leading-tight ${
                        isUser ? "text-white/80" : "text-ink-soft"
                      }`}
                      style={clampStyle}
                    >
                      Reply
                    </span>
                  </span>
                )
              ) : null;
              const isSwiping = swipe?.id === item.id;
              const swipeOffset = isSwiping ? swipe!.offset : 0;
              const swipeProgress = Math.min(1, Math.abs(swipeOffset) / SWIPE_TRIGGER);
              const dayKey = new Date(item.created_at).toDateString();
              const showDaySeparator = dayKey !== previousDayKey;
              previousDayKey = dayKey;
              return (
                <Fragment key={item.id}>
                  {showDaySeparator && (
                    <div className="my-2 flex items-center justify-center">
                      <span className="rounded-full bg-[#eef0f2] px-3 py-1 text-[11px] font-semibold tracking-[-.005em] text-ink-mute">
                        {formatDateSeparator(item.created_at)}
                      </span>
                    </div>
                  )}
                  <div
                    id={item.id}
                    className="relative w-full min-w-0"
                    style={{ touchAction: "pan-y" }}
                  >
                    {isSwiping && !selectMode && (
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
                        transform: isSwiping && !selectMode ? `translate3d(${swipeOffset}px, 0, 0)` : undefined,
                        transition: isSwiping && !selectMode ? "none" : "transform 200ms cubic-bezier(.2,.8,.2,1)",
                        willChange: "transform",
                      }}
                    >
                      <ChatMessageBubble
                        outgoing={isUser}
                        avatarUrl={isUser ? `/api/avatar/${uid}` : "/icon.png"}
                        content={item.deleted_at ? "Pesan dihapus" : item.content}
                        richText={item.sender === "bot" && !item.deleted_at}
                        markdown={item.sender === "user" && !item.deleted_at}
                        linkPreview={!item.deleted_at}
                        timestamp={chatMessageTime(item.created_at)}
                        status={
                          <StatusIcon
                            pending={item._pending}
                            deliveredAt={item.delivered_at}
                            readAt={item.read_at}
                          />
                        }
                        label={`Message from ${isUser ? "you" : "CheyaVerse"}`}
                        pending={item._pending}
                        deleted={Boolean(item.deleted_at)}
                        edited={Boolean(item.edited_at && !item.deleted_at)}
                        pinned={item.is_pinned}
                        highlight={highlightedId === item.id}
                        prefix={prefix}
                        selectMode={selectMode}
                        selected={selectedIds.has(item.id)}
                        onToggleSelect={() => {
                          if (justEnteredSelectRef.current) return;
                          if (!item._pending) toggleSelect(item.id);
                        }}
                        onPointerDown={(event) => {
                          if (!item._pending) startChatItemPress(event, item);
                        }}
                        onPointerMove={moveChatItemPress}
                        onPointerUp={() => stopChatItemPress()}
                        onPointerCancel={cancelChatItemPress}
                        onContextMenu={(event) => {
                          event.preventDefault();
                          if (item._pending) return;
                          if (justEnteredSelectRef.current) return;
                          longPressTriggeredAtRef.current = Date.now();
                          if (!selectModeRef.current) {
                            enterSelectMode(item.id);
                          } else {
                            toggleSelect(item.id);
                          }
                        }}
                        onDoubleClick={(event) => {
                          event.preventDefault();
                          if (item._pending) return;
                          if (selectModeRef.current) return;
                          if (justEnteredSelectRef.current) return;
                          enterSelectMode(item.id);
                        }}
                      />
                    </div>
                  </div>
                </Fragment>
              );
            })
          )}
        </div>
      </section>
      {mounted && createPortal(footer, document.body)}

      {forwardOpen && forwardTargets.length > 0 && (
        <div
          role="presentation"
          onClick={() => {
            if (forwarding) return;
            setForwardOpen(false);
            setForwardTargets([]);
            setForwardSelectedUids([]);
            setForwardQuery("");
            setForwardUsers([]);
          }}
          className="fixed inset-0 z-[80] flex items-end justify-center bg-black/30 px-0 pb-0 md:items-center md:px-5 md:pb-0"
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Forward message"
            onClick={(event) => event.stopPropagation()}
            className="flex w-full max-w-[600px] flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl md:max-w-[520px] md:rounded-2xl"
          >
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <h2 className="text-[14px] font-semibold text-ink">
                Forward {forwardTargets.length === 1 ? "message" : "messages"}
              </h2>
              <button
                type="button"
                aria-label="Close"
                disabled={forwarding}
                onClick={() => {
                  setForwardOpen(false);
                  setForwardTargets([]);
                  setForwardSelectedUids([]);
                  setForwardQuery("");
                  setForwardUsers([]);
                }}
              >
                <X size={18} className="text-ink-mute" />
              </button>
            </div>
            <div className="px-4 pt-3">
              <div className="flex items-center gap-2 rounded-xl border border-line px-3 py-2">
                <Search size={15} className="text-ink-mute" />
                <input
                  autoFocus
                  value={forwardQuery}
                  onChange={(event) => setForwardQuery(event.target.value)}
                  placeholder="Search contacts"
                  className="min-w-0 flex-1 bg-transparent text-[13px] outline-none"
                />
              </div>
            </div>
            <div className="px-2 pt-3">
              <div className="flex gap-3 overflow-x-auto px-2 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {mergedForwardUsers.map((contact) => (
                  <button
                    key={contact.uid}
                    type="button"
                    role="checkbox"
                    aria-checked={forwardSelectedUids.includes(contact.uid)}
                    disabled={forwarding}
                    onClick={() => toggleForwardContact(contact.uid)}
                    className="flex w-[72px] flex-shrink-0 flex-col items-center gap-1.5"
                  >
                    <span className="relative flex h-14 w-14 items-center justify-center overflow-hidden rounded-full border border-line bg-[#f5f5f5]">
                      <TelegramAvatar
                        src={contact.photo_url || `/api/avatar/${contact.uid}`}
                        fallbackSrc={`/api/avatar/${contact.uid}`}
                      />
                      {forwardSelectedUids.includes(contact.uid) && (
                        <span className="absolute bottom-2 right-2 flex h-[19px] w-[19px] items-center justify-center rounded-full border-2 border-white bg-emerald-600 text-white">
                          <Check size={12} strokeWidth={3} />
                        </span>
                      )}
                    </span>
                    <span className="w-full truncate text-center text-[11px] leading-tight text-ink">
                      {contactLabel(contact)}
                    </span>
                  </button>
                ))}
                {contactsLoading && mergedForwardUsers.length === 0 && (
                  <p className="px-2 py-3 text-[12px] text-ink-mute">
                    Loading contacts…
                  </p>
                )}
                {!contactsLoading &&
                  forwardLoading &&
                  mergedForwardUsers.length === 0 && (
                    <p className="px-2 py-3 text-[12px] text-ink-mute">
                      Searching…
                    </p>
                  )}
                {!contactsLoading &&
                  !forwardLoading &&
                  mergedForwardUsers.length === 0 && (
                    <p className="px-2 py-3 text-[12px] text-ink-mute">
                      No contacts found.
                    </p>
                  )}
              </div>
            </div>
            <footer className="border-t border-line p-3">
              <button
                type="button"
                onClick={() => void forwardMessages()}
                disabled={forwarding || forwardSelectedUids.length === 0}
                className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-ink px-4 text-[13px] font-semibold text-white disabled:opacity-45"
              >
                <Send size={15} />
                {forwarding
                  ? "Mengirim…"
                  : `Kirim ke ${forwardSelectedUids.length} kontak`}
              </button>
            </footer>
          </section>
        </div>
      )}

      <ClearChatsDialog
        open={clearDialogMode !== null}
        title={clearDialogMode === "selected" ? "Delete selected messages?" : "Clear chats?"}
        description={
          clearDialogMode === "selected"
            ? `Remove ${selectedItemsList.length} selected item${selectedItemsList.length === 1 ? "" : "s"} from this chat.`
            : "Remove all items from this chat. This action cannot be undone."
        }
        confirmLabel={clearDialogMode === "selected" ? "Delete messages" : "Clear chats"}
        allowEveryone={
          clearDialogMode === "selected"
            ? selectedItemsList.length > 0 &&
              selectedItemsList.every(
                (item) =>
                  item.source === "message" &&
                  (item.sender === "user" || Boolean(item.deleted_at)),
              )
            : chatItemsRef.current.length > 0 &&
              chatItemsRef.current.every(
                (item) =>
                  item.source === "message" &&
                  (item.sender === "user" || Boolean(item.deleted_at)),
              )
        }
        busy={clearing}
        onClose={() => setClearDialogMode(null)}
        onConfirm={(forEveryone) => {
          if (clearDialogMode === "selected") {
            setClearDialogMode(null);
            void deleteSelectedWithScope(forEveryone ? "everyone" : "me");
          } else {
            void clearMessages(forEveryone ? "everyone" : "me");
          }
        }}
      />

      {toast && (
        <div
          role="status"
          className="fixed bottom-20 left-1/2 z-[90] -translate-x-1/2 rounded-full bg-ink px-4 py-2 text-[12px] text-white shadow-lg"
        >
          {toast}
        </div>
      )}
    </>
  );
}