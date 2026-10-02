"use client";

import {
  Bug,
  Camera,
  Check,
  Copy,
  ImagePlus,
  Maximize2,
  Minimize2,
  Send,
  Trash2,
  X,
} from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { readApiJson } from "@/lib/read-api-json";

type CapturedIssue = {
  message: string;
  stack?: string;
  page: string;
  time: string;
};

type ReportAttachment = {
  id: string;
  name: string;
  dataUrl: string;
};

type ClientIssueEvent = CustomEvent<{
  message: string;
  stack?: string;
  urgent?: boolean;
}>;

type ScreenWakeLockSentinel = {
  release: () => Promise<void>;
};

const MAX_ISSUES = 12;
const ISSUE_DEDUPE_MS = 60_000;
const MAX_ATTACHMENTS = 4;
const MAX_ATTACHMENT_BYTES = 8_000_000;
const MAX_TOTAL_ATTACHMENT_BYTES = 12_000_000;
const MAX_SOURCE_IMAGE_BYTES = 8_000_000;
const MAX_IMAGE_EDGE = 1440;
const JPEG_QUALITIES = [0.92, 0.88, 0.84, 0.8, 0.76, 0.72, 0.68, 0.64, 0.6, 0.56, 0.52, 0.48];

function redact(value: string): string {
  return value
    .replace(/\bgithub_pat_[A-Za-z0-9_]+\b/g, "[REDACTED_GITHUB_TOKEN]")
    .replace(/\bgh[pousr]_[A-Za-z0-9_]+\b/g, "[REDACTED_GITHUB_TOKEN]")
    .replace(/\bBearer\s+\S+/gi, "Bearer [REDACTED]")
    .replace(/\b\d{7,12}:[A-Za-z0-9_-]{25,}\b/g, "[REDACTED_BOT_TOKEN]")
    .replace(/([?&](?:token|auth|key|secret|password)=)[^&#\s]+/gi, "$1[REDACTED]")
    .slice(0, 2000);
}

function formatIssues(issues: CapturedIssue[]): string {
  return issues
    .map(
      (issue) =>
        `[${issue.time}] ${issue.page}\nMasalah: ${issue.message}${
          issue.stack ? `\nDetail teknis:\n${issue.stack.split("\n").slice(0, 5).join("\n")}` : ""
        }`,
    )
    .join("\n\n")
    .slice(0, 8000);
}

function readBlobAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(new Error("Gambar tidak dapat dibaca."));
    reader.onerror = () => reject(new Error("Gambar tidak dapat dibaca."));
    reader.readAsDataURL(blob);
  });
}

function attachmentBytes(dataUrl: string): number {
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

function totalAttachmentBytes(items: ReportAttachment[]): number {
  return items.reduce((total, item) => total + attachmentBytes(item.dataUrl), 0);
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality?: number,
): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

async function captureViewportCanvas(): Promise<HTMLCanvasElement> {
  const viewportWidth =
    document.documentElement.clientWidth || window.innerWidth;
  const viewportHeight = window.innerHeight;
  const deviceScale = Math.max(1, window.devicePixelRatio || 1);
  const scale = Math.min(
    2,
    deviceScale,
    16_000 / viewportWidth,
    16_000 / viewportHeight,
  );
  const { domToCanvas } = await import("modern-screenshot");
  const fixedElements = new Map<string, DOMRect>();
  const marker = "data-screenshot-fixed";
  const capturedFixedElements: Array<{
    element: Element;
    previous: string | null;
  }> = [];
  document.querySelectorAll<HTMLElement>("body *").forEach((element, index) => {
    if (element.closest("[data-screenshot-ignore]")) return;
    if (window.getComputedStyle(element).position !== "fixed") return;
    const rect = element.getBoundingClientRect();
    if (
      rect.width <= 0 ||
      rect.height <= 0 ||
      rect.right <= 0 ||
      rect.bottom <= 0 ||
      rect.left >= viewportWidth ||
      rect.top >= viewportHeight
    ) {
      return;
    }
    const id = String(index);
    fixedElements.set(id, rect);
    capturedFixedElements.push({
      element,
      previous: element.getAttribute(marker),
    });
    element.setAttribute(marker, id);
  });

  try {
    return await domToCanvas(document.documentElement, {
      width: viewportWidth,
      height: viewportHeight,
      scale,
      backgroundColor: "#ffffff",
      style: { overflow: "hidden" },
      timeout: 15_000,
      maximumCanvasSize: 16_000,
      features: { restoreScrollPosition: true },
      filter: (node) =>
        !(node instanceof Element && node.hasAttribute("data-screenshot-ignore")),
      onCloneEachNode: (node) => {
        if (node instanceof HTMLInputElement && node.type === "password") {
          node.value = "";
          node.setAttribute("value", "");
        }
        if (node instanceof HTMLElement) {
          node.style.setProperty("animation", "none", "important");
          node.style.setProperty("transition", "none", "important");
          node.style.setProperty("caret-color", "transparent", "important");
          const id = node.getAttribute(marker);
          const rect = id ? fixedElements.get(id) : undefined;
          if (rect) {
            node.style.setProperty("position", "absolute", "important");
            node.style.setProperty("left", `${rect.left + window.scrollX}px`, "important");
            node.style.setProperty("top", `${rect.top + window.scrollY}px`, "important");
            node.style.setProperty("right", "auto", "important");
            node.style.setProperty("bottom", "auto", "important");
            node.style.setProperty("width", `${rect.width}px`, "important");
            node.style.setProperty("height", `${rect.height}px`, "important");
            node.style.setProperty("margin", "0", "important");
          }
        }
      },
    });
  } finally {
    for (const { element, previous } of capturedFixedElements) {
      if (previous === null) element.removeAttribute(marker);
      else element.setAttribute(marker, previous);
    }
  }
}

function imageName(name: string, extension: "jpg" | "png"): string {
  const safeName = name.replace(/[<>\r\n]/g, "").slice(0, 100);
  const baseName = safeName.replace(/\.(?:jpe?g|png|webp|gif)$/i, "");
  return `${baseName || "image"}.${extension}`;
}

function reportMetadata() {
  const userAgent = navigator.userAgent;
  const nav = navigator as Navigator & {
    hardwareConcurrency?: number;
    deviceMemory?: number;
    connection?: { effectiveType?: string };
  };
  const browser =
    userAgent.match(/EdgA?\/([\d.]+)/)?.[0] ??
    userAgent.match(/OPR\/([\d.]+)/)?.[0] ??
    userAgent.match(/SamsungBrowser\/([\d.]+)/)?.[0] ??
    userAgent.match(/Firefox\/([\d.]+)/)?.[0] ??
    userAgent.match(/(?:CriOS|Chrome)\/([\d.]+)/)?.[0] ??
    userAgent.match(/Version\/([\d.]+).*Safari/)?.[0] ??
    "Browser tidak diketahui";
  const os = /Android/i.test(userAgent)
    ? "Android"
    : /iPhone|iPad|iPod/i.test(userAgent)
      ? "iOS"
      : /Windows/i.test(userAgent)
        ? "Windows"
        : /Mac OS X/i.test(userAgent)
          ? "macOS"
          : /Linux/i.test(userAgent)
            ? "Linux"
            : navigator.platform || "Tidak diketahui";
  const device = /iPad/i.test(userAgent)
    ? "Tablet"
    : /Mobile|Android|iPhone|iPod/i.test(userAgent)
      ? "Ponsel"
      : "Desktop";
  const timezone =
    Intl.DateTimeFormat().resolvedOptions().timeZone || "Tidak diketahui";
  return {
    capturedAt: new Date().toISOString(),
    browser,
    os,
    device,
    userAgent: userAgent.slice(0, 350),
    platform: navigator.platform || "Tidak diketahui",
    viewport: `${window.innerWidth} × ${window.innerHeight} CSS px`,
    screen: `${window.screen.width} × ${window.screen.height} px`,
    screenAvailable: `${window.screen.availWidth} × ${window.screen.availHeight} px`,
    pixelRatio: `${window.devicePixelRatio || 1}x`,
    orientation:
      window.screen.orientation?.type ??
      (window.matchMedia("(orientation: portrait)").matches
        ? "portrait"
        : "landscape"),
    colorGamut: window.matchMedia("(color-gamut: p3)").matches ? "P3" : "sRGB",
    cpuCores: nav.hardwareConcurrency ? String(nav.hardwareConcurrency) : "N/A",
    ramGb: nav.deviceMemory ? `${nav.deviceMemory} GB` : "N/A",
    networkType: nav.connection?.effectiveType || "N/A",
    language: navigator.languages?.join(", ").slice(0, 120) || navigator.language,
    timezone,
    touchPoints: String(navigator.maxTouchPoints || 0),
    online: navigator.onLine ? "Ya" : "Tidak",
  };
}

async function screenshotAttachment(
  source: HTMLCanvasElement,
  name: string,
  maxBytes = MAX_ATTACHMENT_BYTES,
): Promise<ReportAttachment> {
  let width = Math.min(source.width, 4096);
  let height = Math.max(1, Math.round((source.height / source.width) * width));

  while (width >= 360) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Screenshot tidak dapat diproses.");
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(source, 0, 0, width, height);

    const png = await canvasToBlob(canvas, "image/png");
    if (png && png.size <= maxBytes) {
      return {
        id: crypto.randomUUID(),
        name: imageName(name, "png"),
        dataUrl: await readBlobAsDataUrl(png),
      };
    }

    for (const quality of JPEG_QUALITIES) {
      const blob = await canvasToBlob(canvas, "image/jpeg", quality);
      if (blob && blob.size <= maxBytes) {
        return {
          id: crypto.randomUUID(),
          name: imageName(name, "jpg"),
          dataUrl: await readBlobAsDataUrl(blob),
        };
      }
    }

    width = Math.floor(width * 0.94);
    height = Math.max(1, Math.round((source.height / source.width) * width));
  }
  throw new Error("Screenshot terlalu besar untuk diproses dengan aman.");
}

async function compressImage(
  source: Blob,
  name: string,
  maxBytes: number,
): Promise<ReportAttachment> {
  if (!source.type.startsWith("image/") || source.size > MAX_SOURCE_IMAGE_BYTES) {
    throw new Error("Pilih file gambar maksimal 8 MB.");
  }
  if (
    !["image/jpeg", "image/png", "image/webp", "image/gif"].includes(source.type)
  ) {
    throw new Error("Format gambar yang didukung: JPG, PNG, WebP, atau GIF.");
  }

  const bitmap = await createImageBitmap(source);
  try {
    const ratio = Math.min(1, MAX_IMAGE_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
    canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Gambar tidak dapat diproses di browser ini.");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    if (source.type === "image/png") {
      const png = await canvasToBlob(canvas, "image/png");
      if (png && png.size <= maxBytes) {
        return {
          id: crypto.randomUUID(),
          name: imageName(name, "png"),
          dataUrl: await readBlobAsDataUrl(png),
        };
      }
    }

    let blob: Blob | null = null;
    for (const quality of JPEG_QUALITIES) {
      blob = await canvasToBlob(canvas, "image/jpeg", quality);
      if (blob && blob.size <= maxBytes) break;
    }
    if (!blob || blob.size > maxBytes) {
      throw new Error("Media melebihi batas ukuran lampiran.");
    }
    return {
      id: crypto.randomUUID(),
      name: imageName(name, "jpg"),
      dataUrl: await readBlobAsDataUrl(blob),
    };
  } finally {
    bitmap.close();
  }
}

export function FeedbackReporter() {
  const pathname = usePathname();
  const uid = pathname.match(/^\/(\d+)(?:\/|$)/)?.[1] ?? "";
  const [issues, setIssues] = useState<CapturedIssue[]>([]);
  const [modal, setModal] = useState<"bug" | "error" | null>(null);
  const [description, setDescription] = useState("");
  const [attachments, setAttachments] = useState<ReportAttachment[]>([]);
  const [minimized, setMinimized] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [shakeEnabled, setShakeEnabled] = useState(false);
  const [captureActive, setCaptureActive] = useState(false);
  const [shakeNotice, setShakeNotice] = useState("");
  const [attachmentBusy, setAttachmentBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState("");
  const [copied, setCopied] = useState(false);
  const [reportButtonBottom, setReportButtonBottom] = useState<number | null>(null);
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;
  const panelRef = useRef<HTMLElement | null>(null);
  const modalRef = useRef(modal);
  modalRef.current = modal;
  const lastShakeAtRef = useRef(0);
  const recentIssueRef = useRef(new Map<string, number>());
  const motionBaselineRef = useRef<{ x: number; y: number; z: number } | null>(null);
  const shakePeaksRef = useRef<number[]>([]);
  const lastPeakAtRef = useRef(0);
  const noticeTimerRef = useRef<number | null>(null);
  const motionPermissionRequestedRef = useRef(false);
  const panelDragRef = useRef<{
    pointerId: number;
    startY: number;
    startHeight: number;
  } | null>(null);
  const apiFailureWindowRef = useRef<number[]>([]);
  const serverFailureWindowsRef = useRef(new Map<string, number[]>());
  const serverAlertAttemptAtRef = useRef(new Map<string, number>());
  const apiNoticeAtRef = useRef(0);
  const inChatRoom = /^\/[^/]+\/chat\/[^/]+\/?$/.test(pathname);

  const showNotice = useCallback((message: string) => {
    setNotice(message);
    if (noticeTimerRef.current !== null) {
      window.clearTimeout(noticeTimerRef.current);
    }
    noticeTimerRef.current = window.setTimeout(() => {
      noticeTimerRef.current = null;
      setNotice("");
    }, 7000);
  }, []);

  const captureIssue = useCallback(
    (
      message: string,
      stack?: string,
      urgent = false,
      dedupeScope?: string,
    ) => {
      const safeMessage = redact(message);
      const currentPath = pathnameRef.current;
      const fingerprint = `${dedupeScope ?? currentPath}:${safeMessage}`;
      const now = Date.now();
      const lastSeen = recentIssueRef.current.get(fingerprint);
      if (lastSeen && now - lastSeen < ISSUE_DEDUPE_MS) return;
      recentIssueRef.current.set(fingerprint, now);
      if (recentIssueRef.current.size > 100) {
        for (const [key, time] of recentIssueRef.current) {
          if (now - time >= ISSUE_DEDUPE_MS) recentIssueRef.current.delete(key);
        }
        while (recentIssueRef.current.size > 100) {
          const oldestKey = recentIssueRef.current.keys().next().value;
          if (!oldestKey) break;
          recentIssueRef.current.delete(oldestKey);
        }
      }
      const issue: CapturedIssue = {
        message: safeMessage,
        stack: stack ? redact(stack) : undefined,
        page: currentPath,
        time: new Date(now).toISOString(),
      };
      setIssues((previous) => [...previous.slice(-(MAX_ISSUES - 1)), issue]);
      if (urgent) {
        if (modalRef.current === "error") return;
        setModal("error");
      }
    },
    [],
  );

  const openReport = useCallback(() => {
    if (modalRef.current) {
      setMinimized(false);
      return;
    }
    if (!description.trim() && attachments.length === 0) {
      setDescription("");
      setAttachments([]);
      setShakeNotice("");
    }
    setModal("bug");
    setMinimized(false);
    setExpanded(false);
  }, [attachments.length, description]);

  useEffect(() => {
    if (!inChatRoom) {
      setReportButtonBottom(null);
      return;
    }

    let footer: HTMLElement | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let footerMutationObserver: MutationObserver | null = null;

    const updatePosition = () => {
      const currentFooter = document.querySelector<HTMLElement>(".chat-footer");
      if (currentFooter !== footer) {
        if (footer) resizeObserver?.unobserve(footer);
        footerMutationObserver?.disconnect();
        footer = currentFooter;
        if (footer) {
          resizeObserver?.observe(footer);
          footerMutationObserver = new MutationObserver(updatePosition);
          footerMutationObserver.observe(footer, {
            attributes: true,
            attributeFilter: ["style"],
          });
        }
      }
      if (!footer) {
        setReportButtonBottom(null);
        return;
      }
      const footerTop = footer.getBoundingClientRect().top;
      setReportButtonBottom(
        Math.max(0, window.innerHeight - footerTop + 14),
      );
    };
    resizeObserver = new ResizeObserver(updatePosition);
    const mutationObserver = new MutationObserver(updatePosition);
    mutationObserver.observe(document.body, { childList: true, subtree: true });
    const visualViewport = window.visualViewport;
    window.addEventListener("resize", updatePosition);
    visualViewport?.addEventListener("resize", updatePosition);
    visualViewport?.addEventListener("scroll", updatePosition);
    updatePosition();

    return () => {
      mutationObserver.disconnect();
      footerMutationObserver?.disconnect();
      resizeObserver?.disconnect();
      window.removeEventListener("resize", updatePosition);
      visualViewport?.removeEventListener("resize", updatePosition);
      visualViewport?.removeEventListener("scroll", updatePosition);
    };
  }, [inChatRoom, pathname]);

  const captureScreenshot = useCallback(
    async (fromShake = false) => {
      const remainingBytes = Math.max(
        0,
        MAX_TOTAL_ATTACHMENT_BYTES - totalAttachmentBytes(attachments),
      );
      if (
        attachments.length >= MAX_ATTACHMENTS ||
        remainingBytes === 0
      ) {
        showNotice(
          attachments.length >= MAX_ATTACHMENTS
            ? `Maksimal ${MAX_ATTACHMENTS} gambar per laporan.`
            : "Lampiran sudah mencapai batas total 12 MB.",
        );
        setMinimized(false);
        return;
      }
      setAttachmentBusy(true);
      if (modalRef.current) setMinimized(true);
      setCaptureActive(true);
      let wakeLock: ScreenWakeLockSentinel | null = null;
      let wakeLockUnavailable = false;
      try {
        const wakeLockManager = (
          navigator as Navigator & {
            wakeLock?: {
              request: (type: "screen") => Promise<ScreenWakeLockSentinel>;
            };
          }
        ).wakeLock;
        if (wakeLockManager) {
          try {
            wakeLock = await wakeLockManager.request("screen");
          } catch (error) {
            wakeLockUnavailable = true;
            console.warn("[feedback] screen wake lock request failed:", error);
          }
        } else {
          wakeLockUnavailable = true;
          console.warn("[feedback] screen wake lock is not supported by this browser.");
        }
        await new Promise<void>((resolve) =>
          window.requestAnimationFrame(() =>
            window.requestAnimationFrame(() => resolve()),
          ),
        );
        const canvas = await captureViewportCanvas();
        const attachment = await screenshotAttachment(
          canvas,
          `screenshot-${new Date().toISOString().replace(/[:.]/g, "-")}.jpg`,
          Math.min(MAX_ATTACHMENT_BYTES, remainingBytes),
        );
        setAttachments((current) =>
          current.length >= MAX_ATTACHMENTS ||
          totalAttachmentBytes(current) + attachmentBytes(attachment.dataUrl) >
            MAX_TOTAL_ATTACHMENT_BYTES
            ? current
            : [...current, attachment],
        );
        if (fromShake) {
          setShakeNotice(
            issues.length > 0
              ? `Shake terdeteksi. Screenshot dan error yang tercatat sudah ditambahkan.${wakeLockUnavailable ? " Browser tidak dapat menahan layar tetap aktif selama capture." : ""}`
              : `Shake terdeteksi. Screenshot ditambahkan, tetapi tidak ada error otomatis yang tercatat.${wakeLockUnavailable ? " Browser tidak dapat menahan layar tetap aktif selama capture." : ""}`,
          );
          setModal((current) => current ?? "bug");
        } else {
          setShakeNotice("");
          setModal((current) => current ?? "bug");
          showNotice(
            wakeLockUnavailable
              ? "Screenshot ditambahkan; browser tidak mendukung kunci layar aktif."
              : "Screenshot layar ditambahkan dengan resolusi perangkat.",
          );
        }
        setMinimized(false);
        setExpanded(false);
      } catch (error) {
        showNotice(
          error instanceof Error
            ? error.message
            : "Screenshot tidak dapat diambil pada halaman ini.",
        );
        if (fromShake) {
          setShakeNotice(
            "Shake terdeteksi, tetapi screenshot gagal dibuat. Kamu tetap bisa menjelaskan masalahnya dan menambahkan gambar.",
          );
          setModal((current) => current ?? "bug");
          setMinimized(false);
          setExpanded(false);
        }
      } finally {
        if (wakeLock) {
          try {
            await wakeLock.release();
          } catch (error) {
            console.warn("[feedback] screen wake lock release failed:", error);
          }
        }
        setCaptureActive(false);
        setAttachmentBusy(false);
      }
    },
    [attachments, issues.length, showNotice],
  );

  const addUploadedImages = useCallback(
    async (files: FileList | null) => {
      if (!files?.length) return;
      const remaining = Math.max(0, MAX_ATTACHMENTS - attachments.length);
      let remainingBytes = Math.max(
        0,
        MAX_TOTAL_ATTACHMENT_BYTES - totalAttachmentBytes(attachments),
      );
      if (remaining === 0 || remainingBytes === 0) {
        showNotice(
          remaining === 0
            ? `Maksimal ${MAX_ATTACHMENTS} gambar per laporan.`
            : "Lampiran sudah mencapai batas total 12 MB.",
        );
        return;
      }
      setAttachmentBusy(true);
      try {
        const selected = Array.from(files).slice(0, remaining);
        const processed: ReportAttachment[] = [];
        for (const [index, file] of selected.entries()) {
          const maxBytes = Math.min(
            MAX_ATTACHMENT_BYTES,
            Math.floor(remainingBytes / (selected.length - index)),
          );
          const item = await compressImage(file, file.name, maxBytes);
          const size = attachmentBytes(item.dataUrl);
          processed.push(item);
          remainingBytes -= size;
        }
        setAttachments((current) => [
          ...current,
          ...processed.slice(0, Math.max(0, MAX_ATTACHMENTS - current.length)),
        ]);
        showNotice(`${processed.length} gambar ditambahkan ke draft.`);
      } catch (error) {
        showNotice(
          error instanceof Error ? error.message : "Media tidak dapat diproses.",
        );
      } finally {
        setAttachmentBusy(false);
      }
    },
    [attachments, showNotice],
  );

  useEffect(
    () => () => {
      if (noticeTimerRef.current !== null) {
        window.clearTimeout(noticeTimerRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      if (!event.error && event.message === "Script error.") return;
      captureIssue(
        event.message || "Unexpected client error",
        event.error instanceof Error ? event.error.stack : undefined,
        true,
        "unhandled",
      );
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const message =
        reason instanceof Error
          ? reason.message
          : String(reason ?? "Unhandled rejection");
      const recoverableRequestFailure =
        /failed to fetch|fetch failed|networkerror|load failed|unexpected end of json input|failed to execute ['"]json['"] on ['"]response['"]/i.test(
          message,
        );
      captureIssue(
        message,
        reason instanceof Error ? reason.stack : undefined,
        !recoverableRequestFailure,
        recoverableRequestFailure ? "request-rejection" : "unhandled",
      );
    };
    const onClientIssue = (event: Event) => {
      const detail = (event as ClientIssueEvent).detail;
      captureIssue(detail.message, detail.stack, detail.urgent === true);
    };
    const onOffline = () => {
      captureIssue("Koneksi internet terputus. Periksa jaringan lalu coba lagi.");
      showNotice("Koneksi internet terputus. Periksa jaringan lalu coba lagi.");
    };
    const onRealtimeStatus = (event: Event) => {
      const detail = (
        event as CustomEvent<{ connected: boolean; message?: string }>
      ).detail;
      if (!detail?.connected) {
        const message =
          detail?.message ??
          "Koneksi realtime ke server terputus; aplikasi akan mencoba menyambung kembali.";
        captureIssue(message, undefined, false, "realtime");
        showNotice(message);
      } else {
        showNotice("Koneksi realtime sudah pulih.");
      }
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    window.addEventListener("cheya:client-error", onClientIssue);
    window.addEventListener("offline", onOffline);
    window.addEventListener("cheya:realtime-status", onRealtimeStatus);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
      window.removeEventListener("cheya:client-error", onClientIssue);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("cheya:realtime-status", onRealtimeStatus);
    };
  }, [captureIssue, showNotice]);

  useEffect(() => {
    const originalFetch = window.fetch;
    const getApiPath = (input: RequestInfo | URL): string | null => {
      try {
        const raw = input instanceof Request ? input.url : String(input);
        const url = new URL(raw, window.location.href);
        if (url.origin !== window.location.origin || !url.pathname.startsWith("/api/")) {
          return null;
        }
        return url.pathname;
      } catch {
        return null;
      }
    };
    const trackApiFailure = (
      method: string,
      apiPath: string,
      description: string,
      status?: number,
    ) => {
      const now = Date.now();
      apiFailureWindowRef.current = apiFailureWindowRef.current.filter(
        (timestamp) => now - timestamp < 30_000,
      );
      apiFailureWindowRef.current.push(now);
      captureIssue(
        description,
        undefined,
        false,
        `api:${method}:${apiPath}`,
      );
      if (
        apiFailureWindowRef.current.length >= 3 &&
        now - apiNoticeAtRef.current >= 60_000
      ) {
        apiNoticeAtRef.current = now;
        showNotice(
          "Beberapa permintaan server gagal. Koneksi sedang dicoba kembali; detailnya tersimpan untuk laporan.",
        );
      }
      if (status !== undefined) {
        const routeGroup = `/${apiPath.split("/").filter(Boolean).slice(0, 2).join("/")}`;
        const incidentKey = `${method}:${routeGroup}`;
        const recentServerFailures = (
          serverFailureWindowsRef.current.get(incidentKey) ?? []
        ).filter((timestamp) => now - timestamp < 30_000);
        recentServerFailures.push(now);
        serverFailureWindowsRef.current.set(incidentKey, recentServerFailures);

        const lastAlertAttempt = serverAlertAttemptAtRef.current.get(incidentKey) ?? 0;
        if (
          recentServerFailures.length >= 3 &&
          now - lastAlertAttempt >= 10 * 60_000
        ) {
          serverAlertAttemptAtRef.current.set(incidentKey, now);
          void originalFetch("/api/feedback/incident", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              kind: "repeated-5xx",
              endpoint: routeGroup,
              method,
              status,
            }),
            cache: "no-store",
          })
            .then((response) => {
              if (!response.ok) {
                throw new Error(
                  `Incident alert request failed with HTTP ${response.status}.`,
                );
              }
            })
            .catch((error: unknown) => {
              serverAlertAttemptAtRef.current.set(
                incidentKey,
                Date.now() - 9 * 60_000,
              );
              console.error("[feedback] automatic incident alert failed:", error);
            });
        }
      }
    };
    const trackedFetch: typeof window.fetch = async (input, init) => {
      const apiPath = getApiPath(input);
      const method = init?.method ?? (input instanceof Request ? input.method : "GET");
      try {
        const response = await originalFetch(input, init);
        if (
          apiPath &&
          apiPath !== "/api/feedback/report" &&
          apiPath !== "/api/feedback/incident" &&
          apiPath !== "/api/events/poll" &&
          response.status >= 500
        ) {
          trackApiFailure(
            method,
            apiPath,
            `${method} ${apiPath} failed with HTTP ${response.status}.`,
            response.status,
          );
        }
        return response;
      } catch (error) {
        if (
          apiPath &&
          apiPath !== "/api/feedback/report" &&
          apiPath !== "/api/feedback/incident" &&
          apiPath !== "/api/events/poll" &&
          error instanceof TypeError
        ) {
          trackApiFailure(
            method,
            apiPath,
            `${method} ${apiPath} could not reach the server: ${redact(error.message)}`,
          );
        }
        throw error;
      }
    };
    window.fetch = trackedFetch;
    return () => {
      if (window.fetch === trackedFetch) window.fetch = originalFetch;
    };
  }, [captureIssue, showNotice]);

  useEffect(() => {
    if (typeof DeviceMotionEvent === "undefined") return;
    const motion = DeviceMotionEvent as typeof DeviceMotionEvent & {
      requestPermission?: () => Promise<PermissionState>;
    };
    if (typeof motion.requestPermission !== "function") {
      setShakeEnabled(true);
      return;
    }

    const requestMotionPermission = () => {
      if (motionPermissionRequestedRef.current) return;
      motionPermissionRequestedRef.current = true;
      void motion.requestPermission?.().then((permission) => {
        setShakeEnabled(permission === "granted");
        if (permission !== "granted") {
          showNotice("Izin gerakan ditolak; screenshot manual tetap tersedia.");
        }
      }).catch((error: unknown) => {
        console.error("[feedback] motion permission request failed:", error);
        showNotice("Izin gerakan tidak tersedia; screenshot manual tetap tersedia.");
      });
    };
    document.addEventListener("pointerdown", requestMotionPermission, {
      once: true,
      passive: true,
    });
    return () =>
      document.removeEventListener("pointerdown", requestMotionPermission);
  }, [showNotice]);

  function startPanelDrag(event: React.PointerEvent<HTMLDivElement>) {
    panelDragRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startHeight: panelRef.current?.getBoundingClientRect().height ?? 0,
    };
    if (panelRef.current) {
      panelRef.current.style.transition = "none";
      panelRef.current.style.maxHeight = "100dvh";
    }
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function movePanelDrag(event: React.PointerEvent<HTMLDivElement>) {
    const drag = panelDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const distance = Math.max(
      -window.innerHeight,
      Math.min(drag.startHeight - 180, event.clientY - drag.startY),
    );
    const panel = panelRef.current;
    if (!panel) return;
    panel.style.height = `${Math.min(
      window.innerHeight,
      Math.max(180, drag.startHeight - distance),
    )}px`;
  }

  function clearPanelDragStyles() {
    const panel = panelRef.current;
    if (!panel) return;
    panel.style.height = "";
    panel.style.maxHeight = "";
    window.requestAnimationFrame(() => {
      if (panel.isConnected) panel.style.transition = "";
    });
  }

  function endPanelDrag(event: React.PointerEvent<HTMLDivElement>) {
    const drag = panelDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    panelDragRef.current = null;
    const distance = event.clientY - drag.startY;
    clearPanelDragStyles();
    if (distance > 70) {
      setModal(null);
      setExpanded(false);
    } else if (distance < -55) {
      setExpanded(true);
    }
  }

  function cancelPanelDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (panelDragRef.current?.pointerId !== event.pointerId) return;
    panelDragRef.current = null;
    clearPanelDragStyles();
  }

  useEffect(() => {
    if (!modal || minimized) return;

    const closeOnOutsideClick = (event: MouseEvent) => {
      const target = event.target;
      if (target instanceof Node && panelRef.current?.contains(target)) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      if (!sending) {
        setModal(null);
        setExpanded(false);
      }
    };
    document.addEventListener("click", closeOnOutsideClick, true);
    panelRef.current?.focus({ preventScroll: true });
    return () => document.removeEventListener("click", closeOnOutsideClick, true);
  }, [modal, minimized, sending]);

  useEffect(() => {
    if (!shakeEnabled) return;
    const triggerShake = () => {
      const now = Date.now();
      if (now - lastShakeAtRef.current < 1800) return;
      if (modalRef.current) return;
      lastShakeAtRef.current = now;
      shakePeaksRef.current = [];
      void captureScreenshot(true);
    };

    const onMotion = (event: DeviceMotionEvent) => {
      const measured = event.acceleration;
      const hasLinearAcceleration =
        measured &&
        [measured.x, measured.y, measured.z].some(
          (value) => typeof value === "number",
        );
      const acceleration = hasLinearAcceleration
        ? measured
        : event.accelerationIncludingGravity;
      if (!acceleration) return;
      const x = acceleration.x ?? 0;
      const y = acceleration.y ?? 0;
      const z = acceleration.z ?? 0;
      const now = Date.now();
      const baseline = motionBaselineRef.current;
      if (!baseline) {
        motionBaselineRef.current = { x, y, z };
        return;
      }
      const dynamicAcceleration = Math.hypot(
        x - baseline.x,
        y - baseline.y,
        z - baseline.z,
      );
      motionBaselineRef.current = {
        x: baseline.x * 0.82 + x * 0.18,
        y: baseline.y * 0.82 + y * 0.18,
        z: baseline.z * 0.82 + z * 0.18,
      };

      if (dynamicAcceleration > 13) {
        if (now - lastPeakAtRef.current >= 100) {
          shakePeaksRef.current = [
            ...shakePeaksRef.current.filter((time) => now - time <= 1400),
            now,
          ];
          lastPeakAtRef.current = now;
        }
        if (shakePeaksRef.current.length >= 3) triggerShake();
      } else if (
        shakePeaksRef.current.length > 0 &&
        now - shakePeaksRef.current[0] > 1400
      ) {
        shakePeaksRef.current = [];
      }
    };

    window.addEventListener("devicemotion", onMotion, { passive: true });
    return () => {
      window.removeEventListener("devicemotion", onMotion);
    };
  }, [captureScreenshot, shakeEnabled]);

  useEffect(() => {
    if (!captureActive) return;
    const lockedX = window.scrollX;
    const lockedY = window.scrollY;
    const preventScroll = (event: Event) => event.preventDefault();
    const preventScrollKeys = (event: KeyboardEvent) => {
      if (
        [
          "ArrowDown",
          "ArrowLeft",
          "ArrowRight",
          "ArrowUp",
          "End",
          "Home",
          "PageDown",
          "PageUp",
          " ",
        ].includes(event.key)
      ) {
        event.preventDefault();
      }
    };
    const restoreScroll = () => {
      if (window.scrollX !== lockedX || window.scrollY !== lockedY) {
        window.scrollTo(lockedX, lockedY);
      }
    };

    document.addEventListener("touchmove", preventScroll, {
      capture: true,
      passive: false,
    });
    document.addEventListener("wheel", preventScroll, {
      capture: true,
      passive: false,
    });
    document.addEventListener("keydown", preventScrollKeys, true);
    window.addEventListener("scroll", restoreScroll, { passive: true });
    return () => {
      document.removeEventListener("touchmove", preventScroll, true);
      document.removeEventListener("wheel", preventScroll, true);
      document.removeEventListener("keydown", preventScrollKeys, true);
      window.removeEventListener("scroll", restoreScroll);
      restoreScroll();
    };
  }, [captureActive]);

  const logs = formatIssues(issues);

  async function copyLogs() {
    try {
      const metadata = reportMetadata();
      const environment = [
        `Waktu: ${metadata.capturedAt}`,
        `Browser: ${metadata.browser}`,
        `Perangkat: ${metadata.device} · ${metadata.os} (${metadata.platform})`,
        `Layar: ${metadata.screen}; viewport ${metadata.viewport}; DPR ${metadata.pixelRatio}`,
        `Bahasa: ${metadata.language} · Zona waktu: ${metadata.timezone}`,
        `Koneksi: ${metadata.online}`,
      ].join("\n");
      await navigator.clipboard.writeText(
        `Informasi perangkat:\n${environment}\n\nError tercatat:\n${logs || "Tidak ada error client yang tercatat."}`,
      );
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      showNotice("Log tidak dapat disalin. Periksa izin clipboard browser.");
    }
  }

  async function sendReport() {
    if (!uid || !description.trim() || sending) return;
    setSending(true);
    setNotice("");
    try {
      const response = await fetch("/api/feedback/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: description.trim(),
          logs,
          screenshots: attachments.map((attachment) => ({
            name: attachment.name,
            dataUrl: attachment.dataUrl,
          })),
          page: pathname,
          metadata: reportMetadata(),
        }),
        cache: "no-store",
      });
      const result = await readApiJson<{
        ok?: boolean;
        error?: string;
        attachmentsDelivered?: boolean;
      }>(response);
      if (!response.ok || !result.ok) {
        throw new Error(result.error || "Laporan tidak dapat dikirim.");
      }
      showNotice(
        result.attachmentsDelivered === false
          ? "Laporan terkirim, tetapi screenshot gagal dikirim."
          : "Laporan bug berhasil dikirim kepada admin.",
      );
      setModal(null);
      setDescription("");
      setAttachments([]);
      setShakeNotice("");
      setMinimized(false);
      setIssues([]);
    } catch (error) {
      showNotice(
        error instanceof Error ? error.message : "Laporan tidak dapat dikirim.",
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      {notice && !modal && (
        <div
          data-screenshot-ignore="true"
          role="status"
          className="fixed bottom-[calc(76px+env(safe-area-inset-bottom))] left-4 right-4 z-[400] mx-auto max-w-[560px] rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-950 shadow-lg"
        >
          {notice}
        </div>
      )}
      {captureActive && (
        <div
          data-screenshot-ignore="true"
          aria-hidden="true"
          className="pointer-events-auto fixed inset-0 z-[600] touch-none select-none"
          style={{
            background:
              "radial-gradient(ellipse 24% 26% at 0% 0%, rgba(255,255,255,.96), rgba(120,190,255,.48) 28%, transparent 76%), radial-gradient(ellipse 24% 26% at 100% 0%, rgba(255,255,255,.96), rgba(120,190,255,.48) 28%, transparent 76%), radial-gradient(ellipse 24% 26% at 0% 100%, rgba(255,255,255,.96), rgba(120,190,255,.48) 28%, transparent 76%), radial-gradient(ellipse 24% 26% at 100% 100%, rgba(255,255,255,.96), rgba(120,190,255,.48) 28%, transparent 76%)",
            filter: "blur(12px)",
          }}
        >
        </div>
      )}
      {uid && (
        <button
          type="button"
          data-screenshot-ignore="true"
          aria-label="Laporkan bug"
          onClick={() => void openReport()}
          className="fixed bottom-[calc(70px+env(safe-area-inset-bottom))] left-3 z-[390] flex h-10 w-10 items-center justify-center rounded-full border border-line bg-white text-ink-soft shadow-md"
          style={
            inChatRoom
              ? {
                  bottom: `${reportButtonBottom ?? 14}px`,
                  left: "max(12px, calc((100vw - 600px) / 2 + 12px))",
                }
              : undefined
          }
        >
          <Bug size={17} />
        </button>
      )}
      {modal && minimized && (
        <button
          type="button"
          data-screenshot-ignore="true"
          onClick={() => setMinimized(false)}
          className="fixed bottom-[calc(70px+env(safe-area-inset-bottom))] right-3 z-[490] inline-flex min-h-11 max-w-[calc(100vw-6rem)] items-center gap-2 rounded-full border border-line bg-white px-4 text-xs font-semibold text-ink shadow-lg"
          style={
            inChatRoom
              ? {
                  bottom: `${reportButtonBottom ?? 14}px`,
                  right: "max(12px, calc((100vw - 600px) / 2 + 12px))",
                }
              : undefined
          }
        >
          <Maximize2 size={15} />
          <span className="truncate">
            Lanjutkan laporan{attachments.length ? ` · ${attachments.length} gambar` : ""}
          </span>
        </button>
      )}
      {modal && !minimized && (
        <div
          data-screenshot-ignore="true"
          className="pointer-events-none fixed inset-0 z-[500] flex items-end justify-center bg-slate-950/25"
          role="presentation"
        >
          <section
            ref={panelRef}
            data-feedback-kind={modal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="feedback-title"
            tabIndex={-1}
            className={`pointer-events-auto w-full max-w-[600px] overflow-y-auto border border-slate-200/80 bg-white px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 shadow-[0_-20px_70px_-28px_rgba(0,0,0,.42)] transition-[height,transform] duration-200 ease-out sm:p-5 ${
              expanded
                ? "h-[100dvh] max-h-[100dvh] rounded-none"
                : "max-h-[90dvh] rounded-t-[26px] sm:mb-3 sm:rounded-[26px]"
            }`}
          >
            <div
              role="separator"
              tabIndex={0}
              aria-orientation="horizontal"
              aria-label="Resize report panel. Drag up to expand and down to close."
              className="mb-3 flex cursor-ns-resize touch-none justify-center py-2"
              onPointerDown={startPanelDrag}
              onPointerMove={movePanelDrag}
              onPointerUp={endPanelDrag}
              onPointerCancel={cancelPanelDrag}
              onKeyDown={(event) => {
                if (event.key === "ArrowUp") setExpanded(true);
                if (event.key === "ArrowDown" || event.key === "Escape") {
                  setExpanded(false);
                }
              }}
            >
              <span aria-hidden="true" className="h-1.5 w-10 rounded-full bg-slate-300 transition-colors hover:bg-slate-400" />
            </div>
            <div className="flex items-center justify-between gap-3">
              <h2 id="feedback-title" className="text-[17px] font-bold tracking-tight text-ink">
                {modal === "error" ? "Laporan error" : "Laporkan bug"}
              </h2>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  aria-label="Minimalkan laporan"
                  disabled={sending}
                  onClick={() => setMinimized(true)}
                  className="rounded-full p-2 text-ink-mute"
                >
                  <Minimize2 size={17} />
                </button>
                <button
                  type="button"
                  aria-label="Tutup laporan"
                  disabled={sending}
                  onClick={() => setModal(null)}
                  className="rounded-full p-2 text-ink-mute"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            <label className="mt-3 block text-[12px] font-semibold text-ink-soft">
              Deskripsi
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                maxLength={2000}
                rows={3}
                placeholder="Ceritakan masalah yang terjadi..."
                className="mt-1.5 w-full resize-y rounded-2xl border border-slate-300 bg-white p-3 text-[13px] font-normal text-ink outline-none transition placeholder:text-slate-400 focus:border-slate-700 focus:ring-2 focus:ring-slate-900/10"
              />
            </label>

            <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-3">
              <div className="mb-1 flex items-center justify-between gap-2">
                <p className="text-[11px] font-semibold text-ink">Log sistem</p>
                <button
                  type="button"
                  onClick={() => void copyLogs()}
                  aria-label={copied ? "Log tersalin" : "Salin log"}
                  className="inline-flex h-7 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 text-[10px] font-semibold text-ink-soft"
                >
                  {copied ? <Check size={12} /> : <Copy size={12} />}
                  {copied ? "Tersalin" : "Salin"}
                </button>
              </div>
              <div className="max-h-24 overflow-y-auto text-[10px] leading-relaxed text-ink-soft">
                {issues.length > 0 ? (
                  <pre className="whitespace-pre-wrap break-words font-sans">{logs}</pre>
                ) : (
                  <p>Belum ada error yang tercatat oleh sistem.</p>
                )}
              </div>
              {shakeNotice && (
                <p role="status" className="mt-2 border-t border-slate-200 pt-2 text-[10px] leading-relaxed text-ink-mute">
                  {shakeNotice}
                </p>
              )}
            </div>

            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                disabled={
                  attachmentBusy ||
                  attachments.length >= MAX_ATTACHMENTS ||
                  totalAttachmentBytes(attachments) >= MAX_TOTAL_ATTACHMENT_BYTES
                }
                onClick={() => void captureScreenshot()}
                className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3 text-[11px] font-semibold text-ink transition hover:border-slate-500 hover:text-black disabled:opacity-50"
              >
                <Camera size={15} />
                Screenshot
              </button>
              <label className="inline-flex min-h-10 flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3 text-[11px] font-semibold text-ink transition hover:border-slate-500 hover:text-black has-[:disabled]:opacity-50">
                <ImagePlus size={15} />
                Upload media
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  multiple
                  disabled={
                    attachmentBusy ||
                    attachments.length >= MAX_ATTACHMENTS ||
                    totalAttachmentBytes(attachments) >= MAX_TOTAL_ATTACHMENT_BYTES
                  }
                  onChange={(event) => {
                    void addUploadedImages(event.target.files);
                    event.currentTarget.value = "";
                  }}
                  className="sr-only"
                />
              </label>
              {attachmentBusy && (
                <span className="sr-only">Memproses media…</span>
              )}
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2">
              {attachments.map((attachment, index) => (
                <div
                  key={attachment.id}
                  className="relative aspect-[4/3] overflow-hidden rounded-xl border border-slate-200 bg-slate-50"
                >
                  <Image
                    fill
                    unoptimized
                    src={attachment.dataUrl}
                    alt={`Preview lampiran ${index + 1}`}
                    className="object-contain"
                    sizes="(max-width: 520px) 30vw, 150px"
                  />
                  <button
                    type="button"
                    aria-label={`Hapus lampiran ${attachment.name}`}
                    onClick={() =>
                      setAttachments((current) =>
                        current.filter((item) => item.id !== attachment.id),
                      )
                    }
                    className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-black/70 text-white"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
              {attachments.length === 0 && (
                <div className="col-span-3 rounded-xl border border-dashed border-slate-300 px-3 py-3 text-center text-[10px] text-ink-mute">
                  Belum ada media · maksimal {MAX_ATTACHMENTS} gambar / 12 MB
                </div>
              )}
              {attachments.length > 0 && attachments.length < MAX_ATTACHMENTS && (
                <p className="col-span-3 text-right text-[9px] text-ink-mute">
                  {attachments.length}/{MAX_ATTACHMENTS} media ·{" "}
                  {(totalAttachmentBytes(attachments) / 1_000_000).toFixed(1)} MB
                </p>
              )}
            </div>

            {notice && (
              <p role="status" className="mt-2 text-[10px] text-amber-800">
                {notice}
              </p>
            )}

            <div className="mt-3 flex justify-end">
              {uid ? (
                <button
                  type="button"
                  disabled={sending || !description.trim() || attachmentBusy}
                  onClick={() => void sendReport()}
                  className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-black px-5 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:opacity-45"
                >
                  <Send size={14} />
                  {sending ? "Mengirim…" : "Kirim laporan"}
                </button>
              ) : (
                <p className="text-xs text-ink-mute">
                  Login diperlukan untuk mengirim laporan.
                </p>
              )}
            </div>
          </section>
        </div>
      )}
    </>
  );
}
