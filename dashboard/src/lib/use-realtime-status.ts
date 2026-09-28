"use client";

import { useEffect, useState } from "react";
import {
  getRealtimeClient,
  type RealtimeClientState,
} from "./realtime-client";

const INITIAL: RealtimeClientState = {
  state: "idle",
  transport: "ws",
  lastEventAt: null,
  lastConnectedAt: null,
  attempt: 0,
  nextRetryAt: null,
};

export function useRealtimeStatus(
  uid: string | number | null | undefined,
): RealtimeClientState {
  const [state, setState] = useState<RealtimeClientState>(INITIAL);

  useEffect(() => {
    if (uid === null || uid === undefined || uid === "") return;
    const numUid = Number(uid);
    if (!Number.isInteger(numUid) || numUid <= 0) return;
    const client = getRealtimeClient(numUid);
    return client.onState(setState);
  }, [uid]);

  return state;
}