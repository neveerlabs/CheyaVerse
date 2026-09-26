import { NextRequest, NextResponse } from "next/server";
import { getUserSession } from "@/lib/auth-request";
import { broadcastToUid } from "@/lib/realtime";
import { sendOfflineDirectMessageNotifications } from "@/lib/chat-notifications";
import {
  createDirectMessage,
  getDirectMessageById,
  getTelegramUser,
  isTelegramUserOnline,
} from "@/lib/storage";
import { deleteTelegramMessage, uploadAudioToStorage } from "@/lib/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_AUDIO_BYTES = 3 * 1024 * 1024;
const MAX_DURATION_MS = 120_000;
const AUDIO_TYPES = new Set([
  "audio/webm",
  "audio/mp4",
  "audio/ogg",
  "audio/mpeg",
]);

function errorResponse(error: string, status: number) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function POST(
  request: NextRequest,
  { params }: { params: { contactId: string } },
) {
  const session = await getUserSession(request);
  if (!session) return errorResponse("unauthorized", 401);

  const contactUid = Number(params.contactId);
  if (
    !Number.isSafeInteger(contactUid) ||
    contactUid <= 0 ||
    contactUid === session.uid
  ) {
    return errorResponse("invalid_contact", 400);
  }
  let contactExists: boolean;
  try {
    contactExists = Boolean(await getTelegramUser(contactUid));
  } catch (error) {
    console.error("[chats/voice] failed to load recipient:", error);
    return errorResponse("database_unavailable", 500);
  }
  if (!contactExists) {
    return errorResponse("account_not_found", 404);
  }

  const form = await request.formData().catch(() => null);
  if (!form) return errorResponse("invalid_form", 400);
  const audio = form.get("audio");
  if (!(audio instanceof Blob)) return errorResponse("missing_audio", 400);
  const audioType = audio.type.toLowerCase().split(";")[0].trim();
  if (!AUDIO_TYPES.has(audioType)) {
    return errorResponse("unsupported_audio_type", 415);
  }
  if (audio.size < 1 || audio.size > MAX_AUDIO_BYTES) {
    return errorResponse("audio_size_out_of_range", 413);
  }

  const durationMs = Number(form.get("durationMs"));
  if (
    !Number.isSafeInteger(durationMs) ||
    durationMs < 500 ||
    durationMs > MAX_DURATION_MS
  ) {
    return errorResponse("invalid_audio_duration", 400);
  }

  const replyToId = form.get("replyToId");
  if (replyToId !== null && typeof replyToId !== "string") {
    return errorResponse("invalid_reply", 400);
  }
  if (typeof replyToId === "string") {
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(replyToId)) {
      return errorResponse("invalid_reply", 400);
    }
    let repliedMessage;
    try {
      repliedMessage = await getDirectMessageById(replyToId);
    } catch (error) {
      console.error("[chats/voice] failed to load reply target:", error);
      return errorResponse("database_unavailable", 500);
    }
    if (
      !repliedMessage ||
      !(
        (repliedMessage.sender_uid === session.uid &&
          repliedMessage.recipient_uid === contactUid) ||
        (repliedMessage.sender_uid === contactUid &&
          repliedMessage.recipient_uid === session.uid)
      )
    ) {
      return errorResponse("reply_not_found", 404);
    }
  }

  const extension =
    audioType === "audio/mp4"
      ? "m4a"
      : audioType === "audio/ogg"
        ? "ogg"
        : audioType === "audio/mpeg"
          ? "mp3"
          : "webm";
  const uploaded = await uploadAudioToStorage(
    audio,
    `voice-${session.uid}-${Date.now()}.${extension}`,
  );
  if (!uploaded) return errorResponse("audio_storage_failed", 502);

  try {
    const online = await isTelegramUserOnline(contactUid);
    const message = await createDirectMessage(session.uid, contactUid, "", {
      deliveredAt: online ? new Date().toISOString() : null,
      mediaFileId: uploaded.file_id,
      mediaMessageId: uploaded.message_id,
      mediaContentType: audioType,
      mediaDurationMs: durationMs,
      replyToId: typeof replyToId === "string" ? replyToId : null,
    });
    broadcastToUid(contactUid, { type: "direct-message:new", message });
    broadcastToUid(session.uid, { type: "direct-message:new", message });

    if (!online) {
      const sender = await getTelegramUser(session.uid);
      const senderName = sender
        ? [sender.first_name, sender.last_name].filter(Boolean).join(" ").trim() ||
          (sender.username ? `@${sender.username}` : `Telegram ${session.uid}`)
        : `Telegram ${session.uid}`;
      void sendOfflineDirectMessageNotifications({
        recipientUid: contactUid,
        senderUid: session.uid,
        senderName,
        content: "🎙 Pesan suara",
        messageId: message.id,
      });
    }
    return NextResponse.json({ ok: true, message });
  } catch (error) {
    console.error("[chats/voice] failed to persist voice message:", error);
    await deleteTelegramMessage(uploaded.message_id).catch((deleteError) => {
      console.error("[chats/voice] failed to roll back uploaded audio:", deleteError);
    });
    return errorResponse("voice_message_failed", 500);
  }
}
