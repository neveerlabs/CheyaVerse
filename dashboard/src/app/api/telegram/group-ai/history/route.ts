import { NextRequest, NextResponse } from "next/server";
import { getUserSession, hasValidSameOrigin } from "@/lib/auth-request";
import { config } from "@/lib/config";
import {
  getTelegramGroupAiStatus,
  listOwnedTelegramGroupAiSettings,
} from "@/lib/storage";
import {
  importTelegramGroupHistory,
  type TelegramGroupHistoryImportMessage,
} from "@/lib/telegram-ai-memory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_MEDIA_TYPES = new Set([
  "photo",
  "video",
  "animation",
  "document",
  "audio",
  "voice",
  "video_note",
  "sticker",
]);

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

async function authorizedAdmin(request: NextRequest) {
  const session = await getUserSession(request);
  if (!session) return { response: NextResponse.json({ error: "Unauthorized." }, { status: 401 }) };
  if (!config.adminTelegramIds.has(session.uid)) {
    return { response: NextResponse.json({ error: "Forbidden." }, { status: 403 }) };
  }
  return { session };
}

export async function GET(request: NextRequest) {
  const auth = await authorizedAdmin(request);
  if (auth.response) return auth.response;
  try {
    const botId = Number(config.telegram.botToken.split(":")[0]);
    const groups = await listOwnedTelegramGroupAiSettings(auth.session.uid);
    return NextResponse.json({
      ok: true,
      groups,
      botId: Number.isSafeInteger(botId) && botId > 0 ? botId : null,
    }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("[telegram/group-ai/history] could not load groups:", error);
    return NextResponse.json(
      { error: "Daftar grup Telegram AI tidak dapat dimuat." },
      { status: 503 },
    );
  }
}

export async function POST(request: NextRequest) {
  if (!hasValidSameOrigin(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }
  const auth = await authorizedAdmin(request);
  if (auth.response) return auth.response;

  let body: Record<string, unknown> | null;
  try {
    body = asRecord(await request.json());
  } catch {
    body = null;
  }
  const groupId = body?.groupId;
  if (
    !body ||
    typeof groupId !== "number" ||
    !Number.isSafeInteger(groupId) ||
    groupId >= 0 ||
    !Array.isArray(body.messages) ||
    body.messages.length < 1 ||
    body.messages.length > 100
  ) {
    return NextResponse.json({ error: "Data impor Telegram tidak valid." }, { status: 400 });
  }

  const messages: TelegramGroupHistoryImportMessage[] = [];
  for (const candidate of body.messages) {
    const row = asRecord(candidate);
    const messageId = row?.messageId;
    const senderKind = row?.senderKind;
    const senderName = row?.senderName;
    const content = row?.content;
    const mediaTypes = row?.mediaTypes;
    const replyToMessageId = row?.replyToMessageId;
    const createdAt = row?.createdAt;
    const parsedDate = typeof createdAt === "string" ? Date.parse(createdAt) : NaN;
    if (
      !row ||
      typeof messageId !== "number" ||
      !Number.isSafeInteger(messageId) ||
      messageId <= 0 ||
      senderKind !== "user" && senderKind !== "bot" ||
      typeof senderName !== "string" ||
      senderName.length > 120 ||
      typeof content !== "string" ||
      !content.trim() ||
      content.length > 4000 ||
      !Array.isArray(mediaTypes) ||
      mediaTypes.length > 8 ||
      !mediaTypes.every(
        (item) => typeof item === "string" && ALLOWED_MEDIA_TYPES.has(item),
      ) ||
      replyToMessageId !== null &&
        (typeof replyToMessageId !== "number" ||
          !Number.isSafeInteger(replyToMessageId) ||
          replyToMessageId <= 0) ||
      !Number.isFinite(parsedDate)
    ) {
      return NextResponse.json({ error: "Ada pesan export yang formatnya tidak valid." }, { status: 400 });
    }
    messages.push({
      messageId,
      senderKind,
      senderName,
      content,
      mediaTypes: mediaTypes as string[],
      replyToMessageId: replyToMessageId as number | null,
      createdAt: new Date(parsedDate).toISOString(),
    });
  }

  try {
    const status = await getTelegramGroupAiStatus(groupId);
    if (!status.enabled || status.ownerUid !== auth.session.uid) {
      return NextResponse.json({ error: "Grup tidak aktif atau bukan milik admin ini." }, { status: 403 });
    }
    const imported = await importTelegramGroupHistory({
      ownerUid: auth.session.uid,
      groupId,
      groupTitle: status.groupTitle,
      messages,
    });
    if (imported !== messages.length) {
      return NextResponse.json(
        { error: "Tidak semua pesan berhasil disimpan. Impor aman diulangi; pesan yang sama diperbarui." },
        { status: 409 },
      );
    }
    return NextResponse.json({ ok: true, imported });
  } catch (error) {
    console.error("[telegram/group-ai/history] import failed:", error);
    return NextResponse.json(
      { error: "Riwayat Telegram gagal disimpan ke database." },
      { status: 503 },
    );
  }
}
