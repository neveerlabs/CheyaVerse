import { NextRequest, NextResponse } from "next/server";
import { getUserSession, hasValidSameOrigin } from "@/lib/auth-request";
import { deleteTelegramMessage } from "@/lib/telegram";
import { deleteWebAccountData, getDeviceIdRow } from "@/lib/storage";
import { SESSION_COOKIE_NAME } from "@/lib/session-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!hasValidSameOrigin(request)) {
    return NextResponse.json({ ok: false, error: "invalid_origin" }, { status: 403 });
  }
  const session = await getUserSession(request);
  if (!session?.deviceId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  if (body?.confirmation !== "HAPUS AKUN") {
    return NextResponse.json({ ok: false, error: "confirmation_mismatch" }, { status: 400 });
  }
  if (!(await getDeviceIdRow(session.deviceId, session.uid))) {
    return NextResponse.json({ ok: false, error: "unknown_device" }, { status: 401 });
  }

  try {
    const messageIds = await deleteWebAccountData(session.uid);
    const deletionResults = await Promise.all(
      messageIds.map((messageId) => deleteTelegramMessage(messageId)),
    );
    const storageCleanupFailed = deletionResults.filter((success) => !success).length;
    const response = NextResponse.json({ ok: true, storageCleanupFailed });
    response.cookies.set(SESSION_COOKIE_NAME, "", {
      httpOnly: true,
      secure:
        process.env.NODE_ENV === "production" ||
        request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() === "https" ||
        request.nextUrl.protocol === "https:",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
    return response;
  } catch (error) {
    console.error("[account/delete] account data deletion failed:", error);
    return NextResponse.json({ ok: false, error: "account_deletion_failed" }, { status: 500 });
  }
}
