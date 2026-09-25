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
  notifCount: number;
  unread: number;
  msgCount: number;
  mediaCount: number;
  notifLastAt: string | null;
  mediaLastId: string | null;
  msgLast: MsgPayload | null;
};

const VISIBLE_MS = 2500;
const HIDDEN_MS = 30000;
const BACKOFF_BASE_MS = 4000;
const BACKOFF_MAX_MS = 30000;
const MAX_ERR_LEVEL = 6;

export function useRealtime(
  uid: string | number | null | undefined,
  onEvent: (event: RealtimeEvent) => void,
) {
  const cbRef = useRef(onEvent);

  useEffect(() => {
    cbRef.current = onEvent;
  });

  useEffect(() => {
    if (uid === null || uid === undefined || uid === "") return;
    const u = encodeURIComponent(String(uid));

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let prev: Snapshot | null = null;
    let errCount = 0;
    let inflight: AbortController | null = null;

    const emit = (event: RealtimeEvent) => {
      try {
        cbRef.current(event);
      } catch (err) {
        console.error("[realtime] handler error:", err);
      }
    };

    const nextInterval = (): number => {
      if (errCount > 0) {
        return Math.min(
          BACKOFF_MAX_MS,
          BACKOFF_BASE_MS * Math.min(errCount, MAX_ERR_LEVEL),
        );
      }
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        return VISIBLE_MS;
      }
      return HIDDEN_MS;
    };

    const tick = async () => {
      if (cancelled) return;

      if (inflight) {
        try { inflight.abort(); } catch {}
      }
      inflight = new AbortController();
      const ac = inflight;

      try {
        const res = await fetch(`/api/events/poll?uid=${u}`, {
          cache: "no-store",
          signal: ac.signal,
        });
        if (!res.ok) {
          errCount++;
          return;
        }
        const j = await res.json().catch(() => null);
        if (!j || j.ok !== true || !j.snapshot) {
          if (j && j.error === "invalid_uid") {
            errCount = MAX_ERR_LEVEL;
          } else {
            errCount++;
          }
          return;
        }

        errCount = 0;
        const cur = j.snapshot as Snapshot;

        if (prev) {
          const notifDelta =
            cur.unread !== prev.unread || cur.notifCount !== prev.notifCount;
          if (notifDelta) {
            if (cur.unread > prev.unread || cur.notifCount > prev.notifCount) {
              emit({ type: "notification:new" });
            }
            if (cur.unread < prev.unread) {
              emit({ type: "notification:read" });
            }
          }

          const lastId = cur.msgLast?.id ?? "";
          const prevLastId = prev.msgLast?.id ?? "";
          if (lastId && lastId !== prevLastId) {
            emit({ type: "message:new", message: cur.msgLast });
          }

          const mediaDelta =
            cur.mediaCount !== prev.mediaCount ||
            cur.mediaLastId !== prev.mediaLastId;
          if (mediaDelta) {
            emit({ type: "media:changed" });
          }
        }

        prev = cur;
      } catch (err) {
        const name = (err as { name?: string })?.name;
        if (name === "AbortError") return;
        errCount++;
      } finally {
        if (!cancelled) {
          timer = setTimeout(tick, nextInterval());
        }
      }
    };

    const kick = () => {
      if (cancelled) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(tick, 0);
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") kick();
    };
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) kick();
    };

    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("visibilitychange", onVisibility);

    kick();

    return () => {
      cancelled = true;
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", onVisibility);
      if (timer) clearTimeout(timer);
      if (inflight) {
        try { inflight.abort(); } catch {}
      }
    };
  }, [uid]);
}
