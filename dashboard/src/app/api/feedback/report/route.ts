import { NextRequest, NextResponse } from "next/server";
import { getUserSession, hasValidSameOrigin } from "@/lib/auth-request";
import { config } from "@/lib/config";
import { sendTelegramDocument, sendTelegramMessage } from "@/lib/telegram";
import {
  readBoundedJson,
  RequestBodyTooLargeError,
} from "@/lib/read-bounded-json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const reportAttempts = new Map<number, number[]>();
const reportInFlight = new Set<number>();
const MAX_REPORTS_PER_WINDOW = 3;
const REPORT_WINDOW_MS = 10 * 60 * 1000;
const MAX_LOG_LENGTH = 8_000;
const MAX_SCREENSHOT_LENGTH = 10_667_000;
const MAX_REPORT_SCREENSHOTS = 4;
const MAX_REPORT_BODY_BYTES = 17_000_000;
const MAX_SCREENSHOT_BYTES = 8_000_000;
const MAX_TOTAL_SCREENSHOT_BYTES = 12_000_000;
const REPORT_DELIVERY_RETRY = { maxAttempts: 2, timeoutMs: 5_000 };

function reportPageLabel(value: unknown): string {
  if (typeof value !== "string") return "Dashboard";
  const path = value.split(/[?#]/, 1)[0];
  if (/^\/\d+\/(?:project|keranjang)\/[^/]+\/[^/]+$/.test(path)) return "Project details";
  if (/^\/\d+\/(?:project|keranjang)(?:\/|$)/.test(path)) return "Projects";
  if (/^\/\d+\/chat(?:\/|$)/.test(path)) return "Chat";
  if (/^\/\d+\/profile\/settings(?:\/|$)/.test(path)) return "Settings";
  if (/^\/\d+\/profile(?:\/|$)/.test(path)) return "Profile";
  if (/^\/\d+\/media(?:\/|$)/.test(path)) return "Media";
  if (/^\/\d+$/.test(path)) return "Home";
  return "Dashboard";
}

function hasReachedReportLimit(uid: number): boolean {
  const now = Date.now();
  const recent = (reportAttempts.get(uid) ?? []).filter(
    (timestamp) => now - timestamp < REPORT_WINDOW_MS,
  );
  reportAttempts.set(uid, recent);
  return recent.length >= MAX_REPORTS_PER_WINDOW;
}

function recordSuccessfulReport(uid: number): void {
  const now = Date.now();
  const recent = (reportAttempts.get(uid) ?? []).filter(
    (timestamp) => now - timestamp < REPORT_WINDOW_MS,
  );
  recent.push(now);
  reportAttempts.set(uid, recent);
}

function metadataLine(
  metadata: Record<string, unknown>,
  key: string,
  label: string,
): string {
  const value = metadata[key];
  if (typeof value !== "string" || !value.trim()) {
    return `${label}: Tidak diketahui`;
  }
  return `${label}: ${value.replace(/[\r\n]/g, " ").slice(0, 350)}`;
}

function reportMetadataLines(value: unknown): string[] {
  const metadata =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  return [
    metadataLine(metadata, "capturedAt", "Waktu lokal"),
    metadataLine(metadata, "browser", "Browser"),
    metadataLine(metadata, "device", "Perangkat"),
    metadataLine(metadata, "os", "Sistem operasi"),
    metadataLine(metadata, "viewport", "Viewport"),
    metadataLine(metadata, "pixelRatio", "Skala layar"),
    metadataLine(metadata, "language", "Bahasa"),
    metadataLine(metadata, "timezone", "Zona waktu"),
    metadataLine(metadata, "online", "Koneksi saat laporan"),
  ];
}

function reportUserAgent(metadataValue: unknown, fallback: unknown): string {
  const metadata =
    metadataValue && typeof metadataValue === "object"
      ? (metadataValue as Record<string, unknown>)
      : {};
  const userAgent =
    typeof metadata.userAgent === "string"
      ? metadata.userAgent
      : typeof fallback === "string"
        ? fallback
        : "unknown";
  return userAgent.replace(/[\r\n]/g, " ").slice(0, 350);
}

function redactReportText(value: string): string {
  return value
    .replace(/\bgithub_pat_[A-Za-z0-9_]+\b/g, "[REDACTED_GITHUB_TOKEN]")
    .replace(/\bgh[pousr]_[A-Za-z0-9_]+\b/g, "[REDACTED_GITHUB_TOKEN]")
    .replace(/\bBearer\s+\S+/gi, "Bearer [REDACTED]")
    .replace(/\b\d{7,12}:[A-Za-z0-9_-]{25,}\b/g, "[REDACTED_BOT_TOKEN]")
    .replace(/([?&](?:token|auth|key|secret|password)=)[^&#\s]+/gi, "$1[REDACTED]");
}

export async function POST(request: NextRequest) {
  if (!hasValidSameOrigin(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }
  let session: Awaited<ReturnType<typeof getUserSession>>;
  try {
    session = await getUserSession(request);
  } catch (error) {
    console.error("[feedback/report] session verification unavailable:", error);
    return NextResponse.json(
      { error: "The session service is temporarily unavailable. Please retry." },
      {
        status: 503,
        headers: { "Cache-Control": "no-store", "Retry-After": "5" },
      },
    );
  }
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (config.adminTelegramIds.size === 0 || !config.telegram.botToken) {
    console.error("[feedback/report] Telegram admin reporting is not configured.");
    return NextResponse.json(
      { error: "Bug reporting is temporarily unavailable." },
      { status: 503 },
    );
  }
  let body: unknown;
  try {
    body = await readBoundedJson(request, MAX_REPORT_BODY_BYTES);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return NextResponse.json({ error: "Report is too large." }, { status: 413 });
    }
    return NextResponse.json({ error: "Invalid report." }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid report." }, { status: 400 });
  }

  const report = body as Record<string, unknown>;
  const description =
    typeof report.description === "string"
      ? redactReportText(report.description.trim())
      : "";
  const logs =
    typeof report.logs === "string" ? redactReportText(report.logs) : "";
  const screenshotInputs = Array.isArray(report.screenshots)
    ? report.screenshots
    : typeof report.screenshot === "string" && report.screenshot
      ? [{ name: "screenshot.jpg", dataUrl: report.screenshot }]
      : [];
  if (!description || description.length > 2000 || logs.length > MAX_LOG_LENGTH) {
    return NextResponse.json({ error: "Invalid report content." }, { status: 400 });
  }
  if (screenshotInputs.length > MAX_REPORT_SCREENSHOTS) {
    return NextResponse.json({ error: "Invalid screenshot." }, { status: 400 });
  }
  const screenshots: Array<{ name: string; blob: Blob }> = [];
  let totalScreenshotBytes = 0;
  for (const input of screenshotInputs) {
    if (!input || typeof input !== "object") {
      return NextResponse.json({ error: "Invalid screenshot." }, { status: 400 });
    }
    const attachment = input as Record<string, unknown>;
    const dataUrl =
      typeof attachment.dataUrl === "string" ? attachment.dataUrl : "";
    const dataUrlMatch = dataUrl.match(
      /^data:image\/(jpeg|png);base64,([A-Za-z0-9+/]+={0,2})$/,
    );
    if (
      dataUrl.length === 0 ||
      dataUrl.length > MAX_SCREENSHOT_LENGTH ||
      !dataUrlMatch
    ) {
      return NextResponse.json({ error: "Invalid screenshot." }, { status: 400 });
    }
    const mimeType = dataUrlMatch[1] === "png" ? "image/png" : "image/jpeg";
    const bytes = Buffer.from(dataUrlMatch[2], "base64");
    const hasValidSignature =
      mimeType === "image/png"
        ? bytes.subarray(0, 8).equals(
            Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
          )
        : bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]));
    if (
      bytes.length === 0 ||
      bytes.length > MAX_SCREENSHOT_BYTES ||
      !hasValidSignature
    ) {
      return NextResponse.json({ error: "Invalid screenshot." }, { status: 400 });
    }
    totalScreenshotBytes += bytes.length;
    if (totalScreenshotBytes > MAX_TOTAL_SCREENSHOT_BYTES) {
      return NextResponse.json(
        { error: "The total attachment size must not exceed 12 MB." },
        { status: 413 },
      );
    }
    const name =
      typeof attachment.name === "string"
        ? attachment.name.replace(/[^\w.-]/g, "_").slice(0, 100)
        : "screenshot.jpg";
    screenshots.push({
      name: name || "screenshot.jpg",
      blob: new Blob([bytes], { type: mimeType }),
    });
  }

  const page = reportPageLabel(report.page);
  const platform = reportUserAgent(report.metadata, report.platform);
  const text = [
    "CheyaVerse bug report",
    `User: ${session.uid}`,
    `Page: ${page}`,
    `Browser/UA: ${platform}`,
    ...reportMetadataLines(report.metadata),
    `Attachments: ${screenshots.length}`,
    "",
    description,
    "",
    logs ? `Captured errors:\n${logs}` : "No captured client errors.",
  ].join("\n");
  const textParts = text.match(/[\s\S]{1,3500}/g) ?? [text];

  if (reportInFlight.has(session.uid)) {
    return NextResponse.json(
      { error: "A report is already being sent. Please wait a moment." },
      { status: 409, headers: { "Retry-After": "3" } },
    );
  }
  if (hasReachedReportLimit(session.uid)) {
    return NextResponse.json(
      { error: "Too many reports. Please try again later." },
      { status: 429, headers: { "Retry-After": "600" } },
    );
  }

  reportInFlight.add(session.uid);
  try {
    const deliveries = await Promise.all(
      Array.from(config.adminTelegramIds, async (adminId) => {
        for (const chunk of textParts) {
          const messageSent = await sendTelegramMessage(adminId, chunk, {
            retry: REPORT_DELIVERY_RETRY,
          });
          if (!messageSent) return false;
        }
        if (screenshots.length === 0) return true;
        let allAttachmentsSent = true;
        for (const [index, screenshot] of screenshots.entries()) {
          const documentSent = await sendTelegramDocument(
            adminId,
            screenshot.blob,
            screenshot.name,
            `User ${session.uid} · ${page} · ${index + 1}/${screenshots.length} · ${screenshot.name}`,
            REPORT_DELIVERY_RETRY,
          );
          allAttachmentsSent = allAttachmentsSent && documentSent;
        }
        return { messageSent: true, attachmentsSent: allAttachmentsSent };
      }),
    );
    const deliveredCount = deliveries.filter((delivery) =>
      typeof delivery === "boolean" ? delivery : delivery.messageSent,
    ).length;
    if (deliveredCount === 0) {
      console.error("[feedback/report] Telegram delivery failed for all admins.");
      return NextResponse.json(
        {
          error:
            "Telegram is not reachable right now. Your report is still in this form; please retry when the connection is back.",
        },
        {
          status: 503,
          headers: { "Cache-Control": "no-store", "Retry-After": "8" },
        },
      );
    }

    recordSuccessfulReport(session.uid);
    return NextResponse.json(
      {
        ok: true,
        delivered: deliveredCount,
        attachmentsDelivered:
          screenshots.length === 0 ||
          deliveries.some(
            (delivery) => typeof delivery !== "boolean" && delivery.attachmentsSent,
          ),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[feedback/report] delivery failed:", error);
    return NextResponse.json(
      {
        error:
          "Telegram delivery failed. Your report is still in this form; please retry shortly.",
      },
      {
        status: 503,
        headers: { "Cache-Control": "no-store", "Retry-After": "8" },
      },
    );
  } finally {
    reportInFlight.delete(session.uid);
  }
}
