"use client";

import {
  createClient,
  type RealtimeChannel,
  type SupabaseClient,
} from "@supabase/supabase-js";
import { useEffect, useRef } from "react";
import type { RealtimeEvent } from "./realtime";

type Listener = (event: RealtimeEvent) => void;
type ChangePayload = {
  eventType: string;
  new: Record<string, unknown>;
  old: Record<string, unknown>;
};

const TOKEN_REFRESH_MS = 45 * 60 * 1000;
const RECONNECT_BASE_MS = 2_000;
const RECONNECT_MAX_MS = 30_000;

class SupabaseRealtimeConnection {
  private readonly listeners = new Set<Listener>();
  private client: SupabaseClient | null = null;
  private channel: RealtimeChannel | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private tokenRefreshTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private connecting = false;
  private stopped = false;

  constructor(private readonly uid: string) {}

  addListener(listener: Listener): void {
    this.listeners.add(listener);
  }

  removeListener(listener: Listener): void {
    this.listeners.delete(listener);
  }

  get listenerCount(): number {
    return this.listeners.size;
  }

  start(): void {
    this.stopped = false;
    void this.connect();
  }

  stop(): void {
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.tokenRefreshTimer) clearTimeout(this.tokenRefreshTimer);
    this.reconnectTimer = null;
    this.tokenRefreshTimer = null;
    const client = this.client;
    const channel = this.channel;
    this.client = null;
    this.channel = null;
    if (client && channel) {
      void client.removeChannel(channel);
    }
    if (client) {
      void client.realtime.disconnect();
    }
  }

  reconnect(): void {
    if (this.stopped) return;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.tokenRefreshTimer) clearTimeout(this.tokenRefreshTimer);
    this.reconnectTimer = null;
    this.tokenRefreshTimer = null;
    const client = this.client;
    const channel = this.channel;
    this.channel = null;
    if (client && channel) void client.removeChannel(channel);
    if (client) void client.realtime.disconnect();
    this.client = null;
    void this.connect();
  }

  reconcile(): void {
    if (this.stopped || this.channel || this.connecting) return;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    void this.connect();
  }

  private async getAccessToken(): Promise<string> {
    const response = await fetch(
      `/api/realtime/token?uid=${encodeURIComponent(this.uid)}`,
      { cache: "no-store" },
    );
    if (!response.ok) {
      throw new Error(`Realtime token request failed (${response.status}).`);
    }
    const result = (await response.json()) as { token?: unknown };
    if (typeof result.token !== "string" || !result.token) {
      throw new Error("Realtime token response was invalid.");
    }
    return result.token;
  }

  private async connect(): Promise<void> {
    if (this.stopped || this.connecting || this.channel) return;
    this.connecting = true;
    try {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (!url || !anonKey) {
        throw new Error("Supabase Realtime is not configured.");
      }

      let accessToken = await this.getAccessToken();
      if (this.stopped) return;

      const client = createClient(url, anonKey, {
        auth: {
          autoRefreshToken: false,
          detectSessionInUrl: false,
          persistSession: false,
        },
        accessToken: async () => accessToken,
        realtime: { params: { eventsPerSecond: 20 } },
      });
      this.client = client;
      await client.realtime.setAuth(accessToken);

      const channel = client
        .channel(`cheyaverse-user-${this.uid}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "messages",
            filter: `uid=eq.${this.uid}`,
          },
          (payload) => this.handleMessageChange(payload as ChangePayload),
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "notifications",
            filter: `uid=eq.${this.uid}`,
          },
          (payload) => this.handleNotificationChange(payload as ChangePayload),
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "chat_message_hides",
            filter: `uid=eq.${this.uid}`,
          },
          (payload) => {
            const change = payload as ChangePayload;
            const messageId = String(
              (change.new.message_id ?? change.old.message_id ?? ""),
            );
            if (messageId && change.eventType === "INSERT") {
              this.emit({ type: "message:hidden", messageId });
            } else if (messageId && change.eventType === "DELETE") {
              this.emit({ type: "message:unhidden", messageId });
            }
          },
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "chat_message_pins",
            filter: `uid=eq.${this.uid}`,
          },
          (payload) => {
            const change = payload as ChangePayload;
            const messageId = String(
              change.new.message_id ?? change.old.message_id ?? "",
            );
            if (messageId) {
              this.emit({
                type: "message:pinned",
                messageId,
                pinned: change.eventType !== "DELETE",
              });
            }
          },
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "chat_notification_pins",
            filter: `uid=eq.${this.uid}`,
          },
          (payload) => {
            const change = payload as ChangePayload;
            const notificationId = String(
              change.new.notification_id ?? change.old.notification_id ?? "",
            );
            if (notificationId) {
              this.emit({
                type: "notification:pinned",
                notificationId,
                pinned: change.eventType !== "DELETE",
              });
            }
          },
        )
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "session_blacklist",
            filter: `uid=eq.${this.uid}`,
          },
          (payload) => {
            const change = payload as ChangePayload;
            const deviceId = change.new.device_id;
            if (typeof deviceId === "string") {
              this.emit({ type: "session:blocked", deviceId });
            }
          },
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "library_nodes",
            filter: `owner_uid=eq.${this.uid}`,
          },
          () => this.emit({ type: "library:changed" }),
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "media",
            filter: `owner_id=eq.${this.uid}`,
          },
          () => this.emit({ type: "media:changed" }),
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "user_covers",
            filter: `uid=eq.${this.uid}`,
          },
          () => this.emit({ type: "cover:changed" }),
        );
      this.channel = channel;
      channel.subscribe((status, error) => {
        if (this.channel !== channel) return;
        if (status === "SUBSCRIBED") {
          this.reconnectAttempts = 0;
          if (this.tokenRefreshTimer) clearTimeout(this.tokenRefreshTimer);
          this.tokenRefreshTimer = setTimeout(
            () => void this.refreshToken(),
            TOKEN_REFRESH_MS,
          );
          this.emit({ type: "realtime:connected" });
          return;
        }
        if (
          status === "CHANNEL_ERROR" ||
          status === "TIMED_OUT" ||
          status === "CLOSED"
        ) {
          if (error) {
            console.error("[realtime] Supabase channel disconnected:", error);
          }
          this.scheduleReconnect();
        }
      });
    } catch (error) {
      if (!this.stopped) {
        console.error("[realtime] Supabase WebSocket connection failed:", error);
        this.scheduleReconnect();
      }
    } finally {
      this.connecting = false;
    }
  }

  private async refreshToken(): Promise<void> {
    if (this.stopped || !this.client) return;
    try {
      const token = await this.getAccessToken();
      if (this.stopped || !this.client) return;
      await this.client.realtime.setAuth(token);
      this.tokenRefreshTimer = setTimeout(
        () => void this.refreshToken(),
        TOKEN_REFRESH_MS,
      );
    } catch (error) {
      console.error("[realtime] Supabase token refresh failed:", error);
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer) return;
    if (this.tokenRefreshTimer) clearTimeout(this.tokenRefreshTimer);
    this.tokenRefreshTimer = null;
    const client = this.client;
    const channel = this.channel;
    this.client = null;
    this.channel = null;
    if (client && channel) void client.removeChannel(channel);
    if (client) void client.realtime.disconnect();

    const delay = Math.min(
      RECONNECT_MAX_MS,
      RECONNECT_BASE_MS * 2 ** Math.min(this.reconnectAttempts, 4),
    );
    this.reconnectAttempts += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect();
    }, delay);
  }

  private handleMessageChange(payload: ChangePayload): void {
    if (payload.eventType === "INSERT") {
      this.emit({ type: "message:new", message: payload.new });
      return;
    }
    if (payload.eventType === "DELETE") {
      this.emit({
        type: "message:deleted",
        messageId: String(payload.old.id ?? ""),
      });
      return;
    }

    const previous = payload.old;
    const message = payload.new;
    if (previous.read_at !== message.read_at && message.read_at) {
      this.emit({
        type: "message:read",
        messageId: String(message.id ?? ""),
        read_at: message.read_at,
      });
    } else if (previous.delivered_at !== message.delivered_at && message.delivered_at) {
      this.emit({
        type: "message:delivered",
        messageId: String(message.id ?? ""),
        delivered_at: message.delivered_at,
      });
    } else {
      this.emit({ type: "message:updated", message });
    }
  }

  private handleNotificationChange(payload: ChangePayload): void {
    if (payload.eventType === "INSERT") {
      this.emit({
        type: "notification:new",
        notificationId: String(payload.new.id ?? ""),
        title: String(payload.new.title ?? "CheyaVerse"),
        body: String(payload.new.message ?? ""),
      });
      return;
    }
    if (payload.eventType === "DELETE") {
      this.emit({
        type: "notification:deleted",
        notificationId: String(payload.old.id ?? ""),
      });
      return;
    }
    if (payload.old.read !== payload.new.read && Number(payload.new.read) === 1) {
      this.emit({ type: "notification:read" });
    }
  }

  private emit(event: RealtimeEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        console.error("[realtime] subscriber callback failed:", error);
      }
    }
  }
}

const connections = new Map<string, SupabaseRealtimeConnection>();

function subscribe(uid: string, listener: Listener): () => void {
  let connection = connections.get(uid);
  if (!connection) {
    connection = new SupabaseRealtimeConnection(uid);
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
): void {
  const callbackRef = useRef(onEvent);
  callbackRef.current = onEvent;

  useEffect(() => {
    if (uid === null || uid === undefined || uid === "") return;
    return subscribe(String(uid), (event) => callbackRef.current(event));
  }, [uid]);
}
