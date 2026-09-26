import { NextRequest, NextResponse } from "next/server";
import { getUserSession } from "@/lib/auth-request";
import { getDirectMessageById } from "@/lib/storage";
import { fetchTelegramFile } from "@/lib/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

export async function GET(
  request: NextRequest,
  { params }: { params: { contactId: string; messageId: string } },
) {
  const session = await getUserSession(request);
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  const contactUid = Number(params.contactId);
  if (
    !Number.isSafeInteger(contactUid) ||
    contactUid <= 0 ||
    contactUid === session.uid ||
    !/^[A-Za-z0-9_-]{1,80}$/.test(params.messageId)
  ) {
    return new NextResponse("Invalid request", { status: 400 });
  }

  let message;
  try {
    message = await getDirectMessageById(params.messageId);
  } catch (error) {
    console.error("[chats/voice] failed to load voice metadata:", error);
    return new NextResponse("Voice message is temporarily unavailable", { status: 500 });
  }
  if (
    !message ||
    message.deleted_at ||
    !message.media_file_id ||
    !(
      (message.sender_uid === session.uid &&
        message.recipient_uid === contactUid) ||
      (message.sender_uid === contactUid &&
        message.recipient_uid === session.uid)
    )
  ) {
    return new NextResponse("Voice message not found", { status: 404 });
  }

  const file = await fetchTelegramFile(message.media_file_id);
  if (!file?.body) {
    return new NextResponse("Voice message is unavailable", { status: 502 });
  }
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch (error) {
    console.error("[chats/voice] failed to read Telegram audio stream:", error);
    return new NextResponse("Voice message is unavailable", { status: 502 });
  }
  const contentType = new Set([
    "audio/webm",
    "audio/mp4",
    "audio/ogg",
    "audio/mpeg",
  ]).has(message.media_content_type ?? "")
    ? message.media_content_type!
    : "audio/webm";
  const headers = {
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, no-store",
    "Content-Length": String(bytes.byteLength),
    "Content-Type": contentType,
    "X-Content-Type-Options": "nosniff",
  };
  const range = request.headers.get("range");
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match) return new NextResponse("Invalid byte range", { status: 416 });
    const start = match[1] ? Number(match[1]) : 0;
    const requestedEnd = match[2] ? Number(match[2]) : bytes.byteLength - 1;
    if (
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(requestedEnd) ||
      start < 0 ||
      requestedEnd < start ||
      start >= bytes.byteLength
    ) {
      return new NextResponse("Range not satisfiable", {
        status: 416,
        headers: { "Content-Range": `bytes */${bytes.byteLength}` },
      });
    }
    const end = Math.min(requestedEnd, bytes.byteLength - 1);
    const chunk = bytes.subarray(start, end + 1);
    return new NextResponse(toArrayBuffer(chunk), {
      status: 206,
      headers: {
        ...headers,
        "Content-Length": String(chunk.byteLength),
        "Content-Range": `bytes ${start}-${end}/${bytes.byteLength}`,
      },
    });
  }
  return new NextResponse(toArrayBuffer(bytes), { headers });
}
