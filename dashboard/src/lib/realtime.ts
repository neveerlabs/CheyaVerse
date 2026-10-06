export type RealtimeEvent = {
  type: string;
  [key: string]: unknown;
};

type Client = {
  uid: number;
  send: (event: RealtimeEvent) => void;
};

const clients = new Set<Client>();

function deliverToLocalClients(uid: number, event: RealtimeEvent): void {
  for (const client of clients) {
    if (client.uid !== uid) continue;
    try {
      client.send(event);
    } catch (error) {
      console.error("[realtime] failed to deliver event to a local listener:", error);
    }
  }
}

export function subscribe(client: Client): () => void {
  clients.add(client);
  return () => {
    clients.delete(client);
  };
}

export function broadcastToUid(uid: number, event: RealtimeEvent): void {
  deliverToLocalClients(uid, event);
}
