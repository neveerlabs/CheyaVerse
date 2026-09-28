import { NextRequest, NextResponse } from "next/server";
import { getUserSession } from "@/lib/auth-request";
import { listDirectConversations } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = await getUserSession(request);
  if (!session) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  try {
    const conversations = await listDirectConversations(session.uid);
    const contacts = conversations.map((conversation) => ({
      uid: conversation.user.uid,
      username: conversation.user.username,
      first_name: conversation.user.first_name,
      last_name: conversation.user.last_name,
      photo_url: conversation.user.photo_url,
    }));
    return NextResponse.json(
      { ok: true, contacts },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[chats/contacts] failed to list contacts:", error);
    return NextResponse.json(
      { ok: false, error: "contacts_failed" },
      { status: 500 },
    );
  }
}