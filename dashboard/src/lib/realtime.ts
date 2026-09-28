export type RealtimeEvent = {
  type: string;
  [key: string]: unknown;
};

type Client = {
  uid: number | null;
  send: (event: RealtimeEvent) => void;
};

const clients = new Set<Client>();

const WS_BROADCAST_URL = process.env.WS_BROADCAST_URL ?? "";
const WS_BROADCAST_SECRET = process.env.WS_BROADCAST_SECRET ?? "";

export function subscribe(client: Client): () => void {
  clients.add(client);
  return () => {
    clients.delete(client);
  };
}

function forwardToWebSocketServer(uid: number, event: RealtimeEvent): void {
  if (!WS_BROADCAST_URL) return;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (WS_BROADCAST_SECRET) {
    headers.Authorization = `Bearer ${WS_BROADCAST_SECRET}`;
  }
  void fetch(`${WS_BROADCAST_URL.replace(/\/+$/, "")}/broadcast`, {
    method: "POST",
    headers,
    body: JSON.stringify({ uid, event }),
    cache: "no-store",
  }).catch((error) => {
    console.error("[realtime] WS broadcast forward failed:", error);
  });
}

export function broadcastToUid(uid: number, event: RealtimeEvent): void {
  for (const c of clients) {
    if (c.uid !== uid) continue;
    try {
      c.send(event);
    } catch {}
  }
  forwardToWebSocketServer(uid, event);
}