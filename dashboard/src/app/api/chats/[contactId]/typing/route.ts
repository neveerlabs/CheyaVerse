import { NextRequest, NextResponse } from "next/server";
import { getUserSession } from "@/lib/auth-request";
import { getTelegramUser } from "@/lib/storage";
import { broadcastToUid } from "@/lib/realtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: { contactId: string } },
) {
  const session = await getUserSession(request);
  if (!session) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const contactUid = Number(params.contactId);
  if (
    !Number.isSafeInteger(contactUid) ||
    contactUid <= 0 ||
    contactUid === session.uid
  ) {
    return NextResponse.json({ ok: false, error: "invalid_contact" }, { status: 400 });
  }
  const body = await request.json().catch(() => null);
  if (typeof body?.typing !== "boolean") {
    return NextResponse.json({ ok: false, error: "invalid_typing_state" }, { status: 400 });
  }
  if (!(await getTelegramUser(contactUid))) {
    return NextResponse.json({ ok: false, error: "contact_not_found" }, { status: 404 });
  }
  broadcastToUid(contactUid, {
    type: "direct-chat:typing",
    senderUid: session.uid,
    recipientUid: contactUid,
    typing: body.typing,
  });
  return NextResponse.json(
    { ok: true },
    { headers: { "Cache-Control": "no-store" } },
  );
}
