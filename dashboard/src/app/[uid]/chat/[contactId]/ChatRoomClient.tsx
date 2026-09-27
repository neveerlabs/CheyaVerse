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
  Forward,
  Pin,
  Pencil,
  Reply,
  Trash2,
  UserRound,
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
  const [hiddenNotificationIds, setHiddenNotificationIds] = useState<Set<string>>(() => new Set());
  const [pinnedNotificationIds, setPinnedNotificationIds] = useState<Set<string>>(
    () => new Set(notifications.filter((item) => item.is_pinned).map((item) => item.id)),
  );
  const initialMessagesRef = useRef(initialMessages);
  const [pending, setPending] = useState<Set<string>>(() => new Set());
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [recording, setRecording] = useState(false);
  const [selectedChatItem, setSelectedChatItem] = useState<ChatItem | null>(null);
  const [replyingTo, setReplyingTo] = useState<ChatItem | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [forwardOpen, setForwardOpen] = useState(false);
  const [forwardQuery, setForwardQuery] = useState("");
  const [forwardUsers, setForwardUsers] = useState<ForwardUser[]>([]);
  const [forwardLoading, setForwardLoading] = useState(false);
  const [toast, setToast] = useState("");
  const menuRootRef = useRef<HTMLElement | null>(null);
  const recognitionRef = useRef<Recognition | null>(null);
  const voiceBaseTextRef = useRef("");
  const longPressTimerRef = useRef<number | null>(null);
  const longPressTriggeredAtRef = useRef(0);
  const pressOriginRef = useRef({ x: 0, y: 0 });
  const toastTimerRef = useRef<number | null>(null);

  function showToast(message: string) {
    setToast(message);
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(""), 2600);
  }

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
      showToast("Pesan disalin.");
    } catch (error) {
      console.error("[chat-room] clipboard write failed:", error);
      showToast("Pesan tidak dapat disalin. Periksa izin clipboard browser.");
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
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (error) {
          console.error("[chat-room] failed to stop speech recognition:", error);
        }
      }
      if (longPressTimerRef.current !== null) window.clearTimeout(longPressTimerRef.current);
      if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
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
    if (event.type === "message:updated") {
      const incoming = event.message as ChatMessage | undefined;
      if (incoming) {
        setMessages((prev) =>
          prev.map((message) => message.id === incoming.id ? { ...message, ...incoming } : message),
        );
      }
      return;
    }
    if (event.type === "message:deleted") {
      const messageId = typeof event.messageId === "string" ? event.messageId : "";
      if (!messageId) return;
      setMessages((prev) =>
        prev.map((message) => message.id === messageId
          ? { ...message, content: "", deleted_at: new Date().toISOString() }
          : message),
      );
      return;
    }
    if (event.type === "message:hidden") {
      const messageId = typeof event.messageId === "string" ? event.messageId : "";
      if (messageId) setMessages((prev) => prev.filter((message) => message.id !== messageId));
      return;
    }
    if (event.type === "message:pinned") {
      const messageId = typeof event.messageId === "string" ? event.messageId : "";
      const pinned = event.pinned === true;
      if (messageId) {
        setMessages((prev) => prev.map((message) =>
          message.id === messageId ? { ...message, is_pinned: pinned } : message,
        ));
      }
      return;
    }
    if (event.type === "notification:deleted") {
      const notificationId = typeof event.notificationId === "string" ? event.notificationId : "";
      if (notificationId) {
        setHiddenNotificationIds((current) => new Set(current).add(notificationId));
      }
      return;
    }
    if (event.type === "notification:pinned") {
      const notificationId = typeof event.notificationId === "string" ? event.notificationId : "";
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
    let frame = 0;
    const update = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        const layoutHeight = window.innerHeight || document.documentElement.clientHeight;
        const visualHeight = vv?.height ?? layoutHeight;
        const isEditing =
          document.activeElement instanceof HTMLInputElement ||
          document.activeElement instanceof HTMLTextAreaElement;
        const keyboardInset =
          isEditing && layoutHeight - visualHeight > 120
            ? Math.max(0, layoutHeight - visualHeight)
            : 0;
        root.style.setProperty("--chat-vv-top", "0px");
        root.style.setProperty(
          "--chat-vv-height",
          keyboardInset > 0 ? `${Math.max(1, visualHeight)}px` : "100dvh",
        );
        root.style.setProperty("--chat-kb", `${keyboardInset}px`);
        root.style.setProperty(
          "--chat-footer-pad",
          keyboardInset > 0 ? "8px" : "calc(8px + env(safe-area-inset-bottom))",
        );
      });
    };
    update();
    vv?.addEventListener("resize", update);
    vv?.addEventListener("scroll", update);
    document.addEventListener("focusin", update);
    document.addEventListener("focusout", update);
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      vv?.removeEventListener("resize", update);
      vv?.removeEventListener("scroll", update);
      document.removeEventListener("focusin", update);
      document.removeEventListener("focusout", update);
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
        if (!response.ok) throw new Error(`Pencarian kontak gagal (${response.status}).`);
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
        setMessages((current) => current.map((message) =>
          message.id === id ? { ...message, ...result.message } : message,
        ));
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
      reply_to_id: replyingTo?.replyTargetId ?? null,
      is_pinned: false,
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
        body: JSON.stringify({ content: trimmed, replyToId: replyingTo?.replyTargetId ?? null }),
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
        setReplyingTo(null);

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
    if (
      scope === "everyone" &&
      !window.confirm("Hapus pesan ini untuk semua orang?")
    ) return;
    try {
      const response = await fetch(
        `/api/messages/${encodeURIComponent(uid)}?messageId=${encodeURIComponent(item.messageId)}&scope=${scope}`,
        { method: "DELETE" },
      );
      if (!response.ok) throw new Error("Pesan gagal dihapus.");
      setSelectedChatItem(null);
      if (scope === "me") {
        setMessages((current) => current.filter((message) => message.id !== item.messageId));
      } else {
        setMessages((current) => current.map((message) =>
          message.id === item.messageId
            ? { ...message, content: "", deleted_at: new Date().toISOString() }
            : message,
        ));
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
        setMessages((current) => current.map((message) =>
          message.id === item.messageId ? { ...message, is_pinned: result.pinned === true } : message,
        ));
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

  const fadeCls = `transition-opacity duration-500 ease-out ${
    revealed ? "opacity-100" : "opacity-0"
  }`;

  const header = (
    <header
      ref={menuRootRef}
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
          sendLabel={editingId ? "Simpan edit" : "Kirim"}
          inputRef={taRef}
          onChange={setText}
          onSend={() => void sendMessage()}
          onInput={autoGrow}
          onKeyDown={onKeyDown}
          onToggleDictation={toggleVoiceInput}
          dictating={recording}
          above={
            <>
              {replyingTo && (
                <div className="flex items-center gap-2 rounded-xl border border-line bg-white px-3 py-2 text-[11px] text-ink-soft">
                  <Reply size={14} className="shrink-0 text-ink-mute" />
                  <span className="min-w-0 flex-1 truncate">
                    Membalas: {chatPreviewText(replyingTo.content) || "Pesan"}
                  </span>
                  <button type="button" aria-label="Batal membalas" onClick={() => setReplyingTo(null)}>
                    <X size={14} />
                  </button>
                </div>
              )}
              {editingId && (
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
              )}
            </>
          }
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
              const reply = item.reply_to_id
                ? chatItems.find((message) => message.replyTargetId === item.reply_to_id)
                : null;
              const prefix = item.edited_at || item.is_pinned || item.reply_to_id ? (
                <>
                  {item.reply_to_id && (
                    <span className={`mb-1 block max-w-full truncate border-l-2 pl-2 text-[10px] ${
                      isUser ? "border-white/50 text-white/70" : "border-ink/30 text-ink-mute"
                    }`}>
                      {reply?.deleted_at
                        ? "Pesan dihapus"
                        : chatPreviewText(reply?.content ?? "") || "Balasan"}
                    </span>
                  )}
                </>
              ) : null;
              return (
                <ChatMessageBubble
                  key={item.id}
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
                  prefix={prefix}
                  onPointerDown={(event) => {
                    if (!item._pending) startChatItemPress(event, item);
                  }}
                  onPointerMove={moveChatItemPress}
                  onPointerUp={stopChatItemPress}
                  onPointerLeave={stopChatItemPress}
                  onPointerCancel={stopChatItemPress}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    if (item._pending) return;
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
          preview={chatPreviewText(selectedChatItem.deleted_at ? "Pesan dihapus" : selectedChatItem.content) || "Pesan"}
        >
          {!selectedChatItem.deleted_at && selectedChatItem.replyTargetId && (
            <button
              type="button"
              onClick={() => beginReply(selectedChatItem)}
              className="flex w-full items-center gap-3 px-4 py-3 text-[13px] text-ink hover:bg-[#f7f7f7] active:bg-[#f7f7f7]"
            >
              <Reply size={17} /> Balas
            </button>
          )}
            <button
              type="button"
              onClick={() => void copyChatItem(selectedChatItem)}
              className="flex w-full items-center gap-3 px-4 py-3 text-[13px] text-ink hover:bg-[#f7f7f7] active:bg-[#f7f7f7]"
            >
              <Copy size={17} /> Salin
            </button>
          {selectedChatItem.source === "message" && selectedChatItem.sender === "user" && !selectedChatItem.deleted_at && (
            <button
              type="button"
              onClick={() => beginEdit(selectedChatItem)}
              className="flex w-full items-center gap-3 px-4 py-3 text-[13px] text-ink hover:bg-[#f7f7f7] active:bg-[#f7f7f7]"
            >
              <Pencil size={17} /> Edit
            </button>
          )}
          {selectedChatItem.source === "message" || selectedChatItem.source === "notification" ? (
            <button
              type="button"
              onClick={() => void deleteChatMessage(selectedChatItem, "me")}
              className="flex w-full items-center gap-3 px-4 py-3 text-[13px] text-ink hover:bg-[#f7f7f7] active:bg-[#f7f7f7]"
            >
              <Trash2 size={17} /> Hapus untuk saya
            </button>
          ) : null}
          {selectedChatItem.source === "message" && selectedChatItem.sender === "user" && !selectedChatItem.deleted_at && (
            <button
              type="button"
              onClick={() => void deleteChatMessage(selectedChatItem, "everyone")}
              className="flex w-full items-center gap-3 px-4 py-3 text-[13px] text-danger hover:bg-[#f7f7f7] active:bg-[#f7f7f7]"
            >
              <Trash2 size={17} /> Hapus untuk semua orang
            </button>
          )}
          {!selectedChatItem.deleted_at && selectedChatItem.replyTargetId && (
            <>
              <button
                type="button"
                onClick={() => setForwardOpen(true)}
                className="flex w-full items-center gap-3 px-4 py-3 text-[13px] text-ink hover:bg-[#f7f7f7] active:bg-[#f7f7f7]"
              >
                <Forward size={17} /> Teruskan
              </button>
              <button
                type="button"
                onClick={() => void toggleChatMessagePin(selectedChatItem)}
                className="flex w-full items-center gap-3 px-4 py-3 text-[13px] text-ink hover:bg-[#f7f7f7] active:bg-[#f7f7f7]"
              >
                <Pin size={17} /> {selectedChatItem.is_pinned ? "Lepas sematan" : "Sematkan"}
              </button>
            </>
          )}
            <button
              type="button"
              onClick={() => setSelectedChatItem(null)}
              className="flex w-full items-center justify-center border-t border-line px-4 py-3 text-[13px] font-semibold text-ink-soft hover:bg-[#f7f7f7] active:bg-[#f7f7f7]"
            >
              Tutup
            </button>
        </MessageActionSheet>,
        document.body,
      )}
      {forwardOpen && selectedChatItem && mounted && createPortal(
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
                {!forwardLoading && forwardUsers.map((target) => {
                  const fullName = [target.first_name, target.last_name].filter(Boolean).join(" ").trim();
                  const name = fullName || target.username || `Telegram ${target.uid}`;
                  return (
                    <button
                      key={target.uid}
                      type="button"
                      onClick={() => void forwardChatMessage(target.uid)}
                      className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-[#f7f7f7] active:bg-[#f7f7f7]"
                    >
                      <span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-[#f5f5f5]">
                        {target.photo_url
                          ? <img src={target.photo_url} alt="" className="h-full w-full object-cover" />
                          : <UserRound size={17} className="text-ink-mute" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium text-ink">{name}</span>
                        {target.username && <span className="block truncate text-[11px] text-ink-mute">@{target.username}</span>}
                      </span>
                      <Forward size={16} className="text-ink-mute" />
                    </button>
                  );
                })}
                {forwardQuery.trim() && !forwardLoading && forwardUsers.length === 0 && (
                  <p className="px-2 py-3 text-[12px] text-ink-mute">Kontak tidak ditemukan.</p>
                )}
              </div>
            </div>
          </section>
        </div>,
        document.body,
      )}
      {toast && mounted && createPortal(
        <div role="status" className="fixed bottom-20 left-1/2 z-[90] -translate-x-1/2 rounded-full bg-ink px-4 py-2 text-[12px] text-white shadow-lg">
          {toast}
        </div>,
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
