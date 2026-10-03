"use client";

const lockTokens = new Set<symbol>();
let savedPageState:
  | {
      scrollX: number;
      scrollY: number;
      bodyStyles: {
        position: string;
        top: string;
        left: string;
        right: string;
        width: string;
        overflow: string;
      };
      htmlStyles: {
        overflow: string;
        overscrollBehavior: string;
      };
      inertElements: Array<{ element: HTMLElement; inert: boolean }>;
    }
  | undefined;

function preventBackgroundScroll(event: Event) {
  const target = event.target;
  if (target instanceof Element && target.closest("[data-modal-scroll-allow]")) {
    return;
  }
  event.preventDefault();
}

function preventBackgroundScrollKeys(event: KeyboardEvent) {
  if (
    event.target instanceof Element &&
    event.target.closest(
      "[data-modal-scroll-allow], input, textarea, select, [contenteditable='true']",
    )
  ) {
    return;
  }
  if (
    ["ArrowDown", "ArrowUp", "End", "Home", "PageDown", "PageUp", " "].includes(
      event.key,
    )
  ) {
    event.preventDefault();
  }
}

function restorePageState() {
  const saved = savedPageState;
  if (!saved) return;
  savedPageState = undefined;

  const body = document.body.style;
  body.position = saved.bodyStyles.position;
  body.top = saved.bodyStyles.top;
  body.left = saved.bodyStyles.left;
  body.right = saved.bodyStyles.right;
  body.width = saved.bodyStyles.width;
  body.overflow = saved.bodyStyles.overflow;

  const html = document.documentElement.style;
  html.overflow = saved.htmlStyles.overflow;
  html.overscrollBehavior = saved.htmlStyles.overscrollBehavior;

  for (const { element, inert } of saved.inertElements) {
    if (element.isConnected) element.inert = inert;
  }

  window.scrollTo(saved.scrollX, saved.scrollY);
  document.removeEventListener("touchmove", preventBackgroundScroll, true);
  document.removeEventListener("wheel", preventBackgroundScroll, true);
  document.removeEventListener("keydown", preventBackgroundScrollKeys, true);
}

export function acquirePageModalLock(): () => void {
  const token = Symbol("page-modal-lock");
  lockTokens.add(token);

  if (lockTokens.size === 1) {
    const body = document.body.style;
    const html = document.documentElement.style;
    const inertElements = Array.from(
      document.querySelectorAll<HTMLElement>("main, [data-app-tabbar]"),
    ).map((element) => ({ element, inert: element.inert }));
    savedPageState = {
      scrollX: window.scrollX,
      scrollY: window.scrollY,
      bodyStyles: {
        position: body.position,
        top: body.top,
        left: body.left,
        right: body.right,
        width: body.width,
        overflow: body.overflow,
      },
      htmlStyles: {
        overflow: html.overflow,
        overscrollBehavior: html.overscrollBehavior,
      },
      inertElements,
    };

    body.position = "fixed";
    body.top = `${-window.scrollY}px`;
    body.left = `${-window.scrollX}px`;
    body.right = "0";
    body.width = "100%";
    body.overflow = "hidden";
    html.overflow = "hidden";
    html.overscrollBehavior = "none";
    for (const { element } of inertElements) element.inert = true;

    document.addEventListener("touchmove", preventBackgroundScroll, {
      capture: true,
      passive: false,
    });
    document.addEventListener("wheel", preventBackgroundScroll, {
      capture: true,
      passive: false,
    });
    document.addEventListener("keydown", preventBackgroundScrollKeys, true);
  }

  return () => {
    if (!lockTokens.delete(token) || lockTokens.size > 0) return;
    restorePageState();
  };
}
