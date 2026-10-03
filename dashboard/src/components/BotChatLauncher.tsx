"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useRealtime } from "@/lib/use-realtime";
import { acquirePageModalLock } from "@/lib/page-modal-lock";
import { TelegramAvatar } from "@/components/TelegramAvatar";
import { readApiJson } from "@/lib/read-api-json";

const BotChatRoom = dynamic(
  () =>
    import("@/app/[uid]/chat/[contactId]/ChatRoomClient").then(
      (module) => module.ChatRoomClient,
    ),
  { ssr: false },
);

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

type UserChatData = {
  notifications: Notification[];
  messages: ChatMessage[];
};

type KeyboardViewport = {
  open: boolean;
  height: number;
  offsetTop: number;
};

export function BotChatLauncher({ uid }: { uid: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [unread, setUnread] = useState(0);
  const [hasDraft, setHasDraft] = useState(false);
  const [chatData, setChatData] = useState<UserChatData | null>(null);
  const [keyboardViewport, setKeyboardViewport] = useState<KeyboardViewport>({
    open: false,
    height: 0,
    offsetTop: 0,
  });
  const badgeRequestRef = useRef(false);
  const badgeRefreshQueuedRef = useRef(false);
  const dataRequestRef = useRef(false);

  const refreshDraft = useCallback(() => {
    try {
      const draft = window.localStorage.getItem(`cheya-draft:${uid}:system`);
      setHasDraft(Boolean(draft && draft.trim()));
    } catch (cause) {
      console.error("[bot-chat] failed to inspect local draft:", cause);
      setHasDraft(false);
    }
  }, [uid]);

  const refreshBadge = useCallback(async () => {
    if (badgeRequestRef.current) {
      badgeRefreshQueuedRef.current = true;
      return;
    }
    badgeRequestRef.current = true;
    try {
      const [notificationsResponse, messagesResponse] = await Promise.all([
        fetch(`/api/notifications/${encodeURIComponent(uid)}`, {
          cache: "no-store",
        }),
        fetch(`/api/messages/${encodeURIComponent(uid)}`, {
          cache: "no-store",
        }),
      ]);
      if (!notificationsResponse.ok || !messagesResponse.ok) {
        throw new Error(
          `Bot chat unread request failed (notifications: ${notificationsResponse.status}, messages: ${messagesResponse.status}).`,
        );
      }
      const [notificationData, messageData] = await Promise.all([
        readApiJson<{
          ok?: boolean;
          unread?: unknown;
          items?: Notification[];
        }>(notificationsResponse),
        readApiJson<{ ok?: boolean; items?: ChatMessage[] }>(messagesResponse),
      ]);
      if (
        notificationData?.ok !== true ||
        messageData?.ok !== true ||
        !Array.isArray(notificationData.items) ||
        !Array.isArray(messageData.items)
      ) {
        throw new Error("Bot chat unread response was invalid.");
      }
      const notificationUnread = Number(notificationData.unread);
      if (!Number.isSafeInteger(notificationUnread) || notificationUnread < 0) {
        throw new Error("Bot chat notification count was invalid.");
      }
      const unreadMessages = messageData.items.filter(
        (message) =>
          (message.sender === "bot" || message.sender_role === "admin") &&
          message.read_at === null &&
          message.deleted_at === null,
      );
      const unreadMessageIds = new Set(unreadMessages.map((message) => message.id));
      const duplicatedUnread = notificationData.items.filter(
        (notification) =>
          notification.read === 0 && unreadMessageIds.has(notification.id),
      ).length;
      setUnread(
        Math.max(0, notificationUnread + unreadMessages.length - duplicatedUnread),
      );
    } catch (cause) {
      console.error("[bot-chat] failed to refresh unread count:", cause);
    } finally {
      badgeRequestRef.current = false;
      if (badgeRefreshQueuedRef.current) {
        badgeRefreshQueuedRef.current = false;
        window.setTimeout(() => void refreshBadge(), 0);
      }
    }
  }, [uid]);

  const loadChat = useCallback(async () => {
    if (dataRequestRef.current) return;
    dataRequestRef.current = true;
    setLoading(true);
    setError("");
    try {
      const [notificationsResponse, messagesResponse] = await Promise.all([
        fetch(`/api/notifications/${encodeURIComponent(uid)}`, {
          cache: "no-store",
        }),
        fetch(`/api/messages/${encodeURIComponent(uid)}`, {
          cache: "no-store",
        }),
      ]);
      if (!notificationsResponse.ok || !messagesResponse.ok) {
        throw new Error(
          `Chat load failed (notifications: ${notificationsResponse.status}, messages: ${messagesResponse.status}).`,
        );
      }
      const [notificationData, messageData] = await Promise.all([
        readApiJson<{ ok?: boolean; items?: Notification[] }>(
          notificationsResponse,
        ),
        readApiJson<{ ok?: boolean; items?: ChatMessage[] }>(messagesResponse),
      ]);
      if (
        notificationData?.ok !== true ||
        messageData?.ok !== true ||
        !Array.isArray(notificationData.items) ||
        !Array.isArray(messageData.items)
      ) {
        throw new Error("Bot chat data response was invalid.");
      }
      setChatData({
        notifications: notificationData.items,
        messages: messageData.items,
      });
      void refreshBadge();
    } catch (cause) {
      console.error("[bot-chat] failed to load chat:", cause);
      setError("Chat bot belum dapat dimuat. Periksa koneksi lalu coba lagi.");
    } finally {
      setLoading(false);
      dataRequestRef.current = false;
    }
  }, [refreshBadge, uid]);

  const openChat = useCallback(() => {
    setOpen(true);
    window.dispatchEvent(
      new CustomEvent("cheya:bot-chat-open", { detail: { open: true } }),
    );
  }, []);

  const closeChat = useCallback(() => {
    setOpen(false);
    window.dispatchEvent(
      new CustomEvent("cheya:bot-chat-open", { detail: { open: false } }),
    );
    refreshDraft();
    void refreshBadge();
  }, [refreshBadge, refreshDraft]);

  useEffect(() => {
    void refreshBadge();
    refreshDraft();
  }, [pathname, refreshBadge, refreshDraft]);

  useEffect(() => {
    const updateDraft = () => refreshDraft();
    window.addEventListener("cheya-draft-change", updateDraft);
    window.addEventListener("storage", updateDraft);
    return () => {
      window.removeEventListener("cheya-draft-change", updateDraft);
      window.removeEventListener("storage", updateDraft);
    };
  }, [refreshDraft]);

  useEffect(() => {
    if (open) void loadChat();
  }, [loadChat, open]);

  useEffect(() => {
    if (!open) return;
    return acquirePageModalLock();
  }, [open]);

  useEffect(() => {
    if (!open) {
      setKeyboardViewport({ open: false, height: 0, offsetTop: 0 });
      return;
    }
    const visualViewport = window.visualViewport;
    if (!visualViewport) return;

    const update = () => {
      const activeElement = document.activeElement;
      const isEditing =
        activeElement instanceof HTMLInputElement ||
        activeElement instanceof HTMLTextAreaElement;
      const keyboardOpen =
        isEditing && window.innerHeight - visualViewport.height > 120;
      setKeyboardViewport({
        open: keyboardOpen,
        height: visualViewport.height,
        offsetTop: visualViewport.offsetTop,
      });
    };
    update();
    visualViewport.addEventListener("resize", update);
    visualViewport.addEventListener("scroll", update);
    document.addEventListener("focusin", update);
    document.addEventListener("focusout", update);
    return () => {
      visualViewport.removeEventListener("resize", update);
      visualViewport.removeEventListener("scroll", update);
      document.removeEventListener("focusin", update);
      document.removeEventListener("focusout", update);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeChat();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [closeChat, open]);

  useEffect(() => () => {
    window.dispatchEvent(
      new CustomEvent("cheya:bot-chat-open", { detail: { open: false } }),
    );
  }, []);

  useRealtime(uid, (event) => {
    if (
      event.type.startsWith("notification:") ||
      event.type.startsWith("message:")
    ) {
      void refreshBadge();
    }
  });

  return (
    <>
      {!open && (
        <button
          type="button"
          aria-label={`Open CheyaVerse bot chat${unread ? `, ${unread} unread` : ""}`}
          onClick={openChat}
          className="fixed bottom-[calc(122px+env(safe-area-inset-bottom))] left-3 z-[350] flex h-10 w-10 items-center justify-center overflow-visible rounded-full border border-line bg-white p-0 text-ink shadow-lg transition-transform active:scale-95"
          style={{ left: "max(12px, calc((100vw - 600px) / 2 + 12px))" }}
        >
          <TelegramAvatar src="/icon.png" className="h-full w-full rounded-full object-cover" />
          {unread > 0 && (
            <span className={`absolute flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[8px] font-bold leading-none text-white shadow-[0_0_0_2px_#fff] ${hasDraft ? "-bottom-1 -right-1" : "-right-1 -top-1"}`}>
              {unread > 99 ? "99+" : unread}
            </span>
          )}
          {hasDraft && (
            <span className="absolute -right-1 -top-1 z-10 rounded-full bg-white px-1.5 py-0.5 text-[8px] font-semibold leading-none text-ink shadow-[0_1px_4px_rgba(0,0,0,.16)]">
              Draft
            </span>
          )}
        </button>
      )}

      {open && (
        <div
          className={`fixed z-[350] flex justify-center bg-black/35 backdrop-blur-[2px] ${
            keyboardViewport.open
              ? "inset-x-0 items-start px-3"
              : "inset-0 items-center p-3 pt-[calc(12px+env(safe-area-inset-top))] pb-[calc(12px+env(safe-area-inset-bottom))]"
          }`}
          style={
            keyboardViewport.open
              ? {
                  top: keyboardViewport.offsetTop,
                  height: keyboardViewport.height,
                  paddingTop: 8,
                  paddingBottom: 8,
                }
              : undefined
          }
          onClick={closeChat}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="CheyaVerse bot chat"
            data-bot-chat-dialog="true"
            data-modal-scroll-allow="true"
            className="relative w-full max-w-[620px] overflow-hidden rounded-[26px] border border-line bg-white shadow-2xl"
            style={{
              height: keyboardViewport.open
                ? `${Math.max(220, keyboardViewport.height - 16)}px`
                : "min(82dvh, 720px)",
              maxHeight: keyboardViewport.open ? "none" : "82dvh",
            }}
            onClick={(event) => event.stopPropagation()}
          >
            {loading && (
              <div className="absolute inset-0 z-20 flex flex-col bg-white px-3 pt-3 pb-2">
                <div className="flex items-center gap-2">
                  <div className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-full border border-slate-200 bg-white px-1.5 shadow-[0_2px_8px_rgba(15,23,42,.04)]">
                    <div className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-slate-200" />
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="h-3 w-28 animate-pulse rounded-full bg-slate-200" />
                      <div className="h-2.5 w-36 animate-pulse rounded-full bg-slate-100" />
                    </div>
                    <div className="mr-1 h-8 w-8 shrink-0 animate-pulse rounded-full bg-slate-100" />
                  </div>
                  <div className="h-10 w-10 shrink-0 animate-pulse rounded-full border border-slate-200 bg-white" />
                </div>
                <div className="flex min-h-0 flex-1 flex-col justify-end gap-3 overflow-hidden px-1 py-4">
                  <div className="mb-1 flex justify-center">
                    <div className="h-7 w-16 animate-pulse rounded-full bg-slate-100" />
                  </div>
                  <div className="w-[78%] animate-pulse rounded-[18px] rounded-bl-[5px] border border-slate-100 bg-slate-100 p-3.5">
                    <div className="mb-3 h-3 w-[44%] animate-pulse rounded-full bg-slate-200" />
                    <div className="space-y-2">
                      <div className="h-3 w-full animate-pulse rounded-full bg-slate-200" />
                      <div className="h-3 w-[82%] animate-pulse rounded-full bg-slate-200" />
                      <div className="h-3 w-[62%] animate-pulse rounded-full bg-slate-200" />
                    </div>
                  </div>
                  <div className="ml-auto w-[68%] animate-pulse rounded-[18px] rounded-br-[5px] bg-slate-200 p-3">
                    <div className="mb-2 h-10 rounded-xl bg-slate-300/70" />
                    <div className="h-3 w-[72%] rounded-full bg-slate-300/70" />
                    <div className="mt-3 flex justify-end">
                      <div className="h-2 w-12 rounded-full bg-slate-300/70" />
                    </div>
                  </div>
                  <div className="w-[54%] animate-pulse rounded-[18px] rounded-bl-[5px] bg-slate-100 p-3">
                    <div className="h-3 w-[78%] rounded-full bg-slate-200" />
                    <div className="mt-2 h-2 w-10 rounded-full bg-slate-200" />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-11 min-w-0 flex-1 animate-pulse rounded-full border border-slate-200 bg-slate-50" />
                  <div className="h-11 w-11 shrink-0 animate-pulse rounded-full border border-slate-200 bg-slate-50" />
                </div>
              </div>
            )}
            {error && !loading && (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-white px-6 text-center">
                <p role="alert" className="text-sm text-ink-soft">{error}</p>
                <button
                  type="button"
                  onClick={() => void loadChat()}
                  className="rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white"
                >
                  Coba lagi
                </button>
              </div>
            )}
            {chatData && !error && (
              <BotChatRoom
                uid={uid}
                notifications={chatData.notifications}
                initialMessages={chatData.messages}
                user={null}
                isModal
                keyboardCompact={keyboardViewport.open}
                onClose={closeChat}
              />
            )}
          </div>
        </div>
      )}
    </>
  );
}
