"use client";

import { useEffect, useRef } from "react";
import {
  getRealtimeClient,
  type RealtimeEvent,
} from "./realtime-client";

export function useRealtime(
  uid: string | number | null | undefined,
  onEvent: (event: RealtimeEvent) => void,
): void {
  const cbRef = useRef(onEvent);

  useEffect(() => {
    cbRef.current = onEvent;
  });

  useEffect(() => {
    if (uid === null || uid === undefined || uid === "") return;
    const numUid = Number(uid);
    if (!Number.isInteger(numUid) || numUid <= 0) return;
    const client = getRealtimeClient(numUid);
    return client.onEvent((event) => {
      try {
        cbRef.current(event);
      } catch (err) {
        console.error("[realtime] handler error:", err);
      }
    });
  }, [uid]);
}