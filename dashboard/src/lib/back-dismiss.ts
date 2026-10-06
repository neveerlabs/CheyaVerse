"use client";

import { useEffect, useRef } from "react";

type BackEntry = {
  token: string;
  previousState: unknown;
  dismiss: () => void;
  popped: boolean;
};

type BackHistoryState = Record<string, unknown> & {
  __cheyaBackDismissToken?: string;
};

const entries: BackEntry[] = [];
const overlayBackEvents = new WeakSet<Event>();
let nextToken = 0;
let listenerInstalled = false;

function isBackHistoryState(value: unknown): value is BackHistoryState {
  return value !== null && typeof value === "object";
}

function handlePopState(event: PopStateEvent): void {
  const entry = entries.pop();
  if (!entry) return;

  entry.popped = true;
  overlayBackEvents.add(event);
  event.preventDefault();
  event.stopImmediatePropagation();
  entry.dismiss();
}

function registerBackDismiss(id: string, dismiss: () => void): () => void {
  const token = `${id}:${Date.now()}:${nextToken++}`;
  const previousState = window.history.state;
  const state = isBackHistoryState(previousState) ? previousState : {};
  const entry: BackEntry = { token, previousState, dismiss, popped: false };

  window.history.pushState(
    { ...state, __cheyaBackDismissToken: token },
    "",
    window.location.href,
  );
  entries.push(entry);

  if (!listenerInstalled) {
    window.addEventListener("popstate", handlePopState, true);
    listenerInstalled = true;
  }

  return () => {
    const index = entries.indexOf(entry);
    if (index >= 0) entries.splice(index, 1);

    const currentState = window.history.state;
    if (
      !entry.popped &&
      isBackHistoryState(currentState) &&
      currentState.__cheyaBackDismissToken === token
    ) {
      window.history.replaceState(
        entry.previousState,
        "",
        window.location.href,
      );
    }

    if (entries.length === 0 && listenerInstalled) {
      window.removeEventListener("popstate", handlePopState, true);
      listenerInstalled = false;
    }
  };
}

export function wasOverlayBackDismissed(event: Event): boolean {
  return overlayBackEvents.has(event);
}

export function useBackDismiss(
  active: boolean,
  onDismiss: () => void,
  id: string,
): void {
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  useEffect(() => {
    if (!active) return;
    return registerBackDismiss(id, () => dismissRef.current());
  }, [active, id]);
}
