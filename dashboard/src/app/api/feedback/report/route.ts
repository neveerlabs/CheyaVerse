import { NextRequest, NextResponse } from "next/server";
import { getUserSession, hasValidSameOrigin } from "@/lib/auth-request";
import { config } from "@/lib/config";
import {
  sendTelegramDocument,
  sendTelegramMediaGroup,
  sendTelegramMessage,
  sendTelegramPhoto,
} from "@/lib/telegram";
import { getTelegramUser } from "@/lib/storage";
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
const MAX_DESCRIPTION_LENGTH = 600;
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

function metadataValue(metadata: Record<string, unknown>, key: string, max = 180): string {
  const value = metadata[key];
  return typeof value === "string" && value.trim()
    ? value.replace(/[\r\n]/g, " ").slice(0, max)
    : "Unknown";
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
  return userAgent.replace(/[\r\n]/g, " ").slice(0, 220);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function reportDevice(value: string): string {
  const device = value.toLowerCase();
  if (device.includes("tablet")) return "tablet";
  if (device.includes("desktop")) return "desktop";
  return "mobile";
}

function bugReportMessage(
  uid: number,
  username: string,
  page: string,
  metadataValueInput: unknown,
  fallbackUserAgent: unknown,
  description: string,
  logs: string,
  maxLength: number,
): string | null {
  const metadata =
    metadataValueInput && typeof metadataValueInput === "object"
      ? (metadataValueInput as Record<string, unknown>)
      : {};
  const metadataText = [
    `User ID: ${uid}`,
    `Username: ${username}`,
    `Page: ${page}`,
    `Time: ${metadataValue(metadata, "capturedAt")}`,
    `Browser/UA: ${reportUserAgent(metadata, fallbackUserAgent)}`,
    `Browser: ${metadataValue(metadata, "browser")}`,
    `Device: ${reportDevice(metadataValue(metadata, "device"))}`,
    `Operating system: ${metadataValue(metadata, "os")}`,
    `Viewport: ${metadataValue(metadata, "viewport")}`,
    `Language: ${metadataValue(metadata, "language")}`,
    `Time zone: ${metadataValue(metadata, "timezone")}`,
  ].join("\n");
  const prefix = `<b>CheyaVerse bug report</b>\n<pre>${escapeHtml(metadataText)}</pre>\n\n`;
  const escapedDescription = escapeHtml(description);
  const body = `${prefix}${escapedDescription}`;
  if (body.length > maxLength) return null;

  const diagnosticsLabel = "\n\n<b>System diagnostics</b>\n";
  const diagnostics = logs || "No captured client errors.";
  const available = maxLength - body.length - diagnosticsLabel.length;
  if (available < 0) return null;
  const escapedDiagnostics = escapeHtml(diagnostics);
  if (escapedDiagnostics.length <= available) {
    return `${body}${diagnosticsLabel}${escapedDiagnostics}`;
  }

  const marker = "\n[Diagnostics shortened to fit Telegram's message limit.]";
  const escapedMarker = escapeHtml(marker);
  if (escapedMarker.length > available) return null;
  let low = 0;
  let high = diagnostics.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (
      escapeHtml(diagnostics.slice(0, middle)).length + escapedMarker.length <=
      available
    ) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }
  return `${body}${diagnosticsLabel}${escapeHtml(diagnostics.slice(0, low))}${escapedMarker}`;
}

function redactReportText(value: string): string {
  return value
    .replace(/\bgithub_pat_[A-Za-z0-9_]+\b/g, "[REDACTED_GITHUB_TOKEN]")
    .replace(/\bgh[pousr]_[A-Za-z0-9_]+\b/g, "[REDACTED_GITHUB_TOKEN]")
    .replace(/\bBearer\s+\S+/gi, "Bearer [REDACTED]")
    .replace(/\b\d{7,12}:[A-Za-z0-9_-]{25,}\b/g, "[REDACTED_BOT_TOKEN]")
    .replace(/([?&](?:token|auth|key|secret|password)=)[^&#\s]+/gi, "$1[REDACTED]");
}

function escapeMarkdownV2(value: string): string {
  return value.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, "\\$1");
}

function escapeMarkdownCode(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/`/g, "\\`");
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
  const isChatViolation = report.reportType === "chat_violation";
  const description =
    typeof report.description === "string"
      ? redactReportText(report.description.trim())
      : isChatViolation
        ? "Chat message violation report"
        : "";
  const logs =
    typeof report.logs === "string" ? redactReportText(report.logs) : "";
  const screenshotInputs = Array.isArray(report.screenshots)
    ? report.screenshots
    : typeof report.screenshot === "string" && report.screenshot
      ? [{ name: "screenshot.jpg", dataUrl: report.screenshot }]
      : [];
  if (
    !description ||
    description.length > MAX_DESCRIPTION_LENGTH ||
    logs.length > MAX_LOG_LENGTH
  ) {
    return NextResponse.json({ error: "Invalid report content." }, { status: 400 });
  }
  let text: string;
  if (isChatViolation) {
    const allowedCategories = new Set([
      "Pesan tidak pantas",
      "Scam atau penipuan",
      "Intimidasi atau perundungan",
      "Konten asusila",
      "Spam",
      "Lainnya",
    ]);
    const category =
      typeof report.category === "string" ? report.category.trim() : "";
    const otherDescription =
      typeof report.otherDescription === "string"
        ? redactReportText(report.otherDescription.trim()).slice(0, 500)
        : "";
    const inputs = Array.isArray(report.reportedMessages)
      ? report.reportedMessages
      : [];
    if (
      !allowedCategories.has(category) ||
      (category === "Lainnya" && !otherDescription) ||
      inputs.length === 0 ||
      inputs.length > 50
    ) {
      return NextResponse.json({ error: "Invalid chat report." }, { status: 400 });
    }
    const reportedMessages: Array<{ timestamp: string; name: string; message: string }> = [];
    let messageBudget = 1000;
    for (const input of inputs) {
      if (!input || typeof input !== "object" || messageBudget <= 0) continue;
      const item = input as Record<string, unknown>;
      const timestamp =
        typeof item.timestamp === "string"
          ? item.timestamp.replace(/[\r\n]/g, " ").slice(0, 80)
          : "";
      const name =
        typeof item.name === "string"
          ? redactReportText(item.name.trim()).replace(/[\r\n]/g, " ").slice(0, 100)
          : "";
      const rawMessage =
        typeof item.message === "string"
          ? redactReportText(item.message.trim())
              .replace(/\r\n?/g, "\n")
              .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
          : "";
      if (!timestamp || !name || !rawMessage) continue;
      const message = rawMessage.slice(0, messageBudget);
      messageBudget -= message.length;
      reportedMessages.push({ timestamp, name, message });
    }
    if (reportedMessages.length === 0) {
      return NextResponse.json({ error: "Invalid chat report messages." }, { status: 400 });
    }

    const reporter = await getTelegramUser(session.uid);
    const fullName =
      [reporter?.first_name, reporter?.last_name].filter(Boolean).join(" ").trim() ||
      reporter?.username ||
      `User ${session.uid}`;
    const username = reporter?.username ? `@${reporter.username}` : "Tidak tersedia";
    const firstTimestamp = reportedMessages[0].timestamp;
    const categoryDetail =
      category === "Lainnya"
        ? `\n  _Detail:_ ${escapeMarkdownV2(otherDescription)}`
        : "";
    const messageBlock = reportedMessages
      .map(
        (item) =>
          `[${item.timestamp}] ${item.name}: ${item.message}`,
      )
      .join("\n");
    text = [
      "*Subjek:* Laporan Pelanggaran Pengguna",
      "",
      "Yth\\. Admin/Customer Service CheyaVerse,",
      "Seseorang telah melaporkan salah satu pengguna yang telah mengirimkan pesan *tidak pantas* dan *melanggar panduan* komunitas aplikasi\\. Berikut adalah detail laporannya:",
      "",
      `\\- *Pengirim:* ${escapeMarkdownV2(fullName)}`,
      `\\- *Username:* ${escapeMarkdownV2(username)}`,
      `\\- *Waktu kejadian:* ${escapeMarkdownV2(firstTimestamp)}`,
      `\\- *Jenis pelanggaran:* ${escapeMarkdownV2(category)}${categoryDetail}`,
      "",
      "_*Pesan terkait dibawah ini*_",
      "```txt",
      escapeMarkdownCode(messageBlock),
      "```",
      "",
      "Mohon pihak admin dapat segera menindaklanjuti akun tersebut sesuai dengan ketentuan yang berlaku demi menjaga kenyamanan pengguna lain\\.",
      "",
      "Terima kasih atas perhatian dan kerja samanya\\.",
      "Hormat saya,",
      escapeMarkdownV2(fullName),
    ].join("\n");
    if (text.length > 4000) {
      return NextResponse.json({ error: "Chat report is too long." }, { status: 413 });
    }
  } else {
    text = "";
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
  const textParts: string[] = [];
  let bugCaption = "";
  if (!isChatViolation) {
    const reporter = await getTelegramUser(session.uid);
    const username = reporter?.username ? `@${reporter.username}` : "Unavailable";
    const maxMessageLength = screenshots.length > 0 ? 1024 : 4096;
    const formattedReport = bugReportMessage(
      session.uid,
      username,
      page,
      report.metadata,
      report.platform,
      description,
      logs,
      maxMessageLength,
    );
    if (!formattedReport) {
      return NextResponse.json(
        {
          error:
            screenshots.length > 0
              ? "The report text is too long to send with attachments in one Telegram message. Shorten the description and try again."
              : "The report is too long to send in one Telegram message.",
        },
        { status: 413 },
      );
    }
    bugCaption = formattedReport;
    text = formattedReport;
  } else {
    text = "";
  }
  if (isChatViolation) {
    textParts.push(text);
  }

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
        if (!isChatViolation) {
          if (screenshots.length === 1) {
            return sendTelegramPhoto(
              adminId,
              screenshots[0].blob,
              bugCaption,
              REPORT_DELIVERY_RETRY,
              "HTML",
            );
          }
          if (screenshots.length > 1) {
            return sendTelegramMediaGroup(
              adminId,
              screenshots.map((screenshot) => ({
                blob: screenshot.blob,
                filename: screenshot.name,
              })),
              bugCaption,
              REPORT_DELIVERY_RETRY,
            );
          }
          return sendTelegramMessage(adminId, bugCaption, {
            parseMode: "HTML",
            retry: REPORT_DELIVERY_RETRY,
          });
        }

        for (const chunk of textParts) {
          const messageSent = await sendTelegramMessage(adminId, chunk, {
            retry: REPORT_DELIVERY_RETRY,
            parseMode: "MarkdownV2",
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
          ) ||
          (!isChatViolation && deliveredCount > 0),
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
