"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  Bug,
  X,
  Check,
  CheckCheck,
  Clock,
  Copy,
  Bell,
  BellOff,
  LoaderCircle,
  Pin,
  Reply,
  Sparkles,
  Trash2,
  Pencil,
} from "lucide-react";
import { useRealtime } from "@/lib/use-realtime";
import { ChatComposer } from "@/components/ChatComposer";
import { ChatMessageBubble, chatMessageTime } from "@/components/ChatMessageBubble";
import { TelegramAvatar } from "@/components/TelegramAvatar";
import { VerifiedName } from "@/components/VerifiedName";
import {
  playSendSound,
  playSystemReceiveSoundOnce,
} from "@/lib/chat-sounds";
import { useBackDismiss } from "@/lib/back-dismiss";
import { chatPreviewText } from "@/lib/chat-preview";
import { acquirePageModalLock } from "@/lib/page-modal-lock";
import { readApiJson } from "@/lib/read-api-json";

export type Notification = {
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

export type ChatMessage = {
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
  ai_input_tokens?: number | null;
  ai_output_tokens?: number | null;
  sender_device_id?: string | null;
};

export type TelegramUser = {
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
  sender_role: string;
  content: string;
  created_at: string;
  delivered_at: string | null;
  read_at: string | null;
  edited_at: string | null;
  deleted_at: string | null;
  reply_to_id: string | null;
  is_pinned: boolean;
  ai_input_tokens: number | null;
  ai_output_tokens: number | null;
  sender_device_id: string | null;
  source: "message" | "notification";
  _pending: boolean;
};

const MARK_READ_DWELL_MS = 1_500;
const SWIPE_TRIGGER = 55;
const SWIPE_MAX = 88;
const SELECT_GRACE_MS = 500;
const LONG_PRESS_MS = 400;
const MOVE_THRESHOLD = 15;
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

function StatusIcon({
  pending,
  deliveredAt,
  readAt,
  online,
}: {
  pending: boolean;
  deliveredAt: string | null;
  readAt: string | null;
  online: boolean;
}) {
  if (readAt || deliveredAt) {
    return <CheckCheck size={13} strokeWidth={2.2} className="text-sky-400" />;
  }
  if (pending || !online) {
    return (
      <Clock
        size={11}
        strokeWidth={2.2}
        className={online ? "text-white/70" : "animate-spin text-white/70"}
      />
    );
  }
  return <Check size={13} strokeWidth={2.2} className="text-white/65" />;
}

const clampStyle: React.CSSProperties = {
  display: "-webkit-box",
  WebkitLineClamp: 2,
  WebkitBoxOrient: "vertical",
  overflow: "hidden",
  wordBreak: "break-word",
};

function pushChatHistoryMarker() {
  const currentState = window.history.state;
  const preservedState =
    currentState && typeof currentState === "object" ? currentState : {};
  window.history.pushState(
    { ...preservedState, chatRoom: true },
    "",
    window.location.href,
  );
}

export function ChatRoomClient({
  uid,
  notifications,
  initialMessages,
  user,
  isModal = false,
  keyboardCompact = false,
  compactBubbles = false,
  onClose,
}: {
  uid: string;
  notifications: Notification[];
  initialMessages: ChatMessage[];
  user: TelegramUser | null;
  isModal?: boolean;
  keyboardCompact?: boolean;
  compactBubbles?: boolean;
  onClose?: () => void;
}) {
  const messageBoxRef = useRef<HTMLDivElement | null>(null);
  const modalSurfaceRef = useRef<HTMLDivElement | null>(null);
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const longPressTriggeredAtRef = useRef(0);
  const pressOriginRef = useRef({ x: 0, y: 0 });
  const justEnteredSelectRef = useRef(false);
  const toastTimerRef = useRef<number | null>(null);
  const aiTypingTimerRef = useRef<number | null>(null);
  const highlightTimerRef = useRef<number | null>(null);
  const initialMessagesRef = useRef(initialMessages);
  const markReadRef = useRef<(() => void) | null>(null);
  const markReadInflightRef = useRef(false);
  const hasScrolledRef = useRef(false);
  const nearBottomRef = useRef(true);
  const followAiOutputRef = useRef(true);
  const router = useRouter();
  const DRAFT_KEY = `cheya-draft:${uid}:system`;
  const BROWSER_NOTIFICATIONS_MUTED_KEY = `cheya-browser-notifications-muted:${uid}`;
  const draftReadyRef = useRef(false);
  const selectModeRef = useRef(false);
  const swipeRef = useRef<{
    id: string;
    pointerId: number;
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
  const [aiProcessing, setAiProcessing] = useState(false);
  const [aiProgress, setAiProgress] = useState<string[]>([]);
  const [typedAiMessage, setTypedAiMessage] = useState<{
    messageId: string;
    content: string;
  } | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [reportCategoryOpen, setReportCategoryOpen] = useState(false);
  const [reportCategory, setReportCategory] = useState("");
  const [reportOtherDescription, setReportOtherDescription] = useState("");
  const [reportSending, setReportSending] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [browserNotificationsMuted, setBrowserNotificationsMuted] = useState(false);
  const [replyingTo, setReplyingTo] = useState<ChatItem | null>(null);
  const [toast, setToast] = useState("");
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [swipe, setSwipe] = useState<{ id: string; offset: number } | null>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [viewport, setViewport] = useState<ViewportState>({
    top: 0,
    height: 0,
    keyboard: false,
    keyboardInset: 0,
  });
  const [vvOffset, setVvOffset] = useState(0);
  useBackDismiss(selectMode, exitSelectMode, "chat-selection");
  useBackDismiss(reportCategoryOpen, closeMessageReport, "chat-report-category");

  function showToast(message: string) {
    setToast(message.replace(/[.!?…]+$/, ""));
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
    const updateOnline = () => {
      setIsOnline(navigator.onLine);
      if (navigator.onLine) {
        setPending((current) => {
          const next = new Set(current);
          for (const id of next) {
            if (id.startsWith("temp-")) next.delete(id);
          }
          return next;
        });
      }
    };
    updateOnline();
    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);
    return () => {
      window.removeEventListener("online", updateOnline);
      window.removeEventListener("offline", updateOnline);
    };
  }, []);

  useEffect(() => {
    if (!reportCategoryOpen || isModal) return;
    return acquirePageModalLock();
  }, [isModal, reportCategoryOpen]);

  useEffect(() => {
    try {
      setBrowserNotificationsMuted(
        window.localStorage.getItem(BROWSER_NOTIFICATIONS_MUTED_KEY) === "true",
      );
    } catch (error) {
      console.error("[chat] failed to read browser notification preference:", error);
    }
  }, [BROWSER_NOTIFICATIONS_MUTED_KEY]);

  async function toggleBrowserNotifications() {
    const persistPreference = async (muted: boolean) => {
      try {
        window.localStorage.setItem(BROWSER_NOTIFICATIONS_MUTED_KEY, String(muted));
      } catch (error) {
        console.error("[chat] failed to save browser notification preference:", error);
        throw new Error("Preferensi notifikasi tidak dapat disimpan.");
      }
      if (!("serviceWorker" in navigator)) return;
      const registration = await navigator.serviceWorker.register("/sw.js", {
        scope: "/",
      });
      await navigator.serviceWorker.ready;
      const worker =
        registration.active ??
        registration.waiting ??
        registration.installing ??
        navigator.serviceWorker.controller;
      if (!worker) {
        throw new Error("Pengaturan notifikasi push tidak dapat diperbarui.");
      }
      const channel = new MessageChannel();
      await new Promise<void>((resolve, reject) => {
        const timeout = window.setTimeout(() => {
          channel.port1.close();
          reject(new Error("Pengaturan notifikasi push tidak merespons."));
        }, 3000);
        channel.port1.onmessage = (event: MessageEvent<{ ok?: boolean }>) => {
          window.clearTimeout(timeout);
          channel.port1.close();
          if (event.data?.ok) resolve();
          else reject(new Error("Pengaturan notifikasi push tidak dapat disimpan."));
        };
        worker.postMessage(
          {
            type: "cheya:browser-notifications-preference",
            uid,
            muted,
          },
          [channel.port2],
        );
      });
    };

    if (!browserNotificationsMuted) {
      try {
        await persistPreference(true);
        setBrowserNotificationsMuted(true);
        showToast("Notifications muted");
      } catch (error) {
        showToast(error instanceof Error ? error.message : "Deactivation failed");
      }
      return;
    }

    if (!("Notification" in window)) {
      showToast("Browser ini tidak mendukung notifikasi.");
      return;
    }
    if (window.Notification.permission === "denied") {
      showToast("Permission denied");
      return;
    }
    if (window.Notification.permission === "default") {
      const permission = await window.Notification.requestPermission();
      if (permission !== "granted") {
        showToast("Permission required");
        return;
      }
    }

    try {
      await persistPreference(false);
      setBrowserNotificationsMuted(false);
      showToast("Notifications enabled");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Permission denied");
    }
  }

  async function showBrowserMessageNotification(message: ChatMessage) {
    if (
      browserNotificationsMuted ||
      !document.hidden ||
      !("Notification" in window) ||
      window.Notification.permission !== "granted"
    ) {
      return;
    }
    try {
      if ("serviceWorker" in navigator) {
        const registration = await navigator.serviceWorker.ready;
        if (await registration.pushManager.getSubscription()) return;
      }
    } catch (error) {
      console.error("[chat] failed to check push notification subscription:", error);
    }
    const notification = new window.Notification("CheyaVerse", {
      body: chatPreviewText(message.content).slice(0, 180) || "Pesan baru",
      icon: "/icon.png",
      tag: `cheyaverse-message-${message.id}`,
    });
    notification.onclick = () => {
      window.focus();
      notification.close();
    };
  }

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
        sender_role: "admin",
        content: n.message,
        created_at: n.created_at,
        delivered_at: null,
        read_at: null,
        edited_at: null,
        deleted_at: null,
        reply_to_id: null,
        is_pinned: pinnedNotificationIds.has(n.id),
        ai_input_tokens: null,
        ai_output_tokens: null,
        sender_device_id: null,
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
        sender_role: m.sender_role,
        content: m.content,
        created_at: m.created_at,
        delivered_at: m.delivered_at,
        read_at: m.read_at,
        edited_at: m.edited_at,
        deleted_at: m.deleted_at,
        reply_to_id: m.reply_to_id,
        is_pinned: m.is_pinned,
        ai_input_tokens: m.ai_input_tokens ?? null,
        ai_output_tokens: m.ai_output_tokens ?? null,
        sender_device_id: m.sender_device_id ?? null,
        source: "message",
        _pending: pending.has(m.id),
      });
    }
    merged.sort((a, b) => a.created_at.localeCompare(b.created_at));
    return merged;
  }, [notifications, hiddenNotificationIds, pinnedNotificationIds, messages, pending]);

  useEffect(() => {
    if (!editingMessageId) return;
    const editedMessage = messages.find((message) => message.id === editingMessageId);
    if (
      !editedMessage ||
      editedMessage.sender !== "user" ||
      editedMessage.deleted_at
    ) {
      setEditingMessageId(null);
      setEditDraft("");
    }
  }, [editingMessageId, messages]);

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
    window.setTimeout(() => {
      justEnteredSelectRef.current = false;
    }, SELECT_GRACE_MS);
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

  function toggleSelectAll() {
    const selectable = chatItems.filter((item) => !item._pending);
    const allSelected =
      selectable.length > 0 &&
      selectable.every((item) => selectedIds.has(item.id));
    setSelectMode(true);
    setSelectedIds(
      allSelected ? new Set() : new Set(selectable.map((item) => item.id)),
    );
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
    clearLongPressTimer();
    setSwipe(null);
    event.currentTarget.setPointerCapture(event.pointerId);
    pressOriginRef.current = { x: event.clientX, y: event.clientY };
    swipeRef.current = {
      id: item.id,
      pointerId: event.pointerId,
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
      if (!selectModeRef.current) {
        enterSelectMode(item.id);
      }
      longPressTimerRef.current = null;
    }, LONG_PRESS_MS);
  }

  function moveChatItemPress(event: React.PointerEvent) {
    const s = swipeRef.current;
    if (!s || event.pointerId !== s.pointerId) return;
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
      clearLongPressTimer();
      swipeRef.current = null;
      setSwipe(null);
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

  function stopChatItemPress(pointerId: number) {
    clearLongPressTimer();
    const s = swipeRef.current;
    if (s && pointerId !== s.pointerId) return;
    if (!s) {
      setSwipe(null);
      return;
    }
    swipeRef.current = null;
    const wasGesture = s.active;
    const wasSwipe =
      wasGesture && Math.abs(s.offset) >= SWIPE_TRIGGER && !selectModeRef.current;
    setSwipe(null);
    if (wasSwipe) {
      const target = chatItemsRef.current.find((it) => it.id === s.id);
      if (target) beginReply(target);
    }
  }

  function cancelChatItemPress(pointerId?: number) {
    const s = swipeRef.current;
    if (s && pointerId !== undefined && pointerId !== s.pointerId) return;
    clearLongPressTimer();
    swipeRef.current = null;
    setSwipe(null);
  }

  const scrollToBottom = () => {
    const el = messageBoxRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    nearBottomRef.current = true;
  };

  const scrollToLatestImmediately = () => {
    const el = messageBoxRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "auto" });
    nearBottomRef.current = true;
  };

  function animateAiMessage(message: ChatMessage): Promise<void> {
    if (aiTypingTimerRef.current !== null) {
      window.clearTimeout(aiTypingTimerRef.current);
      aiTypingTimerRef.current = null;
    }
    setTypedAiMessage({ messageId: message.id, content: "" });
    const fullContent = message.content;
    const parts = fullContent.split(/( +)/).filter(Boolean);
    let partIndex = 0;
    let visibleContent = "";

    return new Promise((resolve) => {
      const revealNextPart = () => {
        while (partIndex < parts.length) {
          const part = parts[partIndex++];
          visibleContent += part;
          if (/^ +$/.test(part)) break;
        }
        setTypedAiMessage({
          messageId: message.id,
          content: visibleContent,
        });
        if (followAiOutputRef.current && nearBottomRef.current) {
          window.requestAnimationFrame(scrollToLatestImmediately);
        }
        if (partIndex >= parts.length) {
          aiTypingTimerRef.current = null;
          setTypedAiMessage(null);
          resolve();
          return;
        }
        aiTypingTimerRef.current = window.setTimeout(revealNextPart, 24);
      };
      revealNextPart();
    });
  }

  function playMessageReceiveSound(messageId: string) {
    playSystemReceiveSoundOnce(messageId);
  }

  async function requestAiReply(sourceMessage: ChatMessage) {
    const messageBox = messageBoxRef.current;
    const distanceFromBottom = messageBox
      ? messageBox.scrollHeight - messageBox.scrollTop - messageBox.clientHeight
      : 0;
    followAiOutputRef.current = distanceFromBottom <= 200;
    setAiProcessing(true);
    setAiProgress([]);
    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ replyToId: sourceMessage.id }),
        cache: "no-store",
      });
      if (!response.ok) {
        const errorResult = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(errorResult.error || "AI tidak dapat memproses pesan saat ini.");
      }
      if (!response.body) {
        throw new Error("Server tidak mengirim status proses AI.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      const resultRef: { current: {
        ok?: boolean;
        error?: string;
        message?: ChatMessage;
      } | null } = { current: null };
      let streamError: string | null = null;

      while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const frames = buffer.split(/\r?\n\r?\n/);
        buffer = frames.pop() ?? "";

        for (const frame of frames) {
          const dataLine = frame.split(/\r?\n/).find((line) => line.startsWith("data:"));
          if (!dataLine) continue;
          const event = JSON.parse(dataLine.slice(5).trim()) as {
            type?: string;
            activity?: string;
            result?: typeof result;
            error?: string;
          };
          if (event.type === "progress" && event.activity) {
            setAiProgress((current) => [...current, event.activity!].slice(-7));
          } else if (event.type === "result" && event.result) {
            resultRef.current = event.result;
          } else if (event.type === "error") {
            streamError = event.error || "AI tidak dapat memproses pesan saat ini.";
          }
        }
        if (done) break;
      }
      if (streamError) throw new Error(streamError);
      const result = resultRef.current;
      if (!result?.ok || !result.message) {
        throw new Error(result?.error || "AI tidak dapat memproses pesan saat ini.");
      }
      setMessages((previous) => {
        const existingIndex = previous.findIndex(
          (item) => item.id === result.message!.id,
        );
        if (existingIndex < 0) return [...previous, result.message!];
        return previous.map((item) =>
          item.id === result.message!.id ? result.message! : item,
        );
      });
      setAiProcessing(false);
      setAiProgress([]);
      playMessageReceiveSound(result.message.id);
      await animateAiMessage(result.message);
    } catch (error) {
      setAiProcessing(false);
      const detail =
        error instanceof Error
          ? error.message
          : "Layanan AI sedang tidak tersedia.";
      const failureMessage: ChatMessage = {
        id: `ai-error-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        uid: Number(uid),
        sender: "bot",
        sender_role: "ai",
        title: "CheyaVerse",
        content: `Maaf, Cheya tidak dapat memproses pesan ini. ${detail}`.slice(0, 2000),
        created_at: new Date().toISOString(),
        delivered_at: new Date().toISOString(),
        read_at: new Date().toISOString(),
        edited_at: null,
        deleted_at: null,
        reply_to_id: sourceMessage.id,
        is_pinned: false,
      };
      setMessages((previous) => [...previous, failureMessage]);
      playMessageReceiveSound(failureMessage.id);
      await animateAiMessage(failureMessage);
    } finally {
      setAiProcessing(false);
      setAiProgress([]);
      followAiOutputRef.current = false;
    }
  }

  const handleMessageScroll = () => {
    const el = messageBoxRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    nearBottomRef.current = distanceFromBottom <= 200;
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

  useEffect(
    () => () => {
      if (longPressTimerRef.current !== null) window.clearTimeout(longPressTimerRef.current);
      if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
      if (highlightTimerRef.current !== null) window.clearTimeout(highlightTimerRef.current);
      if (aiTypingTimerRef.current !== null) window.clearTimeout(aiTypingTimerRef.current);
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
    let dwellTimer: ReturnType<typeof setTimeout> | null = null;
    let scheduleMarkRead: () => void = () => {};

    const doMarkRead = async () => {
      if (cancelled) return;
      if (
        !mounted ||
        document.visibilityState !== "visible" ||
        !messageBoxRef.current
      ) return;
      if (markReadInflightRef.current) return;
      markReadInflightRef.current = true;
      try {
        const res = await fetch(
          `/api/notifications/${encodeURIComponent(uid)}`,
          { method: "POST", cache: "no-store" },
        );
        if (!res.ok) {
          console.error(
            `[chat/system] failed to mark notifications read (${res.status}).`,
          );
          return;
        }
        if (!cancelled) router.refresh();
      } catch (error) {
        console.error("[chat/system] failed to mark notifications read:", error);
      } finally {
        markReadInflightRef.current = false;
      }
    };

    const clearDwellTimer = () => {
      if (dwellTimer !== null) {
        clearTimeout(dwellTimer);
        dwellTimer = null;
      }
    };

    scheduleMarkRead = () => {
      clearDwellTimer();
      if (
        cancelled ||
        !mounted ||
        document.visibilityState !== "visible" ||
        !messageBoxRef.current
      ) {
        return;
      }
      dwellTimer = setTimeout(() => {
        dwellTimer = null;
        void doMarkRead();
      }, MARK_READ_DWELL_MS);
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") scheduleMarkRead();
      else clearDwellTimer();
    };

    markReadRef.current = scheduleMarkRead;
    document.addEventListener("visibilitychange", onVisibilityChange);
    scheduleMarkRead();

    return () => {
      cancelled = true;
      clearDwellTimer();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      markReadRef.current = null;
    };
  }, [mounted, uid, router]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    pushChatHistoryMarker();
    const onPopState = () => {
      if (isModal) {
        onClose?.();
        return;
      }
      router.back();
    };
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
    };
  }, [isModal, onClose, router, uid]);

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
    if (editingMessageId) return;
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
  }, [text, replyingTo, editingMessageId, DRAFT_KEY]);

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
        if (incoming.sender === "bot" || incoming.sender_role === "admin") {
          playMessageReceiveSound(incoming.id);
        }
        if (incoming.sender === "bot" || incoming.sender_role === "admin") {
          void showBrowserMessageNotification(incoming);
        }
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
    if (event.type === "message:unhidden") {
      router.refresh();
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
      const notificationId =
        typeof event.notificationId === "string"
          ? event.notificationId
        : `${String(event.title ?? "")}:${String(event.body ?? "")}:${Math.floor(Date.now() / 2_000)}`;
      playSystemReceiveSoundOnce(notificationId);
      markReadRef.current?.();
      router.refresh();
      return;
    }
    if (event.type === "notification:read") {
      router.refresh();
      return;
    }
  });

  useEffect(() => {
    let active = true;
    let inFlight = false;
    const refreshWhileOpen = async () => {
      if (!active || inFlight || document.visibilityState !== "visible") return;
      inFlight = true;
      try {
        const response = await fetch(
          `/api/notifications/${encodeURIComponent(uid)}`,
          { cache: "no-store" },
        );
        if (!response.ok) {
          throw new Error(`Notification refresh failed: ${response.status}`);
        }
        const result = (await response.json()) as {
          ok?: boolean;
          unread?: unknown;
        };
        if (result.ok !== true || !Number.isSafeInteger(Number(result.unread))) {
          throw new Error("Invalid notification refresh response.");
        }
        if (Number(result.unread) > 0) markReadRef.current?.();
        else router.refresh();
      } catch (error) {
        console.error("[chat/system] background refresh failed:", error);
      } finally {
        inFlight = false;
      }
    };
    void refreshWhileOpen();
    window.addEventListener("focus", refreshWhileOpen);
    window.addEventListener("online", refreshWhileOpen);
    window.addEventListener("pageshow", refreshWhileOpen);
    window.addEventListener("popstate", refreshWhileOpen);
    document.addEventListener("visibilitychange", refreshWhileOpen);
    return () => {
      active = false;
      window.removeEventListener("focus", refreshWhileOpen);
      window.removeEventListener("online", refreshWhileOpen);
      window.removeEventListener("pageshow", refreshWhileOpen);
      window.removeEventListener("popstate", refreshWhileOpen);
      document.removeEventListener("visibilitychange", refreshWhileOpen);
    };
  }, [router, uid]);

  useEffect(() => {
    if (!messageBoxRef.current) return;
    if (hasScrolledRef.current && !nearBottomRef.current) return;
    const behavior: ScrollBehavior = hasScrolledRef.current ? "smooth" : "auto";
    const frame = window.requestAnimationFrame(() => {
      const messageBox = messageBoxRef.current;
      if (!messageBox) return;
      messageBox.scrollTo({ top: messageBox.scrollHeight, behavior });
      hasScrolledRef.current = true;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [chatItems.length, mounted]);

  useEffect(() => {
    if (!viewport.keyboard) return;
    const frame = window.requestAnimationFrame(scrollToLatestImmediately);
    return () => window.cancelAnimationFrame(frame);
  }, [viewport.keyboard, viewport.height]);

  function autoGrow(e: React.FormEvent<HTMLTextAreaElement>) {
    const t = e.currentTarget;
    t.style.height = "auto";
    const next = Math.min(t.scrollHeight, 120);
    t.style.height = next + "px";
  }

  async function sendMessage() {
    const trimmed = text.trim();
    if (!trimmed || sending || aiProcessing) return;
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
        if (!saved) {
          throw new Error("Server tidak mengembalikan pesan yang tersimpan.");
        }
        setMessages((prev) => {
          const withoutTemp = prev.filter((m) => m.id !== tempId);
          if (withoutTemp.some((m) => m.id === saved.id)) return withoutTemp;
          return [...withoutTemp, saved];
        });
        setPending((prev) => {
          const next = new Set(prev);
          next.delete(tempId);
          return next;
        });
        await requestAiReply(saved);
      } else {
        throw new Error("Failed to send message. Please try again");
      }
    } catch (error) {
      if (navigator.onLine) {
        setPending((prev) => {
          const next = new Set(prev);
          next.delete(tempId);
          return next;
        });
        showToast(
          error instanceof Error
            ? `${error.message} Server belum mengonfirmasi pesan`
            : "Server belum mengonfirmasi pesan",
        );
      } else {
        showToast("Tidak ada koneksi internet. Pesan tidak dapat terkirim");
      }
    } finally {
      setSending(false);
    }
  }

  function handleComposerFocus() {
    scrollToLatestImmediately();
  }

  function beginReply(item: ChatItem) {
    setReplyingTo(item);
    exitSelectMode();
    requestAnimationFrame(() => taRef.current?.focus());
  }

  function formatChatItems(items: ChatItem[]): string[] {
    return items
      .filter((item) => !item.deleted_at)
      .map((item) => {
        const content = chatPreviewText(item.content);
        if (!content) return "";
        const timestamp = new Date(item.created_at).toLocaleString("id-ID", {
          dateStyle: "short",
          timeStyle: "short",
        });
        const name = item.sender === "user" ? ownName : "CheyaVerse";
        return `[${timestamp}] ${item.sender === "user" ? "You" : name}: ${content}`;
      })
      .filter(Boolean);
  }

  async function copySelected() {
    const selected = selectedItemsList.filter((item) => !item.deleted_at);
    if (selected.length === 0) return;
    const texts =
      selected.length === 1
        ? [chatPreviewText(selected[0].content)]
        : formatChatItems(selected);
    try {
      await navigator.clipboard.writeText(texts.filter(Boolean).join("\n"));
      showToast("Message copied");
    } catch {
      showToast("Failed to copy message");
    }
  }

  async function deleteSelected() {
    if (selectedItemsList.length === 0) return;
    await deleteSelectedWithScope("everyone");
  }

  async function deleteSelectedWithScope(scope: "me" | "everyone") {
    const snapshot = selectedItemsList.slice();

    const notifIds = snapshot
      .filter((it) => it.source === "notification" && it.notificationId)
      .map((it) => it.notificationId!);
    const msgIds = snapshot
      .filter((it) => it.source === "message" && it.messageId)
      .map((it) => it.messageId!);

    const messageSnapshot = messages;
    const hiddenSnapshot = hiddenNotificationIds;
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
            if (!res.ok) throw new Error("Failed to delete message");
          }),
        ),
        ...msgIds.map((id) =>
          fetch(
            `/api/messages/${encodeURIComponent(uid)}?messageId=${encodeURIComponent(id)}&scope=${scope}`,
            { method: "DELETE" },
          ).then((res) => {
            if (!res.ok) throw new Error("Failed to delete message");
          }),
        ),
      ]);
      showToast("Message deleted");
    } catch (error) {
      setMessages(messageSnapshot);
      setHiddenNotificationIds(hiddenSnapshot);
      showToast(error instanceof Error ? error.message : "Failed to delete message");
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
    const item = selectedItemsList[0];
    if (
      item.source !== "message" ||
      item.sender !== "user" ||
      !item.messageId ||
      item.deleted_at ||
      item._pending
    ) {
      return;
    }
    setEditingMessageId(item.messageId);
    setEditDraft(item.content);
    setReplyingTo(null);
    exitSelectMode();
  }

  function cancelInlineEdit() {
    setEditingMessageId(null);
    setEditDraft("");
  }

  async function saveInlineEdit() {
    const content = editDraft.trim();
    if (!editingMessageId || !content || savingEdit) return;
    setSavingEdit(true);
    try {
      const response = await fetch(`/api/messages/${encodeURIComponent(uid)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId: editingMessageId, content }),
      });
      const result = (await response.json()) as {
        ok?: boolean;
        message?: ChatMessage;
        error?: string;
      };
      if (!response.ok || !result.message) {
        throw new Error(result.error || "Failed to update message");
      }
      setMessages((current) =>
        current.map((message) =>
          message.id === result.message!.id ? result.message! : message,
        ),
      );
      cancelInlineEdit();
      showToast("Message updated");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Failed to update message");
    } finally {
      setSavingEdit(false);
    }
  }

  function closeMessageReport() {
    setReportCategoryOpen(false);
    setReportCategory("");
    setReportOtherDescription("");
  }

  async function submitMessageReport() {
    const selected = selectedItemsList.filter(
      (item) => !item.deleted_at && item.content.trim(),
    );
    if (
      !reportCategory ||
      (reportCategory === "Lainnya" && !reportOtherDescription.trim()) ||
      selected.length === 0 ||
      reportSending
    ) return;
    setReportSending(true);
    try {
      const reportedMessages = selected.map((item) => ({
        timestamp: new Date(item.created_at).toLocaleString("id-ID"),
        name: item.sender === "user" ? ownName : "CheyaVerse",
        message: item.content.slice(0, 1200),
      }));
      const response = await fetch("/api/feedback/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reportType: "chat_violation",
          description: "Chat message violation report",
          category: reportCategory,
          otherDescription:
            reportCategory === "Lainnya" ? reportOtherDescription.trim() : "",
          reportedMessages,
          logs: "",
          page: window.location.pathname,
          metadata: {
            capturedAt: new Date().toISOString(),
            userAgent: navigator.userAgent,
            browser: navigator.userAgent,
            device: /Mobile|Android|iPhone|iPod/i.test(navigator.userAgent)
              ? "Ponsel"
              : "Desktop",
            os: /Android/i.test(navigator.userAgent) ? "Android" : navigator.platform,
            viewport: `${window.innerWidth} × ${window.innerHeight} CSS px`,
            pixelRatio: `${window.devicePixelRatio || 1}x`,
            language: navigator.languages?.join(", ") || navigator.language,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            online: navigator.onLine ? "Ya" : "Tidak",
          },
        }),
        cache: "no-store",
      });
      const result = await readApiJson<{ ok?: boolean; error?: string }>(response);
      if (!response.ok || !result.ok) {
        throw new Error(result.error || "Failed to submit message report");
      }
      closeMessageReport();
      exitSelectMode();
      showToast("Message report submitted successfully to admin");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Laporan pesan tidak dapat dikirim");
    } finally {
      setReportSending(false);
    }
  }

  const vvApplied = viewport.keyboard ? vvOffset : 0;
  const footerBottom = viewport.keyboard
    ? Math.max(0, viewport.keyboardInset - vvOffset)
    : 0;

  const allSelectableSelected =
    chatItems.filter((item) => !item._pending).length > 0 &&
    chatItems
      .filter((item) => !item._pending)
      .every((item) => selectedIds.has(item.id));
  const hasUndeletedSelection = selectedItemsList.some((item) => !item.deleted_at);
  const compactHeader = isModal && (keyboardCompact || viewport.keyboard);
  const canEditSelected =
    selectedItemsList.length === 1 &&
    selectedItemsList[0].source === "message" &&
    selectedItemsList[0].sender === "user" &&
    !selectedItemsList[0].deleted_at &&
    !selectedItemsList[0]._pending;

  const header = (
    <header
      className={`z-40 bg-transparent ${
        isModal
          ? "absolute left-0 right-0 top-0 px-3 pt-1 pb-1"
          : "fixed left-0 right-0 pt-[calc(12px+env(safe-area-inset-top))] pb-3"
      }`}
      style={isModal ? undefined : { top: vvApplied }}
    >
      <div className="relative mx-auto max-w-[600px]">
        {selectMode ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={exitSelectMode}
              aria-label="Exit selection"
              className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border border-[#dfe3e8] bg-white text-ink-soft transition-transform active:scale-90"
            >
              <X size={19} />
            </button>
            <div className="flex h-10 min-w-0 flex-1 items-center justify-around overflow-hidden rounded-full border border-[#dfe3e8] bg-white">
              <button
                type="button"
                onClick={toggleSelectAll}
                aria-label="Select all messages"
                aria-pressed={allSelectableSelected}
                className="flex h-full min-w-0 flex-1 items-center justify-center text-ink-soft transition-colors active:bg-[#f5f5f5]"
              >
                <CheckCheck size={16} strokeWidth={2.2} />
              </button>
              {canEditSelected && (
                <button
                  type="button"
                  onClick={editSelected}
                  aria-label="Edit selected message"
                  className="flex h-full min-w-0 flex-1 items-center justify-center text-ink-soft transition-colors active:bg-[#f5f5f5]"
                >
                  <Pencil size={17} strokeWidth={2.1} />
                </button>
              )}
              <button
                type="button"
                onClick={() => void copySelected()}
                aria-label="Copy selected messages"
                disabled={selectedIds.size === 0}
                className="flex h-full min-w-0 flex-1 items-center justify-center text-ink-soft transition-colors active:bg-[#f5f5f5] disabled:opacity-40"
              >
                <Copy size={17} strokeWidth={2.2} />
              </button>
              <button
                type="button"
                onClick={() => void deleteSelected()}
                aria-label="Delete messages"
                disabled={selectedIds.size === 0}
                className="flex h-full min-w-0 flex-1 items-center justify-center text-danger transition-colors active:bg-[#f5f5f5] disabled:opacity-40"
              >
                <Trash2 size={17} strokeWidth={2.2} />
              </button>
              <button
                type="button"
                onClick={() => {
                  if (selectedIds.size > 0) {
                    setReportCategoryOpen(true);
                  }
                }}
                aria-label="Report selected messages"
                disabled={selectedIds.size === 0}
                className="flex h-full min-w-0 flex-1 items-center justify-center text-ink-soft transition-colors active:bg-[#f5f5f5] disabled:opacity-40"
              >
                <Bug size={17} strokeWidth={2.1} />
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <div className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-full border border-[#dfe3e8] bg-white px-1.5">
              <span className="-ml-1 flex h-9 w-9 flex-shrink-0 items-center justify-center overflow-hidden rounded-full">
                <TelegramAvatar src="/push.png?v=20261008" />
              </span>
              <span className="flex min-w-0 flex-1 flex-col justify-center self-stretch">
                <VerifiedName
                  name="CheyaVerse"
                  size="sm"
                  compactBadge
                  nameClassName="text-[15px] leading-tight"
                />
                <span className="block truncate text-[12px] leading-tight text-ink-mute">
                  service notifications
                </span>
              </span>
              <button
                type="button"
                onClick={() => void toggleBrowserNotifications()}
                aria-label={
                  browserNotificationsMuted
                    ? "Unmute browser notifications"
                    : "Mute browser notifications"
                }
                aria-pressed={!browserNotificationsMuted}
                className="mr-1 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-slate-100 active:bg-slate-100"
              >
                {browserNotificationsMuted ? (
                  <BellOff size={17} strokeWidth={2} />
                ) : (
                  <Bell size={17} strokeWidth={2} />
                )}
              </button>
            </div>
            <button
              type="button"
              onClick={() =>
                window.dispatchEvent(new CustomEvent("cheya:open-feedback-report"))
              }
              aria-label="Report a bug"
              title="Report a bug"
              className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border border-[#dfe3e8] bg-white text-ink-soft transition-transform active:scale-90"
            >
              <Bug size={17} />
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close bot chat"
              className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border border-[#dfe3e8] bg-white text-ink-soft transition-transform active:scale-90"
            >
              <X size={19} />
            </button>
          </div>
        )}
      </div>
    </header>
  );

  const footer = selectMode ? (
    <footer
      className={`chat-footer pointer-events-none ${
        isModal ? "absolute inset-x-0 bottom-0" : "fixed left-0 right-0"
      } z-30 bg-transparent`}
      style={isModal ? undefined : { bottom: footerBottom }}
    >
      <div
        data-chat-report-anchor="true"
        className={`pointer-events-auto relative mx-auto flex gap-2 px-3 pt-2 ${
          isModal ? "w-full" : "max-w-[600px]"
        }`}
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
      </div>
    </footer>
  ) : (
    <footer
      className={`chat-footer pointer-events-none ${
        isModal ? "absolute inset-x-0 bottom-0" : "fixed left-0 right-0"
      } z-30 bg-transparent`}
      style={isModal ? undefined : { bottom: footerBottom }}
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
        sendLabel="Send message"
        inputRef={taRef}
        onChange={handleTextChange}
        onFocus={handleComposerFocus}
        onSend={() => void sendMessage()}
        onInput={autoGrow}
        reply={
          replyingTo ? (
            <div className="relative flex items-stretch gap-2.5 border-b border-line px-3 py-2 pr-10">
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
        className={`mx-auto pointer-events-auto ${
          isModal ? "w-full max-w-none" : "max-w-[600px]"
        }`}
        style={{
          paddingBottom: viewport.keyboard
            ? "8px"
            : "calc(8px + env(safe-area-inset-bottom))",
        }}
      />
    </footer>
  );

  let previousDayKey = "";

  const portalTarget = isModal ? modalSurfaceRef.current : document.body;

  return (
    <>
      {isModal && <div ref={modalSurfaceRef} className="absolute inset-0" />}
      {mounted && portalTarget && createPortal(header, portalTarget)}
      {mounted && portalTarget && createPortal(
      <section
        ref={messageBoxRef}
        onScroll={handleMessageScroll}
        className={`z-10 mx-auto overflow-x-hidden overflow-y-auto overscroll-contain ${
          isModal
            ? `absolute inset-0 max-w-none px-1 ${compactHeader ? "pt-[62px] pb-[68px]" : "pt-[62px] pb-[76px]"}`
            : "fixed left-0 right-0 max-w-[600px] pt-[calc(80px+env(safe-area-inset-top))] pb-[calc(96px+env(safe-area-inset-bottom))]"
        }`}
        style={
          isModal
            ? undefined
            : {
                top: vvApplied,
                height: viewport.keyboard ? viewport.height : "100dvh",
              }
        }
      >
        <div
          onContextMenu={(event) => event.preventDefault()}
          className={`flex min-w-0 flex-col gap-2 px-3 py-3 ${isModal ? "pb-2" : ""}`}
        >
          {chatItems.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center py-16 text-center">
              <p className="mb-1 text-[14px] font-medium text-ink">No messages yet</p>
              <p className="text-[12.5px] text-ink-mute">
                Mulai percakapan dengan CheyaVerse.
              </p>
            </div>
          ) : (
            chatItems.map((item) => {
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
                    className={`mb-1 block w-full max-w-full overflow-hidden rounded-xl border-l-4 px-2.5 py-1.5 text-left transition-colors ${
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
                          compactBadge
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
                    className={`mb-1 block max-w-full overflow-hidden rounded-xl border-l-4 px-2.5 py-1.5 ${
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
                    style={{ touchAction: "pan-x pan-y" }}
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
                        avatarUrl={isUser ? `/api/avatar/${uid}` : null}
                        content={
                          item.deleted_at
                            ? "Pesan dihapus"
                            : typedAiMessage?.messageId === item.messageId
                              ? typedAiMessage.content
                              : item.content
                        }
                        richText={
                          item.sender === "bot" &&
                          item.sender_role !== "ai" &&
                          !item.deleted_at
                        }
                        markdown={
                          (item.sender === "user" ||
                            item.sender_role === "ai") &&
                          !item.deleted_at
                        }
                        aiSourceLinks={
                          item.sender === "bot" &&
                          item.sender_role === "ai" &&
                          !item.deleted_at
                        }
                        linkPreview={!item.deleted_at}
                        timestamp={chatMessageTime(item.created_at)}
                        compact={compactBubbles}
                        status={
                          <StatusIcon
                            pending={item._pending}
                            deliveredAt={item.delivered_at}
                            readAt={item.read_at}
                            online={isOnline}
                          />
                        }
                        label={`Message from ${isUser ? "you" : "CheyaVerse"}`}
                        pending={item._pending}
                        deleted={Boolean(item.deleted_at)}
                        edited={Boolean(item.edited_at && !item.deleted_at)}
                        pinned={item.is_pinned}
                        highlight={highlightedId === item.id}
                        prefix={prefix}
                        tokenUsage={
                          item.sender === "bot" &&
                          item.sender_role === "ai" &&
                          !item.deleted_at
                            ? {
                                inputTokens: item.ai_input_tokens,
                                outputTokens: item.ai_output_tokens,
                              }
                            : undefined
                        }
                        showTokenUsage={
                          item.sender === "bot" &&
                          item.sender_role === "ai" &&
                          !item.deleted_at
                        }
                        selectMode={selectMode}
                        selected={selectedIds.has(item.id)}
                        editing={
                          item.sender === "user" &&
                          !item.deleted_at &&
                          editingMessageId === item.messageId
                        }
                        editValue={editDraft}
                        editSaving={savingEdit}
                        onEditChange={setEditDraft}
                        onEditSave={() => void saveInlineEdit()}
                        onEditCancel={cancelInlineEdit}
                        onToggleSelect={() => {
                          if (justEnteredSelectRef.current) return;
                          if (!item._pending) toggleSelect(item.id);
                        }}
                        onPointerDown={(event) => {
                          if (!item._pending) startChatItemPress(event, item);
                        }}
                        onPointerMove={moveChatItemPress}
                        onPointerUp={(event) => stopChatItemPress(event.pointerId)}
                        onPointerCancel={(event) =>
                          cancelChatItemPress(event.pointerId)
                        }
                        onLostPointerCapture={(event) =>
                          cancelChatItemPress(event.pointerId)
                        }
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
          {aiProcessing && (
            <div
              role="status"
              aria-live="polite"
              className="animate-fade-up mx-2 my-2 max-w-[min(92%,30rem)] rounded-[20px] bg-[linear-gradient(125deg,rgba(237,233,254,.94),rgba(224,231,255,.72),rgba(224,242,254,.76))] px-3.5 py-3 shadow-[0_12px_34px_-22px_rgba(91,72,180,.48)]"
            >
              <div>
                <div className="mb-2.5 flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2 text-[11px] font-semibold text-ink">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-white/80 text-violet-600 shadow-[0_4px_12px_-8px_rgba(91,72,180,.65)]">
                      <Sparkles size={14} />
                    </span>
                    <span>Cheya sedang mengerjakan</span>
                  </div>
                  <span className="shrink-0 rounded-full bg-white/75 px-2 py-1 text-[9px] font-semibold text-violet-700">
                    {aiProgress.length || 1} langkah
                  </span>
                </div>
                {aiProgress.length > 0 ? (
                  <div className="space-y-1.5 pl-1">
                    {aiProgress.map((activity, index) => {
                      const isCurrent = index === aiProgress.length - 1;
                      return (
                        <div
                          key={`${activity}-${index}`}
                          className={`relative flex min-w-0 items-start gap-2 text-[11px] leading-relaxed ${
                            isCurrent ? "text-ink-soft" : "text-ink-mute"
                          }`}
                        >
                          <span className="mt-[2px] flex h-3 w-3 shrink-0 items-center justify-center rounded-full bg-white/85">
                            {isCurrent ? (
                              <LoaderCircle size={12} className="animate-spin text-violet-500" />
                            ) : (
                              <Check size={12} className="text-emerald-500" />
                            )}
                          </span>
                          <span className="min-w-0 break-words">{activity}</span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 pl-1 text-[11px] text-ink-mute">
                    <LoaderCircle size={13} className="animate-spin text-violet-500" />
                    Menyiapkan konteks yang relevan…
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </section>
      , portalTarget)}
      {mounted && portalTarget && createPortal(footer, portalTarget)}

      {toast && (
        <div
          role="status"
          className="fixed bottom-20 left-1/2 z-[90] -translate-x-1/2 rounded-full bg-ink px-4 py-2 text-[12px] text-white shadow-lg"
        >
          {toast}
        </div>
      )}
      {reportCategoryOpen && mounted && createPortal(
        <div
          className="fixed inset-0 z-[450] flex items-end justify-center bg-slate-950/45 p-3 backdrop-blur-sm sm:items-center"
          role="presentation"
          onClick={() => {
            if (!reportSending) {
              closeMessageReport();
            }
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="chat-report-title"
            data-modal-scroll-allow="true"
            onClick={(event) => event.stopPropagation()}
            className="w-full max-w-[440px] rounded-[24px] border border-slate-200 bg-white p-4 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="chat-report-title" className="text-[16px] font-bold text-ink">
                  Report selected messages
                </h2>
                <p className="mt-1 text-[12px] text-ink-mute">
                  {selectedItemsList.filter((item) => !item.deleted_at).length} message(s) will be sent to the admins for review
                </p>
              </div>
              <button
                type="button"
                aria-label="Close message report"
                disabled={reportSending}
                onClick={() => {
                  closeMessageReport();
                }}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-mute hover:bg-slate-100"
              >
                <X size={17} />
              </button>
            </div>
            <div className="mt-4 grid gap-2">
              {[
                "Pesan tidak pantas",
                "Scam atau penipuan",
                "Intimidasi atau perundungan",
                "Konten asusila",
                "Spam",
                "Lainnya",
              ].map((category) => (
                <Fragment key={category}>
                  <button
                    type="button"
                    aria-pressed={reportCategory === category}
                    onClick={() => setReportCategory(category)}
                    className={`rounded-xl border px-3 py-2.5 text-left text-[13px] transition-colors ${
                      reportCategory === category
                        ? "border-ink bg-slate-100 font-semibold text-ink"
                        : "border-slate-200 text-ink-soft hover:bg-slate-50"
                    }`}
                  >
                    {category}
                  </button>
                  {category === "Lainnya" && reportCategory === "Lainnya" && (
                    <label className="block">
                      <span className="sr-only">Describe the other violation</span>
                      <textarea
                        autoFocus
                        value={reportOtherDescription}
                        onChange={(event) => setReportOtherDescription(event.target.value)}
                        maxLength={500}
                        rows={3}
                        placeholder="Jelaskan pelanggaran lainnya..."
                        className="w-full resize-y rounded-xl border border-slate-300 bg-white p-3 text-[13px] text-ink outline-none placeholder:text-slate-400 focus:border-slate-500 focus:ring-2 focus:ring-slate-900/10"
                      />
                    </label>
                  )}
                </Fragment>
              ))}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                disabled={reportSending}
                onClick={() => {
                  closeMessageReport();
                }}
                className="min-h-10 rounded-full px-4 text-[12px] font-semibold text-ink-soft disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={
                  !reportCategory ||
                  (reportCategory === "Lainnya" && !reportOtherDescription.trim()) ||
                  reportSending
                }
                onClick={() => void submitMessageReport()}
                className="inline-flex min-h-10 items-center gap-2 rounded-full bg-ink px-4 text-[12px] font-semibold text-white disabled:opacity-40"
              >
                {reportSending ? "Sending…" : "Send report"}
              </button>
            </div>
          </section>
        </div>,
        document.body,
      )}
    </>
  );
}
