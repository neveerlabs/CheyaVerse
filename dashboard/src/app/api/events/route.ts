import { NextRequest } from "next/server";
import { subscribe, type RealtimeEvent } from "@/lib/realtime";
import { getUserSession } from "@/lib/auth-request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const uidRaw = req.nextUrl.searchParams.get("uid");
  const uidNum = uidRaw ? Number(uidRaw) : NaN;
  const uid =
    Number.isInteger(uidNum) && uidNum > 0 ? uidNum : null;
  let session: Awaited<ReturnType<typeof getUserSession>> = null;
  try {
    session = uid ? await getUserSession(req, uid) : null;
  } catch (error) {
    console.error("[events] session verification failed:", error);
    return new Response("Realtime session verification is temporarily unavailable.", {
      status: 503,
      headers: { "Cache-Control": "no-store", "Retry-After": "5" },
    });
  }
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: RealtimeEvent) => {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
          );
        } catch {}
      };

      send({ type: "ready", uid });

      const unsubscribe = subscribe({ uid, send });

      const heartbeat = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {}
      }, 25000);

      const cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {}
      };

      req.signal.addEventListener("abort", cleanup);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}