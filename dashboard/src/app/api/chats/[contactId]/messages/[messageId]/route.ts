import { NextRequest, NextResponse } from "next/server";
import { getUserSession } from "@/lib/auth-request";
import {
  deleteDirectMessageForEveryone,
  editDirectMessage,
  getDirectMessageById,
  hideDirectMessage,
} from "@/lib/storage";
import { broadcastToUid } from "@/lib/realtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function responseError(error: string, status: number) {
  return NextResponse.json({ ok: false, error }, { status });
}

async function authorize(
  request: NextRequest,
  contactId: string,
  messageId: string,
) {
  const session = await getUserSession(request);
  const contactUid = Number(contactId);
  if (!session) return { error: responseError("unauthorized", 401) } as const;
  if (
    !Number.isSafeInteger(contactUid) ||
    contactUid <= 0 ||
    contactUid === session.uid ||
    !/^[A-Za-z0-9_-]{1,80}$/.test(messageId)
  ) {
    return { error: responseError("invalid_request", 400) } as const;
  }
  const message = await getDirectMessageById(messageId);
  if (
    !message ||
    !(
      (message.sender_uid === session.uid &&
        message.recipient_uid === contactUid) ||
      (message.sender_uid === contactUid &&
        message.recipient_uid === session.uid)
    )
  ) {
    return { error: responseError("message_not_found", 404) } as const;
  }
  return { session, contactUid, message } as const;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { contactId: string; messageId: string } },
) {
  const auth = await authorize(request, params.contactId, params.messageId);
  if ("error" in auth) return auth.error;
  if (auth.message.deleted_at) {
    return responseError("message_deleted", 409);
  }
  if (auth.message.sender_uid !== auth.session.uid) {
    return responseError("cannot_edit_others_message", 403);
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return responseError("invalid_request", 400);
  }
  if (!body || typeof body !== "object" || !("content" in body)) {
    return responseError("invalid_request", 400);
  }
  const content =
    typeof body.content === "string" ? body.content.trim().slice(0, 2000) : "";
  if (!content) return responseError("empty_content", 400);
  const message = await editDirectMessage(
    auth.session.uid,
    auth.message.id,
    content,
  );
  if (!message) return responseError("message_not_editable", 409);
  broadcastToUid(auth.contactUid, { type: "direct-message:updated", message });
  broadcastToUid(auth.session.uid, { type: "direct-message:updated", message });
  return NextResponse.json({ ok: true, message });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { contactId: string; messageId: string } },
) {
  const auth = await authorize(request, params.contactId, params.messageId);
  if ("error" in auth) return auth.error;
  const scope = request.nextUrl.searchParams.get("scope");
  if (scope === "everyone") {
    if (
      auth.message.sender_uid !== auth.session.uid &&
      !auth.message.deleted_at
    ) {
      return responseError("cannot_delete_others_message", 403);
    }
    const deleted = await deleteDirectMessageForEveryone(
      auth.session.uid,
      auth.message.id,
    );
    if (!deleted) return responseError("message_not_deletable", 409);
    broadcastToUid(auth.contactUid, {
      type: "direct-message:deleted",
      messageId: auth.message.id,
    });
    broadcastToUid(auth.session.uid, {
      type: "direct-message:deleted",
      messageId: auth.message.id,
    });
  } else if (scope === "me") {
    const hidden = await hideDirectMessage(auth.session.uid, auth.message.id);
    if (!hidden) return responseError("message_not_found", 404);
    if (auth.message.deleted_at) {
      broadcastToUid(auth.contactUid, {
        type: "direct-message:deleted",
        messageId: auth.message.id,
      });
      broadcastToUid(auth.session.uid, {
        type: "direct-message:deleted",
        messageId: auth.message.id,
      });
    } else {
      broadcastToUid(auth.session.uid, {
        type: "direct-message:hidden",
        contactUid: auth.contactUid,
        messageId: auth.message.id,
      });
    }
  } else {
    return responseError("invalid_delete_scope", 400);
  }
  return NextResponse.json({ ok: true });
}
