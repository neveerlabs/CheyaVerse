"use client";

import { useEffect, useRef } from "react";
import type { RealtimeEvent } from "./realtime";

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
    const url = `/api/events?uid=${encodeURIComponent(String(uid))}`;
    let es: EventSource | null = null;

    const connect = () => {
      if (es) {
        try {
          es.close();
        } catch {}
        es = null;
      }
      es = new EventSource(url);
      es.onmessage = (ev) => {
        if (!ev.data) return;
        try {
          const parsed = JSON.parse(ev.data) as RealtimeEvent;
          cbRef.current(parsed);
        } catch {}
      };
      es.onerror = () => {
        // EventSource auto-reconnects on error, biarkan default behavior.
      };
    };

    connect();

    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) connect();
    };
    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      if (!es || es.readyState === EventSource.CLOSED) connect();
    };

    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", onVisibility);
      if (es) {
        try {
          es.close();
        } catch {}
        es = null;
      }
    };
  }, [uid]);
}
