import { getTurso } from "./turso";

export type RealtimeEvent = {
  type: string;
  [key: string]: unknown;
};

type Client = {
  uid: number | null;
  send: (event: RealtimeEvent) => void;
};

const clients = new Set<Client>();
const lastCounts = new Map<number, number>();
let watcherStarted = false;

export function subscribe(client: Client): () => void {
  clients.add(client);
  startWatcher();
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

async function tick() {
  const uids = new Set<number>();
  for (const c of clients) {
    if (c.uid && c.uid > 0) uids.add(c.uid);
  }
  if (uids.size === 0) return;

  for (const uid of uids) {
    try {
      const res = await getTurso().execute({
        sql: "SELECT COUNT(*) as c FROM media WHERE owner_id = ?",
        args: [uid],
      });
      const count = Number(res.rows[0]?.c ?? 0);
      const prev = lastCounts.get(uid);
      if (prev === undefined) {
        lastCounts.set(uid, count);
        continue;
      }
      if (prev !== count) {
        lastCounts.set(uid, count);
        broadcastToUid(uid, { type: "media:changed" });
      }
    } catch {}
  }
}

function startWatcher() {
  if (watcherStarted) return;
  watcherStarted = true;
  setInterval(() => {
    void tick();
  }, 3000);
}