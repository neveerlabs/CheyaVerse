export type RealtimeEvent = {
  type: string;
  [key: string]: unknown;
};

export type ConnectionState =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected";

export type RealtimeClientState = {
  state: ConnectionState;
  transport: "ws";
  lastEventAt: number | null;
  lastConnectedAt: number | null;
  attempt: number;
  nextRetryAt: number | null;
};

type EventSubscriber = (event: RealtimeEvent) => void;
type StateSubscriber = (state: RealtimeClientState) => void;

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "";
const HEARTBEAT_MS = 25_000;
const WATCHDOG_MS = 60_000;

class RealtimeClient {
  private uid: number;
  private eventSubs = new Set<EventSubscriber>();
  private stateSubs = new Set<StateSubscriber>();
  private state: RealtimeClientState = {
    state: "idle",
    transport: "ws",
    lastEventAt: null,
    lastConnectedAt: null,
    attempt: 0,
    nextRetryAt: null,
  };
  private ws: WebSocket | null = null;
  private retryTimer: number | null = null;
  private heartbeatTimer: number | null = null;
  private watchdogTimer: number | null = null;
  private destroyed = false;
  private lastActivity = 0;

  constructor(uid: number) {
    this.uid = uid;
    this.connect();
  }

  destroy(): void {
    this.destroyed = true;
    this.close();
    if (this.retryTimer !== null) window.clearTimeout(this.retryTimer);
    this.eventSubs.clear();
    this.stateSubs.clear();
  }

  getState(): RealtimeClientState {
    return this.state;
  }

  onEvent(sub: EventSubscriber): () => void {
    this.eventSubs.add(sub);
    return () => this.eventSubs.delete(sub);
  }

  onState(sub: StateSubscriber): () => void {
    this.stateSubs.add(sub);
    sub(this.state);
    return () => this.stateSubs.delete(sub);
  }

  private setState(patch: Partial<RealtimeClientState>): void {
    this.state = { ...this.state, ...patch };
    for (const sub of this.stateSubs) {
      try {
        sub(this.state);
      } catch {}
    }
  }

  private emit(event: RealtimeEvent): void {
    this.lastActivity = Date.now();
    this.setState({ lastEventAt: this.lastActivity });
    for (const sub of this.eventSubs) {
      try {
        sub(event);
      } catch (err) {
        console.error("[realtime] event handler error:", err);
      }
    }
  }

  private clearTimers(): void {
    if (this.heartbeatTimer !== null) {
      window.clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.watchdogTimer !== null) {
      window.clearInterval(this.watchdogTimer);
      this.watchdogTimer = null;
    }
  }

  private close(): void {
    this.clearTimers();
    if (this.ws) {
      try {
        this.ws.onopen = null;
        this.ws.onmessage = null;
        this.ws.onclose = null;
        this.ws.onerror = null;
        this.ws.close();
      } catch {}
      this.ws = null;
    }
  }

  private connect(): void {
    if (this.destroyed) return;
    this.close();

    if (!WS_URL) {
      this.setState({ state: "disconnected", nextRetryAt: null });
      console.error("[realtime] NEXT_PUBLIC_WS_URL is not configured");
      return;
    }

    let base = WS_URL;
    if (base.startsWith("/")) {
      const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
      base = `${proto}//${window.location.host}${base}`;
    }
    const url = `${base}${base.includes("?") ? "&" : "?"}uid=${this.uid}`;

    const isRetry = this.state.attempt > 0;
    this.setState({
      state: isRetry ? "reconnecting" : "connecting",
      nextRetryAt: null,
    });

    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch (err) {
      console.error("[realtime] WebSocket creation failed:", err);
      this.scheduleReconnect();
      return;
    }

    this.ws = ws;
    this.lastActivity = Date.now();

    ws.onopen = () => {
      const wasRetry = this.state.attempt > 0;
      this.lastActivity = Date.now();
      this.setState({
        state: "connected",
        attempt: 0,
        nextRetryAt: null,
        lastConnectedAt: Date.now(),
      });

      if (this.heartbeatTimer !== null) {
        window.clearInterval(this.heartbeatTimer);
      }
      this.heartbeatTimer = window.setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          try {
            ws.send(JSON.stringify({ t: "ping", ts: Date.now() }));
          } catch {}
        }
      }, HEARTBEAT_MS);

      if (this.watchdogTimer !== null) {
        window.clearInterval(this.watchdogTimer);
      }
      this.watchdogTimer = window.setInterval(() => {
        if (Date.now() - this.lastActivity > WATCHDOG_MS) {
          console.warn("[realtime] watchdog timeout, forcing reconnect");
          try {
            ws.close();
          } catch {}
        }
      }, 15_000);

      if (wasRetry) this.emit({ type: "reconnected" });
    };

    ws.onmessage = (ev) => {
      if (typeof ev.data !== "string") return;
      this.lastActivity = Date.now();
      try {
        const data = JSON.parse(ev.data) as RealtimeEvent;
        if (data.type === "pong" || data.type === "ready") return;
        if (typeof data.type === "string") this.emit(data);
      } catch {}
    };

    ws.onclose = () => {
      if (this.destroyed) return;
      this.clearTimers();
      this.ws = null;
      this.scheduleReconnect();
    };

    ws.onerror = () => {};
  }

  private scheduleReconnect(): void {
    if (this.destroyed) return;
    const attempt = this.state.attempt + 1;
    const base = Math.min(30_000, 800 * 2 ** Math.min(attempt - 1, 5));
    const jitter = Math.random() * 500;
    const wait = base + jitter;
    this.setState({
      state: "reconnecting",
      attempt,
      nextRetryAt: Date.now() + wait,
    });
    if (this.retryTimer !== null) window.clearTimeout(this.retryTimer);
    this.retryTimer = window.setTimeout(() => {
      this.retryTimer = null;
      this.connect();
    }, wait);
  }
}

const clients = new Map<number, RealtimeClient>();

export function getRealtimeClient(uid: number): RealtimeClient {
  let client = clients.get(uid);
  if (!client) {
    client = new RealtimeClient(uid);
    clients.set(uid, client);
  }
  return client;
}

export function releaseRealtimeClient(uid: number): void {
  const client = clients.get(uid);
  if (!client) return;
  client.destroy();
  clients.delete(uid);
}

export type { RealtimeClient };