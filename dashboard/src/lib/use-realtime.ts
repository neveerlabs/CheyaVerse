"use client";

import { useEffect, useRef } from "react";
import type { RealtimeEvent } from "./realtime";

type MsgPayload = {
  id: string;
  uid: number;
  sender: "user" | "bot";
  sender_role: string;
  title: string | null;
  content: string;
  created_at: string;
  delivered_at: string | null;
  read_at: string | null;
};

type Snapshot = {
  unread: number;
  directUnread: number;
  notifLastId: string | null;
  notifLastAt: string | null;
  mediaCount: number;
  mediaLastId: string | null;
  msgLast: MsgPayload | null;
  directLast: {
    id: string;
    sender_uid: number;
    recipient_uid: number;
    content: string;
    created_at: string;
    delivered_at: string | null;
    read_at: string | null;
  } | null;
};

type Listener = (event: RealtimeEvent) => void;

const FALLBACK_VISIBLE_MS = 5000;
const FALLBACK_HIDDEN_MS = 30000;
const BACKOFF_BASE_MS = 4000;
const BACKOFF_MAX_MS = 30000;
const MAX_ERR_LEVEL = 6;

class RealtimeConnection {
  private readonly listeners = new Set<Listener>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private inflight: AbortController | null = null;
  private source: EventSource | null = null;
  private previous: Snapshot | null = null;
  private errCount = 0;
  private streamConnected = false;
  private refreshRequested = false;
  private started = false;
  private stopped = false;

  constructor(private readonly uid: string) {}

  addListener(listener: Listener): void {
    this.listeners.add(listener);
    this.kick();
  }

  removeListener(listener: Listener): void {
    this.listeners.delete(listener);
  }

  get listenerCount(): number {
    return this.listeners.size;
  }

  start(): void {
    if (this.started || this.stopped) return;
    this.started = true;

    this.connectStream();

    window.addEventListener("pageshow", this.onPageShow);
    window.addEventListener("popstate", this.onPopState);
    window.addEventListener("online", this.onOnline);
    document.addEventListener("visibilitychange", this.onVisibility);
    this.kick();
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    window.removeEventListener("pageshow", this.onPageShow);
    window.removeEventListener("popstate", this.onPopState);
    window.removeEventListener("online", this.onOnline);
    document.removeEventListener("visibilitychange", this.onVisibility);
    if (this.timer) clearTimeout(this.timer);
    this.source?.close();
    this.inflight?.abort();
  }

  private connectStream(): void {
    if (this.stopped || typeof EventSource === "undefined") return;
    this.source?.close();
    this.streamConnected = false;
    this.source = new EventSource(
      `/api/events?uid=${encodeURIComponent(this.uid)}`,
    );
    this.source.onopen = () => {
      this.streamConnected = true;
      this.errCount = 0;
    };
    this.source.onmessage = (message) => {
      try {
        const event = JSON.parse(message.data) as RealtimeEvent;
        if (typeof event.type === "string" && event.type !== "ready") {
          this.emit(event);
        }
      } catch {}
    };
    this.source.onerror = () => {
      this.streamConnected = false;
      this.kick();
    };
  }

  private emit(event: RealtimeEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {}
    }
  }

  private nextInterval(): number {
    if (!this.streamConnected && this.errCount === 0) return 2500;
    if (this.errCount > 0) {
      return Math.min(
        BACKOFF_MAX_MS,
        BACKOFF_BASE_MS * Math.min(this.errCount, MAX_ERR_LEVEL),
      );
    }
    return document.visibilityState === "visible"
      ? FALLBACK_VISIBLE_MS
      : FALLBACK_HIDDEN_MS;
  }

  private tick = async (): Promise<void> => {
    if (this.stopped || this.inflight) return;

    const controller = new AbortController();
    this.inflight = controller;

    try {
      const response = await fetch(
        `/api/events/poll?uid=${encodeURIComponent(this.uid)}`,
        { cache: "no-store", signal: controller.signal },
      );
      if (!response.ok) {
        this.errCount++;
        return;
      }

      const result = await response.json().catch(() => null);
      if (!result || result.ok !== true || !result.snapshot) {
        this.errCount++;
        return;
      }

      this.errCount = 0;
      const current = result.snapshot as Snapshot;

      if (this.previous) {
        const unreadChanged = current.unread !== this.previous.unread;
        const notificationAdded =
          current.notifLastId !== this.previous.notifLastId;
        const currentNotificationTime = Date.parse(current.notifLastAt ?? "");
        const previousNotificationTime = Date.parse(
          this.previous.notifLastAt ?? "",
        );
        const isNewNotification =
          notificationAdded &&
          Number.isFinite(currentNotificationTime) &&
          currentNotificationTime >= previousNotificationTime;
        if (
          current.unread > this.previous.unread ||
          isNewNotification
        ) {
          this.emit({ type: "notification:new" });
        }
        if (unreadChanged && current.unread < this.previous.unread) {
          this.emit({ type: "notification:read" });
        }

        if (current.directUnread !== this.previous.directUnread) {
          this.emit({ type: "direct-unread:changed" });
        }

        const currentMessageId = current.msgLast?.id ?? "";
        const previousMessageId = this.previous.msgLast?.id ?? "";
        if (currentMessageId && currentMessageId !== previousMessageId) {
          this.emit({ type: "message:new", message: current.msgLast });
        }

        const currentDirectId = current.directLast?.id ?? "";
        const previousDirectId = this.previous.directLast?.id ?? "";
        if (currentDirectId && currentDirectId !== previousDirectId) {
          this.emit({
            type: "direct-message:new",
            message: current.directLast,
          });
        }
        if (
          currentDirectId &&
          currentDirectId === previousDirectId &&
          current.directLast?.read_at &&
          current.directLast.read_at !== this.previous.directLast?.read_at
        ) {
          this.emit({
            type: "direct-message:read",
            uid: current.directLast.recipient_uid,
            messageId: currentDirectId,
            read_at: current.directLast.read_at,
          });
        }

        if (
          current.mediaCount !== this.previous.mediaCount ||
          current.mediaLastId !== this.previous.mediaLastId
        ) {
          this.emit({ type: "media:changed" });
        }
      } else if (current.directLast) {
        this.emit({
          type: "direct-message:new",
          message: current.directLast,
        });
      }

      this.previous = current;
    } catch (error) {
      if ((error as { name?: string })?.name !== "AbortError") {
        this.errCount++;
      }
    } finally {
      if (this.inflight === controller) this.inflight = null;
      if (!this.stopped) {
        const delay = this.refreshRequested ? 0 : this.nextInterval();
        this.refreshRequested = false;
        this.timer = setTimeout(() => {
          this.timer = null;
          void this.tick();
        }, delay);
      }
    }
  };

  private kick = (): void => {
    if (this.stopped) return;
    if (this.inflight) {
      this.refreshRequested = true;
      return;
    }
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.tick();
    }, 0);
  };

  private onVisibility = (): void => {
    if (document.visibilityState === "visible" && !this.streamConnected) {
      this.kick();
    }
  };

  private onPageShow = (event: PageTransitionEvent): void => {
    if (event.persisted) {
      this.connectStream();
      this.kick();
    }
  };

  private onPopState = (): void => {
    this.connectStream();
    this.kick();
  };

  private onOnline = (): void => {
    if (!this.streamConnected) this.kick();
  };
}

const connections = new Map<string, RealtimeConnection>();

function subscribe(uid: string, listener: Listener): () => void {
  let connection = connections.get(uid);
  if (!connection) {
    connection = new RealtimeConnection(uid);
    connections.set(uid, connection);
  }

  connection.addListener(listener);
  connection.start();

  return () => {
    connection?.removeListener(listener);
    if (connection?.listenerCount === 0) {
      connection.stop();
      connections.delete(uid);
    }
  };
}

export function useRealtime(
  uid: string | number | null | undefined,
  onEvent: (event: RealtimeEvent) => void,
) {
  const cbRef = useRef(onEvent);
  cbRef.current = onEvent;

  useEffect(() => {
    if (uid === null || uid === undefined || uid === "") return;
    return subscribe(String(uid), (event) => cbRef.current(event));
  }, [uid]);
}
