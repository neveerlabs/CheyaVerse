import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { config } from "@/lib/config";
import { broadcastToUid } from "@/lib/realtime";
import {
  listActiveAnnouncementRecipients,
  saveBroadcastAnnouncement,
} from "@/lib/storage";
import { buildSystemPush, sendPushToUid } from "@/lib/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function hasValidSecret(request: NextRequest): boolean {
  const configured = config.broadcastWebSecret;
  const authorization = request.headers.get("authorization") ?? "";
  const supplied = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : "";
  if (!configured || !supplied) return false;
  const expectedBytes = Buffer.from(configured);
  const suppliedBytes = Buffer.from(supplied);
  return (
    expectedBytes.length === suppliedBytes.length &&
    timingSafeEqual(expectedBytes, suppliedBytes)
  );
}

export async function POST(request: NextRequest) {
  if (!hasValidSecret(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_request" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ ok: false, error: "invalid_request" }, { status: 400 });
  }

  const input = body as Record<string, unknown>;
  const broadcastId =
    typeof input.broadcastId === "string" ? input.broadcastId : "";
  const contentHtml =
    typeof input.contentHtml === "string" ? input.contentHtml : "";
  const plainText = typeof input.plainText === "string" ? input.plainText : "";
  const excludedUserIds = Array.isArray(input.excludedUserIds)
    ? input.excludedUserIds.filter(
        (uid): uid is number =>
          typeof uid === "number" && Number.isSafeInteger(uid) && uid > 0,
      )
    : [];
  if (
    !/^[0-9a-f-]{36}$/i.test(broadcastId) ||
    !contentHtml.trim() ||
    contentHtml.length > 24000 ||
    plainText.length > 4000 ||
    !Array.isArray(input.excludedUserIds) ||
    excludedUserIds.length !== input.excludedUserIds.length
  ) {
    return NextResponse.json({ ok: false, error: "invalid_request" }, { status: 400 });
  }

  try {
    const recipients = await listActiveAnnouncementRecipients();
    const excluded = new Set(excludedUserIds);
    const targetUids = recipients.filter((uid) => !excluded.has(uid));
    const failedUids: number[] = [];
    let delivered = 0;

    for (let offset = 0; offset < targetUids.length; offset += 10) {
      const batch = targetUids.slice(offset, offset + 10);
      const results = await Promise.allSettled(
        batch.map(async (uid) => {
          const message = await saveBroadcastAnnouncement(uid, broadcastId, contentHtml);
          if (!message) return false;
          broadcastToUid(uid, { type: "message:new", message });
          broadcastToUid(uid, { type: "notification:new", uid });
          try {
            await sendPushToUid(
              uid,
              buildSystemPush(uid, `📢 Announcement\n${plainText.slice(0, 700)}`, {
                notifId: message.id,
                msgId: message.id,
              }),
            );
          } catch (error) {
            console.error(`[internal/announcements] push failed for ${uid}:`, error);
          }
          return true;
        }),
      );

      results.forEach((result, index) => {
        if (result.status === "fulfilled" && result.value) delivered += 1;
        else failedUids.push(batch[index]);
      });
    }

    return NextResponse.json({
      ok: true,
      delivered,
      failed: failedUids.length,
      failedUids: failedUids.slice(0, 25),
    });
  } catch (error) {
    console.error("[internal/announcements] broadcast failed:", error);
    return NextResponse.json(
      { ok: false, error: "announcement_failed" },
      { status: 500 },
    );
  }
}
