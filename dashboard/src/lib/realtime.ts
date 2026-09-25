export type RealtimeEvent = {
  type: string;
  [key: string]: unknown;
};

type Client = {
  uid: number | null;
  send: (event: RealtimeEvent) => void;
};

const clients = new Set<Client>();

export function subscribe(client: Client): () => void {
  clients.add(client);
  return () => {
    clients.delete(client);
  };
}

export function broadcastToUid(uid: number, event: RealtimeEvent) {
  for (const c of clients) {
    if (c.uid !== uid) continue;
    try {
      c.send(event);
    } catch {}
  }
}
