"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
  Send,
} from "lucide-react";
import { TelegramAvatar } from "@/components/TelegramAvatar";
import { ChatComposer } from "@/components/ChatComposer";
import { ChatMessageBubble, chatMessageTime } from "@/components/ChatMessageBubble";
import { VerifiedName } from "@/components/VerifiedName";
import { ContactQrModal } from "@/components/ContactQrModal";
import { ClearChatsDialog } from "@/components/ClearChatsDialog";
import type { DirectMessage, TelegramUser } from "@/lib/storage";
import { useRealtime } from "@/lib/use-realtime";
import { playSendSound, playReceiveSound } from "@/lib/chat-sounds";
import { chatPreviewText } from "@/lib/chat-preview";

type ChatContact = Pick<
  TelegramUser,
  "uid" | "username" | "first_name" | "last_name" | "photo_url"
> & { role?: string; is_admin?: boolean };
type SearchUser = ChatContact & { is_admin?: boolean };

type ViewportState = {
  top: number;
  height: number;
  keyboard: boolean;
  keyboardInset: number;
};

const SWIPE_TRIGGER = 55;
const SWIPE_MAX = 88;
const SELECT_GRACE_MS = 500;
const LONG_PRESS_MS = 400;
const MOVE_THRESHOLD = 15;

function userName(user: ChatContact): string {
  const fullName = [user.first_name, user.last_name].filter(Boolean).join(" ").trim();
  return fullName || (user.username ? `@${user.username}` : `Telegram ${user.uid}`);
}

function contactLabel(user: ChatContact): string {
  if (user.username) return user.username;
  const fullName = [user.first_name, user.last_name].filter(Boolean).join(" ").trim();
  return fullName || `Telegram ${user.uid}`;
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

function StatusIcon({
  message,
  pending,
}: {
  message: DirectMessage;
  pending: boolean;
}) {
  if (pending) return <Clock3 size={12} className="text-white/65" />;
  if (message.read_at) return <CheckCheck size={14} className="text-sky-400" />;
  if (message.delivered_at)
    return <CheckCheck size={14} className="text-white/75" />;
  return <Check size={14} className="text-white/75" />;
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
  contactIsAdmin,
  firstUnreadId,
  initialMessages,
}: {
  uid: string;
  contact: ChatContact;
  ownPhotoUrl: string | null;
  ownName: string;
  contactIsAdmin: boolean;
  firstUnreadId: string | null;
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
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [forwardOpen, setForwardOpen] = useState(false);
  const [forwardQuery, setForwardQuery] = useState("");
  const [forwardUsers, setForwardUsers] = useState<SearchUser[]>([]);
  const [forwardLoading, setForwardLoading] = useState(false);
  const [forwardTargets, setForwardTargets] = useState<string[]>([]);
  const [forwardSelectedUids, setForwardSelectedUids] = useState<number[]>([]);
  const [forwarding, setForwarding] = useState(false);
  const [contacts, setContacts] = useState<ChatContact[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contactsLoaded, setContactsLoaded] = useState(false);
  const [toast, setToast] = useState("");
  const [contactQrOpen, setContactQrOpen] = useState(false);
  const [clearDialogMode, setClearDialogMode] = useState<"all" | "selected" | null>(null);
  const [mounted, setMounted] = useState(false);
  const [replyingTo, setReplyingTo] = useState<DirectMessage | null>(null);
  const [muted, setMuted] = useState(false);
  const [contactLastSeen, setContactLastSeen] = useState<number | null>(null);
  const [contactOnline, setContactOnline] = useState(false);
  const [contactTyping, setContactTyping] = useState(false);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [swipe, setSwipe] = useState<{ id: string; offset: number } | null>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [unreadMarkerId, setUnreadMarkerId] = useState<string | null>(
    firstUnreadId,
  );
  const [, setPresenceClock] = useState(0);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [clearing, setClearing] = useState(false);
  const presenceLabel = contactTyping
    ? "mengetik..."
    : contactOnline
      ? "online"
      : formatPresence(contactLastSeen);
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
  const refreshRequestedRef = useRef(false);
  const realtimeMessageRevisionRef = useRef(0);
  const receivedSoundIdsRef = useRef(new Set<string>());
  const pendingIdsRef = useRef(new Set<string>());
  const toastTimerRef = useRef<number | null>(null);
  const highlightTimerRef = useRef<number | null>(null);
  const typingActiveRef = useRef(false);
  const typingLastSentAtRef = useRef(0);
  const typingTimeoutRef = useRef<number | null>(null);
  const contactTypingTimeoutRef = useRef<number | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const pressOriginRef = useRef({ x: 0, y: 0 });
  const selectModeRef = useRef(false);
  const justEnteredSelectRef = useRef(false);
  const selectGraceTimerRef = useRef<number | null>(null);
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
  const mutedRef = useRef(false);

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
    if (highlightTimerRef.current !== null)
      window.clearTimeout(highlightTimerRef.current);
    highlightTimerRef.current = window.setTimeout(
      () => setHighlightedId(null),
      1600,
    );
  }, []);

  useEffect(() => {
    selectModeRef.current = selectMode;
  }, [selectMode]);

  const selectedMessages = useMemo(
    () => messages.filter((m) => selectedIds.has(m.id)),
    [messages, selectedIds],
  );

  function enterSelectMode(id: string) {
    justEnteredSelectRef.current = true;
    if (selectGraceTimerRef.current !== null) {
      window.clearTimeout(selectGraceTimerRef.current);
    }
    selectGraceTimerRef.current = window.setTimeout(() => {
      justEnteredSelectRef.current = false;
      selectGraceTimerRef.current = null;
    }, SELECT_GRACE_MS);
    setSelectMode(true);
    setSelectedIds(new Set([id]));
    setMenuOpen(false);
  }

  function enterSelectModeEmpty() {
    justEnteredSelectRef.current = false;
    if (selectGraceTimerRef.current !== null) {
      window.clearTimeout(selectGraceTimerRef.current);
      selectGraceTimerRef.current = null;
    }
    setSelectMode(true);
    setSelectedIds(new Set());
    setMenuOpen(false);
  }

  function exitSelectMode() {
    justEnteredSelectRef.current = false;
    if (selectGraceTimerRef.current !== null) {
      window.clearTimeout(selectGraceTimerRef.current);
      selectGraceTimerRef.current = null;
    }
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

  function clearLongPressTimer() {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }

  function startMessagePress(event: React.PointerEvent, message: DirectMessage) {
    if (pendingIdsRef.current.has(message.id)) return;
    pressOriginRef.current = { x: event.clientX, y: event.clientY };
    swipeRef.current = {
      id: message.id,
      mine: message.sender_uid === myUid,
      startX: event.clientX,
      startY: event.clientY,
      active: false,
      offset: 0,
    };
    if (event.pointerType === "mouse") return;
    clearLongPressTimer();
    longPressTimerRef.current = window.setTimeout(() => {
      if (!selectModeRef.current) {
        enterSelectMode(message.id);
      }
      longPressTimerRef.current = null;
    }, LONG_PRESS_MS);
  }

  function moveMessagePress(event: React.PointerEvent) {
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

  function stopMessagePress() {
    clearLongPressTimer();
    const s = swipeRef.current;
    if (!s) return;
    swipeRef.current = null;
    const wasGesture = s.active;
    const wasSwipe =
      wasGesture && Math.abs(s.offset) >= SWIPE_TRIGGER && !selectModeRef.current;
    setSwipe(null);
    if (wasSwipe) {
      const target = messagesRef.current.find((m) => m.id === s.id);
      if (target) beginReply(target);
    }
  }

  function cancelMessagePress() {
    clearLongPressTimer();
    swipeRef.current = null;
    setSwipe(null);
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
    } catch {}
  }

  function handleTextChange(value: string) {
    if (contact.role === "deleted") return;
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
      window.localStorage.setItem(
        `cheya-chat-muted:${contact.uid}`,
        next ? "1" : "0",
      );
      setMuted(next);
      mutedRef.current = next;
      setMenuOpen(false);
      showToast(
        next
          ? "Chat sounds muted for this contact."
          : "Chat sounds enabled for this contact.",
      );
    } catch {
      showToast("Could not save notification preference.");
    }
  }

  function beginReply(message: DirectMessage) {
    if (contact.role === "deleted" || message.deleted_at) return;
    setReplyingTo(message);
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
    if (refreshBusyRef.current) {
      refreshRequestedRef.current = true;
      return;
    }
    refreshBusyRef.current = true;
    refreshRequestedRef.current = false;
    const revisionAtStart = realtimeMessageRevisionRef.current;
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
      if (revisionAtStart !== realtimeMessageRevisionRef.current) {
        refreshRequestedRef.current = true;
        return;
      }
      const pending = messagesRef.current.filter((message) =>
        pendingIdsRef.current.has(message.id),
      );
      setMessages(
        [...result.items, ...pending].sort((a, b) =>
          a.created_at.localeCompare(b.created_at),
        ),
      );
      setPinned(result.pinned ?? null);
    } catch (error) {
      console.error("[direct-chat] message refresh failed:", error);
      return;
    } finally {
      refreshBusyRef.current = false;
      if (refreshRequestedRef.current) {
        refreshRequestedRef.current = false;
        window.setTimeout(() => void refreshMessages(), 0);
      }
    }
  }, [contact.uid]);

  const refreshPresence = useCallback(async () => {
    try {
      const response = await fetch(`/api/presence?uid=${contact.uid}`, {
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error(`Presence refresh failed: ${response.status}`);
      }
      const result = (await response.json()) as {
        ok?: boolean;
        online?: unknown;
        lastSeen?: unknown;
      };
      if (
        result.ok !== true ||
        typeof result.online !== "boolean" ||
        (result.lastSeen !== null && typeof result.lastSeen !== "number")
      ) {
        throw new Error("Invalid presence response.");
      }
      setContactOnline(result.online);
      setContactLastSeen(
        typeof result.lastSeen === "number" ? result.lastSeen : null,
      );
    } catch (error) {
      console.error("[direct-chat] presence refresh failed:", error);
    }
  }, [contact.uid]);

  useEffect(() => {
    void refreshPresence();
    const refreshWhenActive = () => {
      if (document.visibilityState === "visible") void refreshMessages();
    };
    const refreshInterval = window.setInterval(refreshWhenActive, 5_000);
    const clock = window.setInterval(() => {
      setPresenceClock((value) => value + 1);
      void refreshPresence();
    }, 15_000);
    window.addEventListener("focus", refreshWhenActive);
    window.addEventListener("online", refreshWhenActive);
    document.addEventListener("visibilitychange", refreshWhenActive);
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void refreshPresence();
    };
    window.addEventListener("focus", refreshWhenVisible);
    window.addEventListener("online", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.clearInterval(refreshInterval);
      window.clearInterval(clock);
      window.removeEventListener("focus", refreshWhenActive);
      window.removeEventListener("online", refreshWhenActive);
      document.removeEventListener("visibilitychange", refreshWhenActive);
      window.removeEventListener("focus", refreshWhenVisible);
      window.removeEventListener("online", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [refreshMessages, refreshPresence]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    setUnreadMarkerId(firstUnreadId);
    if (!firstUnreadId) return;
    const timeout = window.setTimeout(() => setUnreadMarkerId(null), 5_000);
    return () => window.clearTimeout(timeout);
  }, [firstUnreadId]);

  useEffect(() => {
    try {
      const value =
        window.localStorage.getItem(`cheya-chat-muted:${contact.uid}`) === "1";
      setMuted(value);
      mutedRef.current = value;
    } catch {}
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
      if (toastTimerRef.current !== null)
        window.clearTimeout(toastTimerRef.current);
      if (highlightTimerRef.current !== null)
        window.clearTimeout(highlightTimerRef.current);
      if (longPressTimerRef.current !== null)
        window.clearTimeout(longPressTimerRef.current);
      if (typingTimeoutRef.current !== null)
        window.clearTimeout(typingTimeoutRef.current);
      if (contactTypingTimeoutRef.current !== null) {
        window.clearTimeout(contactTypingTimeoutRef.current);
      }
      if (selectGraceTimerRef.current !== null) {
        window.clearTimeout(selectGraceTimerRef.current);
        selectGraceTimerRef.current = null;
      }
    };
  }, []);

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
          { cache: "no-store", signal: controller.signal },
        );
        const result = await response.json();
        if (!response.ok || result.ok !== true) {
          throw new Error("Contact search failed.");
        }
        setForwardUsers(Array.isArray(result.users) ? result.users : []);
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return;
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
      if (selectModeRef.current) {
        exitSelectMode();
        selectModeRef.current = false;
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
    if (contact.role === "deleted") {
      setText("");
      setReplyingTo(null);
      setEditingId(null);
      draftReadyRef.current = true;
      try {
        window.localStorage.removeItem(DRAFT_KEY);
      } catch {}
      window.dispatchEvent(new Event("cheya-draft-change"));
      return;
    }
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
          if (typeof parsed?.replyToId === "string")
            parsedReplyId = parsed.replyToId;
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
  }, [contact.role, DRAFT_KEY]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (contact.role === "deleted") {
      try {
        window.localStorage.removeItem(DRAFT_KEY);
      } catch {}
      window.dispatchEvent(new Event("cheya-draft-change"));
      return;
    }
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
  }, [text, replyingTo, contact.role, DRAFT_KEY]);

  useRealtime(uid, (event) => {
    if (event.type === "direct-chat:typing" && event.senderUid === contact.uid) {
      void refreshPresence();
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
        ((incoming.sender_uid === myUid &&
          incoming.recipient_uid === contact.uid) ||
          (incoming.sender_uid === contact.uid &&
            incoming.recipient_uid === myUid))
      ) {
        const isFromContact =
          incoming.sender_uid === contact.uid && incoming.recipient_uid === myUid;
        if (isFromContact) {
          void refreshPresence();
          if (
            !mutedRef.current &&
            !receivedSoundIdsRef.current.has(incoming.id)
          ) {
            receivedSoundIdsRef.current.add(incoming.id);
            if (receivedSoundIdsRef.current.size > 100) {
              const oldestId = receivedSoundIdsRef.current.values().next().value;
              if (oldestId) receivedSoundIdsRef.current.delete(oldestId);
            }
            playReceiveSound();
          }
        }
        if (messagesRef.current.some((message) => message.id === incoming.id))
          return;
        realtimeMessageRevisionRef.current += 1;
        setMessages((current) => {
          const index = current.findIndex(
            (message) => message.id === incoming.id,
          );
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
      }
      return;
    }
    if (event.type === "direct-message:updated") {
      const incoming = event.message as DirectMessage | undefined;
      if (incoming) {
        realtimeMessageRevisionRef.current += 1;
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
      realtimeMessageRevisionRef.current += 1;
      void refreshMessages();
      return;
    }
    if (
      event.type === "direct-message:cleared" &&
      Number(event.contactUid) === contact.uid
    ) {
      realtimeMessageRevisionRef.current += 1;
      setMessages([]);
      setPinned(null);
      return;
    }
    if (
      event.type === "direct-message:cleared-for-me" &&
      Number(event.contactUid) === contact.uid
    ) {
      realtimeMessageRevisionRef.current += 1;
      setMessages([]);
      setPinned(null);
      return;
    }
    if (
      event.type === "direct-message:hidden" &&
      Number(event.contactUid) === contact.uid
    ) {
      realtimeMessageRevisionRef.current += 1;
      const messageId = typeof event.messageId === "string" ? event.messageId : "";
      if (messageId) {
        setMessages((current) =>
          current.filter((message) => message.id !== messageId),
        );
      }
      return;
    }
    if (
      event.type === "direct-message:read" ||
      event.type === "direct-message:delivered"
    ) {
      realtimeMessageRevisionRef.current += 1;
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
    if (contact.role === "deleted") return;
    const content = text.trim();
    if (!content || sending) return;
    stopTyping();
    playSendSound();
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
      setMessages((current) =>
        current.filter((message) => message.id !== tempId),
      );
      setText(content);
      setReplyingTo(replySnapshot);
      showToast(error instanceof Error ? error.message : "Pesan gagal dikirim.");
    } finally {
      setSending(false);
    }
  }

  async function deleteOne(message: DirectMessage, scope: "me" | "everyone") {
    const response = await fetch(
      `/api/chats/${contact.uid}/messages/${encodeURIComponent(message.id)}?scope=${scope}`,
      { method: "DELETE" },
    );
    if (!response.ok) throw new Error("Pesan gagal dihapus.");
    setMessages((current) => current.filter((item) => item.id !== message.id));
  }

  async function copySelected() {
    const texts = selectedMessages.filter((m) => !m.deleted_at).map((m) =>
      m.media_file_id ? "Pesan suara tidak didukung" : m.content,
    );
    if (texts.length === 0) return;
    try {
      await navigator.clipboard.writeText(texts.join("\n\n"));
      showToast("Pesan disalin.");
    } catch {
      showToast("Tidak dapat menyalin pesan.");
    }
    exitSelectMode();
  }

  async function deleteSelected() {
    if (selectedMessages.length === 0) return;
    setClearDialogMode("selected");
  }

  async function deleteSelectedWithScope(scope: "me" | "everyone") {
    const snapshot = selectedMessages.slice();
    setMessages((current) =>
      current.filter((item) => !snapshot.some((m) => m.id === item.id)),
    );
    exitSelectMode();
    try {
      await Promise.all(
        snapshot.map((msg) =>
          fetch(
            `/api/chats/${contact.uid}/messages/${encodeURIComponent(msg.id)}?scope=${scope}`,
            { method: "DELETE" },
          ).then((res) => {
            if (!res.ok) throw new Error("Pesan gagal dihapus.");
          }),
        ),
      );
      showToast("Pesan dihapus.");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Pesan gagal dihapus.");
    }
  }

  async function clearMessages(scope: "me" | "everyone") {
    if (clearing) return;
    const list = messagesRef.current.slice();
    if (list.length === 0) {
      setMenuOpen(false);
      setClearDialogMode(null);
      return;
    }
    const pinnedSnapshot = pinned;
    setClearing(true);
    setMenuOpen(false);
    setClearDialogMode(null);
    setMessages([]);
    try {
      const response = await fetch(`/api/chats/${contact.uid}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: scope === "everyone" ? "clear" : "clear-for-me",
        }),
      });
      if (!response.ok) throw new Error("Chat could not be cleared.");
      setPinned(null);
      showToast(scope === "everyone" ? "Chat cleared for everyone." : "Chat cleared for you.");
    } catch {
      setMessages(list);
      setPinned(pinnedSnapshot);
      showToast("Failed to clear chat.");
    } finally {
      setClearing(false);
    }
  }

  function replySelected() {
    if (contact.role === "deleted") return;
    if (selectedMessages.length !== 1) return;
    if (selectedMessages[0].deleted_at) return;
    beginReply(selectedMessages[0]);
    exitSelectMode();
  }

  function editSelected() {
    if (contact.role === "deleted") return;
    if (selectedMessages.length !== 1) return;
    const msg = selectedMessages[0];
    if (msg.sender_uid !== myUid || msg.deleted_at || msg.media_file_id) return;
    setEditingId(msg.id);
    setText(msg.content);
    exitSelectMode();
    requestAnimationFrame(() => textareaRef.current?.focus());
  }

  function openForwardFromSelection() {
    const messageIds = selectedMessages
      .filter((message) => !message.deleted_at)
      .map((message) => message.id);
    if (messageIds.length === 0) return;
    setForwardTargets(messageIds);
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
      (targetUid) => targetUid !== myUid,
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
              fetch(`/api/chats/${contact.uid}/actions`, {
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

  const canEditSelected =
    selectedMessages.length === 1 &&
    selectedMessages[0].sender_uid === myUid &&
    !selectedMessages[0].deleted_at &&
    !selectedMessages[0].media_file_id;
  const hasUndeletedSelection = selectedMessages.some((message) => !message.deleted_at);

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
    const map = new Map<number, ChatContact>();
    for (const c of filteredContacts) {
      if (c.uid !== myUid) map.set(c.uid, c);
    }
    for (const u of forwardUsers) {
      if (u.uid !== myUid && !map.has(u.uid)) {
        map.set(u.uid, u as ChatContact);
      }
    }
    return Array.from(map.values());
  }, [filteredContacts, forwardUsers, myUid]);

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
              {canEditSelected && contact.role !== "deleted" && (
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
                  <TelegramAvatar
                    src={`/api/avatar/${contact.uid}`}
                    fallbackSrc={contact.photo_url}
                  />
                </span>
                <span className="min-w-0 flex flex-col justify-center self-stretch">
                  {contactIsAdmin ? (
                    <VerifiedName
                      name={headerName}
                      size="sm"
                      compactBadge
                      wrap
                      nameClassName="text-[15px] leading-tight"
                    />
                  ) : (
                    <span className="block truncate text-[15px] font-semibold leading-tight text-ink">
                      {headerName}
                    </span>
                  )}
                  <span
                    className={`block truncate text-[12px] leading-tight -mt-0.5 ${presenceLabel === "online" ? "text-emerald-600" : "text-ink-mute"}`}
                  >
                    {presenceLabel}
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
                  onClick={() => {
                    setMenuOpen(false);
                    setContactQrOpen(true);
                  }}
                  className="flex w-full items-center gap-2 px-4 py-3 text-left text-[13px] text-ink"
                >
                  <Share2 size={15} /> Share contact
                </button>
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
                  onClick={() => setMenuOpen(false)}
                  className="flex w-full items-center gap-2 px-4 py-3 text-left text-[13px] text-danger"
                >
                  <Ban size={15} /> Block contact
                </button>
                <button
                  type="button"
                  onClick={toggleMuted}
                  className="flex w-full items-center gap-2 border-t border-line px-4 py-3 text-left text-[13px] text-ink"
                >
                  {muted ? <Bell size={15} /> : <BellOff size={15} />}
                  {muted
                    ? "Unmute chat sounds"
                    : "Mute chat sounds"}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </header>
  );

  const footer = contact.role === "deleted" ? (
    <footer
      className="chat-footer pointer-events-none fixed left-0 right-0 z-30 flex justify-center px-3 py-3 text-center text-[13px] text-ink-mute"
      style={{ bottom: footerBottom }}
    >
      Akun ini telah dihapus
    </footer>
  ) : selectMode ? (
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
        inputRef={textareaRef}
        onChange={handleTextChange}
        onSend={() => void sendMessage()}
        onInput={(event) => {
          event.currentTarget.style.height = "auto";
          event.currentTarget.style.height = `${Math.min(event.currentTarget.scrollHeight, 120)}px`;
        }}
        reply={
          replyingTo ? (
            <div className="relative flex items-stretch gap-2.5 border-b border-line bg-gradient-to-r from-[#f6f6f6] to-[#fafafa] px-3 py-2 pr-10">
              <span className="w-1 flex-shrink-0 rounded-full bg-ink" />
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
                    : chatPreviewText(replyingTo.content)}
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

        {pinned && !selectMode && (
          <button
            type="button"
            onClick={() => {
              document
                .getElementById(`direct-message-${pinned.id}`)
                ?.scrollIntoView({
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
                {searchText ? "No messages found" : "No messages yet"}
              </p>
              {!searchText && (
                <p className="text-[12.5px] text-ink-mute">
                  Mulai percakapan dengan {name}.
                </p>
              )}
            </div>
          ) : (
            visibleMessages.map((message) => {
              const mine = message.sender_uid === myUid;
              const isPending = pendingIdsRef.current.has(message.id);
              const reply = message.reply_to_id
                ? messages.find((item) => item.id === message.reply_to_id) ??
                  null
                : null;
              const repliedName = repliedSenderName(reply);
              const replyPreview = reply?.media_file_id
                ? "Pesan suara tidak didukung"
                : reply
                  ? chatPreviewText(reply.content) || "Balasan"
                  : "Balasan";
              const prefix =
                message.forwarded_from_uid || message.reply_to_id ? (
                  <>
                    {message.forwarded_from_uid && (
                      <span
                        className={`mb-1.5 block text-[10px] font-medium italic ${mine ? "text-white/65" : "text-ink-mute"}`}
                      >
                        Diteruskan
                      </span>
                    )}
                    {message.reply_to_id && reply && (
                      <button
                        type="button"
                        onClick={(event) => {
                          if (selectMode) return;
                          event.stopPropagation();
                          scrollToMessage(reply.id);
                        }}
                        className={`mb-1.5 block w-full max-w-full overflow-hidden rounded-xl border-l-4 px-2.5 py-1.5 text-left transition-colors ${
                          mine
                            ? "border-white/50 bg-white/[.12] active:bg-white/[.22]"
                            : "border-ink/40 bg-black/[.04] active:bg-black/[.09]"
                        }`}
                      >
                        <span
                          className={`block min-w-0 break-words text-[11px] font-semibold leading-tight ${
                            mine ? "text-white/95" : "text-ink"
                          }`}
                        >
                          {reply?.sender_uid === contact.uid && contactIsAdmin ? (
                            <VerifiedName
                              name={repliedName}
                              size="sm"
                              compactBadge
                              wrap
                              nameClassName={`text-[11px] leading-none ${mine ? "text-white/95" : "text-ink"}`}
                            />
                          ) : (
                            repliedName
                          )}
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
                        className={`mb-1.5 block max-w-full overflow-hidden rounded-xl border-l-4 px-2.5 py-1.5 ${
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
                          Message
                        </span>
                        <span
                          className={`mt-0.5 block text-[12.5px] leading-tight ${
                            mine ? "text-white/80" : "text-ink-soft"
                          }`}
                          style={clampStyle}
                        >
                          Reply
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
              const swipeProgress = Math.min(
                1,
                Math.abs(swipeOffset) / SWIPE_TRIGGER,
              );
              const dayKey = new Date(message.created_at).toDateString();
              const showDaySeparator = dayKey !== previousDayKey;
              previousDayKey = dayKey;
              const showUnreadSeparator =
                unreadMarkerId !== null && message.id === unreadMarkerId;
              return (
                <Fragment key={message.id}>
                  {showDaySeparator && (
                    <div className="my-2 flex items-center justify-center">
                      <span className="rounded-full bg-[#eef0f2] px-3 py-1 text-[11px] font-semibold tracking-[-.005em] text-ink-mute">
                        {formatDateSeparator(message.created_at)}
                      </span>
                    </div>
                  )}
                  {showUnreadSeparator && (
                    <div className="my-2 flex items-center gap-3 px-1">
                      <span className="h-px flex-1 bg-danger/30" />
                      <span className="rounded-full bg-danger/10 px-3 py-1 text-[10.5px] font-bold uppercase tracking-[.08em] text-danger">
                        Unread messages
                      </span>
                      <span className="h-px flex-1 bg-danger/30" />
                    </div>
                  )}
                  <div
                    id={`direct-message-${message.id}`}
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
                        transform:
                          isSwiping && !selectMode
                            ? `translate3d(${swipeOffset}px, 0, 0)`
                            : undefined,
                        transition:
                          isSwiping && !selectMode
                            ? "none"
                            : "transform 200ms cubic-bezier(.2,.8,.2,1)",
                        willChange: "transform",
                      }}
                    >
                      <ChatMessageBubble
                        outgoing={mine}
                        avatarUrl={
                          mine
                            ? `/api/avatar/${myUid}`
                            : `/api/avatar/${contact.uid}`
                        }
                        avatarFallbackUrl={
                          mine
                            ? ownPhotoUrl
                            : contact.photo_url
                        }
                        content={content}
                        timestamp={chatMessageTime(message.created_at)}
                        status={
                          <StatusIcon message={message} pending={isPending} />
                        }
                        prefix={prefix}
                        edited={Boolean(
                          message.edited_at && !message.deleted_at,
                        )}
                        pinned={Boolean(message.is_pinned)}
                        deleted={Boolean(message.deleted_at)}
                        pending={isPending}
                        highlight={highlightedId === message.id}
                        markdown={!message.deleted_at && !message.media_file_id}
                        linkPreview={
                          !message.deleted_at && !message.media_file_id
                        }
                        label={`Message from ${mine ? "you" : name}`}
                        selectMode={selectMode}
                        selected={selectedIds.has(message.id)}
                        onToggleSelect={() => {
                          if (justEnteredSelectRef.current) return;
                          if (!isPending) toggleSelect(message.id);
                        }}
                        onPointerDown={(event) =>
                          startMessagePress(event, message)
                        }
                        onPointerMove={moveMessagePress}
                        onPointerUp={() => stopMessagePress()}
                        onPointerCancel={cancelMessagePress}
                        onContextMenu={(event) => {
                          event.preventDefault();
                        }}
                        onDoubleClick={(event) => {
                          event.preventDefault();
                          if (pendingIdsRef.current.has(message.id)) return;
                          if (selectModeRef.current) return;
                          if (justEnteredSelectRef.current) return;
                          enterSelectMode(message.id);
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

      {contactQrOpen && (
        <ContactQrModal
          contact={{
            uid: String(contact.uid),
            username: contact.username ?? "",
            first_name: contact.first_name ?? "",
            last_name: contact.last_name ?? "",
            photo_url: contact.photo_url ?? undefined,
          }}
          onClose={() => setContactQrOpen(false)}
          onToast={showToast}
        />
      )}

      <ClearChatsDialog
        open={clearDialogMode !== null}
        title={clearDialogMode === "selected" ? "Delete selected messages?" : "Clear chats?"}
        description={
          clearDialogMode === "selected"
            ? `Remove ${selectedMessages.length} selected message${selectedMessages.length === 1 ? "" : "s"} from this conversation.`
            : "This will remove all messages in this conversation. This action cannot be undone."
        }
        confirmLabel={clearDialogMode === "selected" ? "Delete messages" : "Clear chats"}
        allowEveryone={
          clearDialogMode === "all" ||
          (clearDialogMode === "selected" &&
            selectedMessages.length > 0 &&
            selectedMessages.every(
              (message) => message.deleted_at || message.sender_uid === myUid,
            ))
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
                {mergedForwardUsers.map((user) => (
                  <button
                    key={user.uid}
                    type="button"
                    role="checkbox"
                    aria-checked={forwardSelectedUids.includes(user.uid)}
                    disabled={forwarding}
                    onClick={() => toggleForwardContact(user.uid)}
                    className="flex w-[72px] flex-shrink-0 flex-col items-center gap-1.5"
                  >
                    <span className="relative flex h-14 w-14 items-center justify-center overflow-hidden rounded-full border border-line bg-[#f5f5f5]">
                      <TelegramAvatar
                        src={`/api/avatar/${user.uid}`}
                        fallbackSrc={user.photo_url}
                      />
                      {forwardSelectedUids.includes(user.uid) && (
                        <span className="absolute bottom-2 right-2 flex h-[19px] w-[19px] items-center justify-center rounded-full border-2 border-white bg-emerald-600 text-white">
                          <Check size={12} strokeWidth={3} />
                        </span>
                      )}
                    </span>
                    {user.is_admin ? (
                      <VerifiedName
                        name={contactLabel(user)}
                        size="sm"
                        compactBadge
                        wrap
                        className="max-w-full justify-center"
                        nameClassName="max-w-[50px] text-[10px] leading-tight"
                      />
                    ) : (
                      <span className="w-full truncate text-center text-[11px] leading-tight text-ink">
                        {contactLabel(user)}
                      </span>
                    )}
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