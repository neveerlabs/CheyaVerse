import { WebSocketServer } from "ws";
import http from "node:http";

const PORT = Number(process.env.PORT || 8080);
const BROADCAST_SECRET = process.env.WS_BROADCAST_SECRET || "";

const clients = new Map();

function addClient(uid, ws) {
  if (!clients.has(uid)) clients.set(uid, new Set());
  clients.get(uid).add(ws);
}

function removeClient(uid, ws) {
  const set = clients.get(uid);
  if (!set) return;
  set.delete(ws);
  if (set.size === 0) clients.delete(uid);
}

function broadcast(uid, event) {
  const set = clients.get(uid);
  if (!set) return 0;
  const payload = JSON.stringify(event);
  let delivered = 0;
  for (const ws of set) {
    if (ws.readyState === 1) {
      try {
        ws.send(payload);
        delivered++;
      } catch {}
    }
  }
  return delivered;
}

const httpServer = http.createServer((req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, users: clients.size }));
    return;
  }

  if (req.method === "POST" && req.url === "/broadcast") {
    if (BROADCAST_SECRET) {
      const auth = req.headers["authorization"] || "";
      if (auth !== `Bearer ${BROADCAST_SECRET}`) {
        res.writeHead(401).end("unauthorized");
        return;
      }
    }
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      try {
        const parsed = JSON.parse(body);
        const uid = Number(parsed?.uid);
        const event = parsed?.event;
        if (!Number.isInteger(uid) || uid <= 0 || !event || typeof event.type !== "string") {
          res.writeHead(400).end("invalid payload");
          return;
        }
        const delivered = broadcast(uid, event);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, delivered }));
      } catch {
        res.writeHead(400).end("invalid json");
      }
    });
    return;
  }

  res.writeHead(404).end();
});

const wss = new WebSocketServer({ server: httpServer });

wss.on("connection", (ws, req) => {
  let uid = 0;
  try {
    const url = new URL(req.url || "/", "http://localhost");
    uid = Number(url.searchParams.get("uid"));
  } catch {}
  if (!Number.isInteger(uid) || uid <= 0) {
    ws.close(1008, "invalid uid");
    return;
  }

  addClient(uid, ws);
  try { ws.send(JSON.stringify({ type: "ready", uid })); } catch {}

  const pingInterval = setInterval(() => {
    if (ws.readyState === 1) {
      try { ws.ping(); } catch {}
    }
  }, 30000);

  ws.on("message", (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg && msg.t === "ping") {
        ws.send(JSON.stringify({ type: "pong", ts: msg.ts }));
      }
    } catch {}
  });

  const cleanup = () => {
    clearInterval(pingInterval);
    removeClient(uid, ws);
  };

  ws.on("close", cleanup);
  ws.on("error", cleanup);
});

httpServer.listen(PORT, () => {
  console.log(`[ws] Server listening on :${PORT}`);
  console.log(`[ws] WebSocket + HTTP broadcast on same port`);
});

const shutdown = () => {
  wss.close();
  httpServer.close();
  process.exit(0);
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);