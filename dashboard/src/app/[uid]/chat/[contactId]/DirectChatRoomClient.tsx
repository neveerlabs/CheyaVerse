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
  Mic,
} from "lucide-react";
import type { DirectMessage, TelegramUser } from "@/lib/storage";
import { useRealtime } from "@/lib/use-realtime";

type ChatContact = Pick<
  TelegramUser,
  "uid" | "username" | "first_name" | "last_name" | "photo_url"
>;
type SearchUser = ChatContact;
type SpeechRecognitionResult = {
  0: { transcript: string };
  isFinal: boolean;
};
type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResult>;
};
type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};
type SpeechWindow = Window & {
  SpeechRecognition?: new () => SpeechRecognitionLike;
  webkitSpeechRecognition?: new () => SpeechRecognitionLike;
};

function userName(user: ChatContact): string {
  const fullName = [user.first_name, user.last_name].filter(Boolean).join(" ").trim();
  return fullName || (user.username ? `@${user.username}` : `Telegram ${user.uid}`);
}

function messageTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
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
  const [recognizing, setRecognizing] = useState(false);
  const [viewport, setViewport] = useState({ top: 0, height: 0, keyboard: false });
  const messageBoxRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const voiceBaseTextRef = useRef("");
  const refreshBusyRef = useRef(false);
  const pendingIdsRef = useRef(new Set<string>());
  const toastTimerRef = useRef<number | null>(null);
  const previousTitleRef = useRef("");

  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(""), 2600);
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
    messagesRef.current = messages;
  }, [messages]);

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

  useEffect(
    () => () => {
      if (recognitionRef.current) recognitionRef.current.stop();
      if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
    },
    [],
  );

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
          if (typeof Notification !== "undefined" && Notification.permission === "granted") {
            try {
              new Notification(name, {
                body: incoming.content,
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
    };
    pendingIdsRef.current.add(tempId);
    setMessages((current) => [...current, optimistic]);
    try {
      const response = await fetch(`/api/chats/${contact.uid}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
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
      await navigator.clipboard.writeText(message.content);
      showToast("Pesan disalin.");
    } catch (error) {
      console.error("[direct-chat] clipboard write failed:", error);
      showToast("Tidak dapat menyalin pesan.");
    }
    setSelectedMessage(null);
  }

  function toggleVoiceInput() {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
      setRecognizing(false);
      return;
    }
    const speech = window as SpeechWindow;
    const Constructor = speech.SpeechRecognition ?? speech.webkitSpeechRecognition;
    if (!Constructor) {
      showToast("Dikte suara tidak didukung browser ini.");
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
      setRecognizing(false);
      recognitionRef.current = null;
      showToast("Dikte suara tidak berhasil. Coba lagi.");
    };
    recognition.onend = () => {
      setRecognizing(false);
      recognitionRef.current = null;
    };
    recognitionRef.current = recognition;
    setRecognizing(true);
    recognition.start();
  }

  const visibleMessages = messages.filter((message) =>
    searchText.trim()
      ? message.content.toLowerCase().includes(searchText.trim().toLowerCase())
      : true,
  );

  return (
    <div
      className="fixed left-0 right-0 z-50 mx-auto flex max-w-[600px] flex-col overflow-hidden bg-white"
      style={{ top: viewport.top, height: viewport.height || "100dvh" }}
    >
      <header className="relative z-20 flex h-[62px] flex-shrink-0 items-center gap-2 border-b border-line bg-white px-3">
        <Link
          href={`/${uid}/chat`}
          aria-label="Kembali ke chat"
          className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-ink-soft"
        >
          <ArrowLeft size={21} />
        </Link>
        <Link
          href={`/${uid}/profile/contact/${contact.uid}`}
          className="flex min-w-0 flex-1 items-center gap-2.5"
          aria-label={`Lihat profil ${name}`}
        >
          <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border border-line bg-[#f5f5f5]">
            {contact.photo_url ? (
              // Telegram profile photos may be remote URLs.
              <img src={contact.photo_url} alt="" className="h-full w-full object-cover" />
            ) : (
              <UserRound size={18} className="text-ink-mute" />
            )}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[14px] font-semibold text-ink">{name}</span>
            {contact.username && (
              <span className="block truncate text-[11px] text-ink-mute">
                @{contact.username}
              </span>
            )}
          </span>
        </Link>
        <button
          type="button"
          aria-label="Opsi percakapan"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((value) => !value)}
          className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-ink-soft"
        >
          <MoreVertical size={19} />
        </button>
        {menuOpen && (
          <div className="absolute right-3 top-[54px] z-30 w-48 overflow-hidden rounded-xl border border-line bg-white py-1 shadow-xl">
            <Link
              href={`/${uid}/profile/contact/${contact.uid}`}
              onClick={() => setMenuOpen(false)}
              className="block px-4 py-3 text-left text-[13px] text-ink"
            >
              Lihat profil
            </Link>
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
          className="flex flex-shrink-0 items-center gap-2 border-b border-line bg-[#fafafa] px-4 py-2 text-left"
        >
          <Pin size={14} className="flex-shrink-0 text-ink-soft" />
          <span className="truncate text-[12px] text-ink-soft">
            {pinned.deleted_at ? "Pesan dihapus" : pinned.content}
          </span>
        </button>
      )}

      <div
        ref={messageBoxRef}
        onContextMenu={(event) => event.preventDefault()}
        className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain px-4 py-3"
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
                className={`flex ${mine ? "justify-end" : "justify-start"}`}
              >
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => setSelectedMessage(message)}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    setSelectedMessage(message);
                  }}
                  className={`max-w-[86%] rounded-2xl px-3 py-2 text-left disabled:cursor-wait ${
                    mine
                      ? "rounded-tr-md bg-ink text-white"
                      : "rounded-tl-md bg-[#f2f2f2] text-ink"
                  }`}
                >
                  {message.forwarded_from_uid && (
                    <span className={`mb-1 block text-[10px] italic ${mine ? "text-white/60" : "text-ink-mute"}`}>
                      Diteruskan
                    </span>
                  )}
                  <span
                    className={`block whitespace-pre-wrap break-words text-[13.5px] leading-[1.45] ${
                      message.deleted_at ? "italic opacity-65" : ""
                    }`}
                  >
                    {message.deleted_at ? "Pesan dihapus" : message.content}
                  </span>
                  <span
                    className={`mt-1 flex items-center justify-end gap-1 text-[10px] ${
                      mine ? "text-white/65" : "text-ink-mute"
                    }`}
                  >
                    {message.edited_at && !message.deleted_at && <span>diedit</span>}
                    {message.is_pinned && <Pin size={10} />}
                    {messageTime(message.created_at)}
                    {mine && <StatusIcon message={message} pending={isPending} />}
                  </span>
                </button>
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
        className={`flex flex-shrink-0 items-end gap-2 border-t border-line bg-white px-3 pt-2 ${
          viewport.keyboard
            ? "pb-2"
            : "pb-[calc(8px+env(safe-area-inset-bottom))]"
        }`}
      >
        <div className="min-w-0 flex-1">
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
            onChange={(event) => setText(event.target.value)}
            onInput={(event) => {
              event.currentTarget.style.height = "auto";
              event.currentTarget.style.height = `${Math.min(event.currentTarget.scrollHeight, 120)}px`;
            }}
            placeholder={recognizing ? "Mendengarkan…" : "Pesan"}
            className="max-h-[120px] min-h-10 w-full resize-none rounded-2xl border border-line bg-white px-3 py-2 text-[14px] leading-5 outline-none"
          />
        </div>
        {text.trim() ? (
          <button
            type="submit"
            disabled={sending}
            aria-label={editingId ? "Simpan edit" : "Kirim pesan"}
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-ink text-white disabled:opacity-50"
          >
            <Send size={17} />
          </button>
        ) : (
          <button
            type="button"
            aria-label={recognizing ? "Hentikan dikte suara" : "Dikte suara"}
            onClick={toggleVoiceInput}
            className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full ${
              recognizing ? "bg-danger text-white" : "bg-ink text-white"
            }`}
          >
            <Mic size={17} />
          </button>
        )}
      </form>

      {selectedMessage && (
        <div
          role="presentation"
          onClick={() => setSelectedMessage(null)}
          className="fixed inset-0 z-[70] flex items-end justify-center bg-black/25 px-4 pb-[calc(16px+env(safe-area-inset-bottom))]"
        >
          <section
            role="dialog"
            aria-label="Aksi pesan"
            onClick={(event) => event.stopPropagation()}
            className="w-full max-w-[560px] overflow-hidden rounded-2xl bg-white pb-1 shadow-2xl"
          >
            <div className="border-b border-line px-4 py-3">
              <p className="line-clamp-2 whitespace-pre-wrap break-words text-[12.5px] text-ink-soft">
                {selectedMessage.deleted_at ? "Pesan dihapus" : selectedMessage.content}
              </p>
            </div>
            <button type="button" onClick={() => void copyMessage(selectedMessage)} className="flex w-full items-center gap-3 px-4 py-3 text-[13px] text-ink">
              <Copy size={17} /> Salin
            </button>
            {selectedMessage.sender_uid === myUid && !selectedMessage.deleted_at && (
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
