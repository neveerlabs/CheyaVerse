"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useRealtime } from "@/lib/use-realtime";
import { acquirePageModalLock } from "@/lib/page-modal-lock";
import { useBackDismiss } from "@/lib/back-dismiss";
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

function normalizeSystemMessage(value: string): string {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase();
}

function realtimeEventId(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

export function BotChatLauncher({
  uid,
  hideLauncher = false,
}: {
  uid: string;
  hideLauncher?: boolean;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [unread, setUnread] = useState(0);
  const [hasDraft, setHasDraft] = useState(false);
  const [launcherHiddenByModal, setLauncherHiddenByModal] = useState(false);
  const [chatData, setChatData] = useState<UserChatData | null>(null);
  const [keyboardViewport, setKeyboardViewport] = useState<KeyboardViewport>({
    open: false,
    height: 0,
    offsetTop: 0,
  });
  const badgeRequestRef = useRef(false);
  const badgeRefreshQueuedRef = useRef(false);
  const dataRequestRef = useRef(false);
  const pointerStartedInDialogRef = useRef(false);
  const seenRealtimeIdsRef = useRef(new Set<string>());
  const recentSystemMessagesRef = useRef(new Map<string, number>());
  const badgeReconcileTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const launcherUnavailable =
    pathname.startsWith(`/${uid}/profile/settings`) ||
    pathname === `/${uid}/profile/privacy` ||
    pathname === `/${uid}/profile/agreement` ||
    pathname === `/${uid}/profile/support` ||
    pathname === `/${uid}/profile/cover` ||
    pathname === `/${uid}/profile/link-device` ||
    pathname === `/${uid}/about` ||
    /^\/\d+\/(?:project|keranjang)\/[^/]+\/[^/]+\/?$/.test(pathname);

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
          (message.sender === "bot" ||
            message.sender_role === "admin" ||
            message.sender_role === "ai") &&
          message.read_at === null &&
          message.deleted_at === null,
      );
      const unreadSystemMessageContents = new Map<string, number>();
      for (const message of unreadMessages) {
        if (message.sender_role !== "admin") continue;
        const content = normalizeSystemMessage(message.content);
        unreadSystemMessageContents.set(
          content,
          (unreadSystemMessageContents.get(content) ?? 0) + 1,
        );
      }
      const duplicatedUnreadNotifications = notificationData.items.filter(
        (notification) => {
          if (notification.read !== 0) return false;
          const content = normalizeSystemMessage(notification.message);
          const matchingMessages = unreadSystemMessageContents.get(content) ?? 0;
          if (matchingMessages === 0) return false;
          unreadSystemMessageContents.set(content, matchingMessages - 1);
          return true;
        },
      ).length;
      setUnread(
        Math.max(
          0,
          notificationUnread + unreadMessages.length - duplicatedUnreadNotifications,
        ),
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
      setError("Tidak dapat memuat room chat. Pastikan koneksi internet anda stabil!");
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
  useBackDismiss(open, closeChat, "bot-chat");

  useEffect(() => {
    void refreshBadge();
    refreshDraft();
  }, [pathname, refreshBadge, refreshDraft]);

  useEffect(() => {
    if (launcherUnavailable && open) closeChat();
  }, [closeChat, launcherUnavailable, open]);

  useEffect(() => {
    if (launcherHiddenByModal && open) closeChat();
  }, [closeChat, launcherHiddenByModal, open]);

  useEffect(() => {
    const updateLauncherVisibility = () => {
      setLauncherHiddenByModal(
        Boolean(document.querySelector("[data-hide-bot-launcher='true']")),
      );
    };
    const observer = new MutationObserver(updateLauncherVisibility);
    observer.observe(document.body, { childList: true, subtree: true });
    updateLauncherVisibility();
    return () => observer.disconnect();
  }, []);

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
    if (event.type === "realtime:connected") {
      void refreshBadge();
      return;
    }

    if (event.type === "message:new") {
      const message = event.message as
        | { id?: unknown; sender?: unknown; sender_role?: unknown; content?: unknown }
        | undefined;
      if (
        !message ||
        (message.sender !== "bot" &&
          message.sender_role !== "admin" &&
          message.sender_role !== "ai")
      ) {
        return;
      }

      const id = realtimeEventId(message.id);
      if (!id || seenRealtimeIdsRef.current.has(`message:${id}`)) return;
      seenRealtimeIdsRef.current.add(`message:${id}`);

      const isAdminMessage = message.sender_role === "admin";
      const contentKey =
        isAdminMessage && typeof message.content === "string"
          ? normalizeSystemMessage(message.content)
          : "";
      const now = Date.now();
      for (const [key, timestamp] of recentSystemMessagesRef.current) {
        if (now - timestamp > 2_000) recentSystemMessagesRef.current.delete(key);
      }
      const pairedNotificationSeen =
        contentKey.length > 0 &&
        recentSystemMessagesRef.current.has(contentKey);
      if (pairedNotificationSeen) recentSystemMessagesRef.current.delete(contentKey);
      else if (contentKey) recentSystemMessagesRef.current.set(contentKey, now);
      if (!pairedNotificationSeen) {
        setUnread((current) => current + 1);
      }
    } else if (event.type === "notification:new") {
      const id = realtimeEventId(event.notificationId);
      if (!id || seenRealtimeIdsRef.current.has(`notification:${id}`)) return;
      seenRealtimeIdsRef.current.add(`notification:${id}`);

      const contentKey =
        String(event.title ?? "") === "CheyaVerse · Admin" &&
        typeof event.body === "string"
          ? normalizeSystemMessage(event.body)
          : "";
      const now = Date.now();
      for (const [key, timestamp] of recentSystemMessagesRef.current) {
        if (now - timestamp > 2_000) recentSystemMessagesRef.current.delete(key);
      }
      const pairedMessageSeen =
        contentKey.length > 0 &&
        recentSystemMessagesRef.current.has(contentKey);
      if (pairedMessageSeen) recentSystemMessagesRef.current.delete(contentKey);
      else if (contentKey) recentSystemMessagesRef.current.set(contentKey, now);
      if (!pairedMessageSeen) {
        setUnread((current) => current + 1);
      }
    } else if (
      event.type === "message:read" ||
      event.type === "notification:read" ||
      event.type === "message:deleted" ||
      event.type === "notification:deleted"
    ) {
      void refreshBadge();
      return;
    }

    if (event.type === "message:new" || event.type === "notification:new") {
      if (seenRealtimeIdsRef.current.size > 300) {
        const oldestId = seenRealtimeIdsRef.current.values().next().value;
        if (oldestId) seenRealtimeIdsRef.current.delete(oldestId);
      }
      if (badgeReconcileTimerRef.current) {
        clearTimeout(badgeReconcileTimerRef.current);
      }
      badgeReconcileTimerRef.current = setTimeout(() => {
        badgeReconcileTimerRef.current = null;
        void refreshBadge();
      }, 250);
    }
  });

  useEffect(
    () => () => {
      if (badgeReconcileTimerRef.current) {
        clearTimeout(badgeReconcileTimerRef.current);
      }
    },
    [],
  );

  return (
    <>
      {!open &&
        !launcherHiddenByModal &&
        !hideLauncher &&
        !launcherUnavailable &&
        !pathname?.endsWith("/profile/link-device") && (
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
          onPointerDownCapture={(event) => {
            pointerStartedInDialogRef.current = Boolean(
              event.target instanceof Element &&
                event.target.closest("[data-bot-chat-dialog]"),
            );
          }}
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
          onClick={(event) => {
            const shouldClose =
              event.target === event.currentTarget &&
              !pointerStartedInDialogRef.current;
            pointerStartedInDialogRef.current = false;
            if (shouldClose) closeChat();
          }}
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
            onClick={(event) => {
              pointerStartedInDialogRef.current = false;
              event.stopPropagation();
            }}
          >
            {loading && (
              <div
                role="status"
                aria-label="Loading CheyaVerse chat"
                className="absolute inset-0 z-20 flex flex-col bg-white"
              >
                <div className="shrink-0 bg-transparent px-3 pt-3 pb-2">
                  <div className="flex items-center gap-2">
                    <div className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-full border border-[#dfe3e8] bg-white px-1.5">
                      <div className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-slate-200" />
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <div className="h-3 w-28 animate-pulse rounded-full bg-slate-200" />
                        <div className="h-2.5 w-32 animate-pulse rounded-full bg-slate-100" />
                      </div>
                      <div className="mr-1 h-8 w-8 shrink-0 animate-pulse rounded-full bg-slate-100" />
                    </div>
                    <div className="h-10 w-10 shrink-0 animate-pulse rounded-full border border-[#dfe3e8] bg-white" />
                    <div className="h-10 w-10 shrink-0 animate-pulse rounded-full border border-[#dfe3e8] bg-white" />
                  </div>
                </div>
                <div className="flex min-h-0 flex-1 flex-col justify-end gap-3 overflow-hidden px-4 py-4">
                  <div className="flex justify-center pb-1">
                    <div className="h-7 w-[68px] animate-pulse rounded-full bg-[#f0f1f3]" />
                  </div>
                  <div className="w-[82%] animate-pulse rounded-[20px] rounded-bl-[6px] bg-[#f1f2f4] p-3">
                    <div className="mb-2.5 h-3 w-24 rounded-full bg-slate-300/70" />
                    <div className="space-y-1.5">
                      <div className="h-3 w-full rounded-full bg-slate-300/60" />
                      <div className="h-3 w-[86%] rounded-full bg-slate-300/60" />
                      <div className="h-3 w-[65%] rounded-full bg-slate-300/60" />
                    </div>
                  </div>
                  <div className="ml-auto w-[70%] animate-pulse rounded-[20px] rounded-br-[6px] bg-slate-900 p-3">
                    <div className="mb-2.5 h-9 rounded-xl bg-white/15" />
                    <div className="h-3 w-[72%] rounded-full bg-white/25" />
                    <div className="mt-2.5 flex justify-end">
                      <div className="h-2 w-12 rounded-full bg-white/25" />
                    </div>
                  </div>
                  <div className="ml-auto w-[58%] animate-pulse rounded-[20px] rounded-br-[6px] bg-slate-900 p-3">
                    <div className="h-3 w-[82%] rounded-full bg-white/25" />
                    <div className="mt-2.5 flex justify-end">
                      <div className="h-2 w-10 rounded-full bg-white/25" />
                    </div>
                  </div>
                </div>
                <div className="shrink-0 bg-transparent px-3 pt-2 pb-[calc(8px+env(safe-area-inset-bottom))]">
                  <div className="flex items-center gap-2">
                    <div className="flex h-11 min-w-0 flex-1 items-center rounded-[22px] border border-[#dfe3e8] bg-white px-3">
                      <div className="h-3 w-20 animate-pulse rounded-full bg-slate-200" />
                    </div>
                    <div className="h-11 w-11 shrink-0 animate-pulse rounded-full border border-[#dfe3e8] bg-white" />
                  </div>
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
                  Try again
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
                compactBubbles
                onClose={closeChat}
              />
            )}
          </div>
        </div>
      )}
    </>
  );
}
