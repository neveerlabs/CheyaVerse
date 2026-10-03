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
  notifLastId: string | null;
  notifLastAt: string | null;
  mediaCount: number;
  mediaLastId: string | null;
  msgLast: MsgPayload | null;
};

type Listener = (event: RealtimeEvent) => void;

const POLL_VISIBLE_MS = 5000;
const POLL_HIDDEN_MS = 60000;
const BACKOFF_BASE_MS = 4000;
const BACKOFF_MAX_MS = 30000;
const MAX_ERR_LEVEL = 6;

class RealtimeConnection {
  private readonly listeners = new Set<Listener>();
  private readonly recentEventKeys = new Set<string>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private inflight: AbortController | null = null;
  private source: EventSource | null = null;
  private previous: Snapshot | null = null;
  private errCount = 0;
  private streamConnected = false;
  private realtimeUnavailable = false;
  private realtimeStatusTimer: ReturnType<typeof setTimeout> | null = null;
  private refreshRequested = false;
  private forcePollRequested = false;
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

  reconnect(): void {
    if (this.stopped) return;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.source?.close();
    this.streamConnected = false;
    if (this.inflight) {
      this.refreshRequested = true;
      this.forcePollRequested = true;
      this.inflight.abort();
    }
    this.connectStream();
    this.kick(true);
  }

  reconcile(): void {
    if (this.stopped) return;
    if (
      typeof EventSource !== "undefined" &&
      this.source?.readyState === EventSource.CLOSED
    ) {
      this.connectStream();
    }
    this.kick(true);
  }

  get listenerCount(): number {
    return this.listeners.size;
  }

  start(): void {
    if (this.started || this.stopped) return;
    this.started = true;

    this.connectStream();
    this.kick();
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    if (this.realtimeStatusTimer) clearTimeout(this.realtimeStatusTimer);
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
      this.errCount = 0;
    };
    this.source.onmessage = (message) => {
      try {
        const event = JSON.parse(message.data) as RealtimeEvent;
        if (event.type === "ready") {
          this.streamConnected = true;
          this.errCount = 0;
          this.setRealtimeUnavailable(false);
          this.kick(true);
        } else if (typeof event.type === "string") {
          this.emit(event);
        }
      } catch {}
    };
    this.source.onerror = () => {
      this.streamConnected = false;
      this.kick();
    };
  }

  private setRealtimeUnavailable(unavailable: boolean, message?: string): void {
    if (!unavailable) {
      if (this.realtimeStatusTimer) clearTimeout(this.realtimeStatusTimer);
      this.realtimeStatusTimer = null;
      if (!this.realtimeUnavailable) return;
      this.realtimeUnavailable = false;
      window.dispatchEvent(
        new CustomEvent("cheya:realtime-status", {
          detail: { connected: true },
        }),
      );
      return;
    }
    if (this.realtimeUnavailable || this.realtimeStatusTimer) return;
    this.realtimeStatusTimer = setTimeout(() => {
      this.realtimeStatusTimer = null;
      if (this.stopped || this.streamConnected) return;
      this.realtimeUnavailable = true;
      window.dispatchEvent(
        new CustomEvent("cheya:realtime-status", {
          detail: {
            connected: false,
            ...(message ? { message } : {}),
          },
        }),
      );
    }, 5_000);
  }

  private emit(event: RealtimeEvent): void {
    if (event.type === "notification:new") {
      const notificationId =
        typeof event.notificationId === "string" ? event.notificationId : null;
      if (notificationId && !this.rememberEvent(`notification:${notificationId}`)) {
        return;
      }
    }
    if (event.type === "message:new") {
      const message = event.message as { id?: unknown } | undefined;
      if (
        typeof message?.id === "string" &&
        !this.rememberEvent(`message:${message.id}`)
      ) {
        return;
      }
    }
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {}
    }
  }

  private rememberEvent(key: string): boolean {
    if (this.recentEventKeys.has(key)) return false;
    this.recentEventKeys.add(key);
    if (this.recentEventKeys.size > 200) {
      const oldestKey = this.recentEventKeys.values().next().value;
      if (oldestKey) this.recentEventKeys.delete(oldestKey);
    }
    return true;
  }

  private nextInterval(): number {
    if (this.errCount > 0) {
      return Math.min(
        BACKOFF_MAX_MS,
        BACKOFF_BASE_MS * Math.min(this.errCount, MAX_ERR_LEVEL),
      );
    }
    return document.visibilityState === "visible"
      ? POLL_VISIBLE_MS
      : POLL_HIDDEN_MS;
  }

  private tick = async (force = false): Promise<void> => {
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
        if (response.status >= 500) {
          this.setRealtimeUnavailable(
            true,
            `Realtime server returned HTTP ${response.status}; it will retry automatically.`,
          );
        }
        return;
      }

      const result = await response.json().catch(() => null);
      if (!result || result.ok !== true || !result.snapshot) {
        this.errCount++;
        return;
      }

      this.errCount = 0;
      this.setRealtimeUnavailable(false);
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
          this.emit({
            type: "notification:new",
            notificationId: current.notifLastId,
          });
        }
        if (unreadChanged && current.unread < this.previous.unread) {
          this.emit({ type: "notification:read" });
        }

        const currentMessageId = current.msgLast?.id ?? "";
        const previousMessageId = this.previous.msgLast?.id ?? "";
        if (currentMessageId && currentMessageId !== previousMessageId) {
          this.emit({ type: "message:new", message: current.msgLast });
        }

        if (
          current.mediaCount !== this.previous.mediaCount ||
          current.mediaLastId !== this.previous.mediaLastId
        ) {
          this.emit({ type: "media:changed" });
        }
      }

      this.previous = current;
    } catch (error) {
      if ((error as { name?: string })?.name !== "AbortError") {
        this.errCount++;
        this.setRealtimeUnavailable(
          true,
          "Realtime polling could not reach the server; it will retry automatically.",
        );
      }
    } finally {
      if (this.inflight === controller) this.inflight = null;
      const forceNextPoll = this.forcePollRequested;
      this.forcePollRequested = false;
      if (!this.stopped) {
        const delay = this.refreshRequested || forceNextPoll ? 0 : this.nextInterval();
        this.refreshRequested = false;
        this.timer = setTimeout(() => {
          this.timer = null;
          void this.tick(forceNextPoll);
        }, delay);
      } else {
        this.refreshRequested = false;
      }
    }
  };

  private kick = (force = false): void => {
    if (this.stopped) return;
    if (this.inflight) {
      this.refreshRequested = true;
      this.forcePollRequested ||= force;
      return;
    }
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.tick(force);
    }, 0);
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

export function reconnectRealtime(
  uid: string | number,
  forceReconnect = false,
): void {
  const connection = connections.get(String(uid));
  if (forceReconnect) connection?.reconnect();
  else connection?.reconcile();
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
