import { NextRequest, NextResponse } from "next/server";
import { getUserSession, hasValidSameOrigin } from "@/lib/auth-request";
import {
  clearAccountDisplayName,
  getAccountDisplayName,
  getTelegramUser,
  saveAccountDisplayName,
} from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonError(message: string, status: number) {
  return NextResponse.json(
    { error: message },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export async function GET(request: NextRequest) {
  const session = await getUserSession(request);
  if (!session) return jsonError("Your session has expired. Sign in again.", 401);

  try {
    const [account, displayName] = await Promise.all([
      getTelegramUser(session.uid),
      getAccountDisplayName(session.uid),
    ]);
    if (!account || account.role === "deleted") {
      return jsonError("Account details are unavailable.", 404);
    }
    return NextResponse.json(
      {
        account: {
          telegramId: account.uid,
          username: account.username,
          firstName: account.first_name,
          lastName: account.last_name,
          createdAt: account.created_at,
        },
        displayName,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[account/preferences] failed to read account settings:", error);
    return jsonError("Account settings could not be loaded.", 500);
  }
}

export async function PUT(request: NextRequest) {
  if (!hasValidSameOrigin(request)) {
    return jsonError("Invalid request origin.", 403);
  }
  const session = await getUserSession(request);
  if (!session) return jsonError("Your session has expired. Sign in again.", 401);

  const body = await request.json().catch(() => null);
  if (
    !body ||
    typeof body.displayName !== "string" ||
    body.displayName.trim().length < 1 ||
    body.displayName.trim().length > 40 ||
    /[\u0000-\u001f\u007f]/.test(body.displayName)
  ) {
    return jsonError("Display name must contain 1 to 40 characters.", 400);
  }

  try {
    const account = await getTelegramUser(session.uid);
    if (!account || account.role === "deleted") {
      return jsonError("Account details are unavailable.", 404);
    }
    const displayName = body.displayName.trim();
    await saveAccountDisplayName(session.uid, displayName);
    return NextResponse.json(
      { ok: true, displayName },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[account/preferences] failed to save account settings:", error);
    return jsonError("Display name could not be saved.", 500);
  }
}

export async function DELETE(request: NextRequest) {
  if (!hasValidSameOrigin(request)) {
    return jsonError("Invalid request origin.", 403);
  }
  const session = await getUserSession(request);
  if (!session) return jsonError("Your session has expired. Sign in again.", 401);

  try {
    await clearAccountDisplayName(session.uid);
    return NextResponse.json(
      { ok: true, displayName: null },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[account/preferences] failed to reset display name:", error);
    return jsonError("Display name could not be reset.", 500);
  }
}
