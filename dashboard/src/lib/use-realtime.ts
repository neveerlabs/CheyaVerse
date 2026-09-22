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
    const es = new EventSource(url);
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
    return () => {
      es.close();
    };
  }, [uid]);
}