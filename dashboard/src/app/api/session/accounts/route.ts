import { NextRequest, NextResponse } from "next/server";
import { getUserSession, hasValidSameOrigin } from "@/lib/auth-request";
import {
  listActiveAccountsForDevice,
  setDeviceAccountState,
} from "@/lib/storage";
import {
  createSessionToken,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
} from "@/lib/session-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEVICE_ID_RE = /^\d{10}$/;

function unavailable() {
  return NextResponse.json(
    { ok: false, error: "account_switch_unavailable" },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}

export async function GET(request: NextRequest) {
  try {
    const session = await getUserSession(request);
    if (!session) {
      return NextResponse.json(
        { ok: false, error: "unauthorized" },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
    }
    if (!session.deviceId || !DEVICE_ID_RE.test(session.deviceId)) {
      return NextResponse.json(
        { ok: true, accounts: [], currentUid: session.uid },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    const accounts = await listActiveAccountsForDevice(session.deviceId);
    if (!accounts.some((account) => account.uid === session.uid)) {
      return NextResponse.json(
        { ok: false, error: "device_not_linked" },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      );
    }
    return NextResponse.json(
      {
        ok: true,
        accounts: accounts.map(({ uid, username, firstName, lastName }) => ({
          uid,
          username,
          firstName,
          lastName,
        })),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[session/accounts] failed to list device accounts:", error);
    return unavailable();
  }
}

export async function POST(request: NextRequest) {
  if (!hasValidSameOrigin(request)) {
    return NextResponse.json(
      { ok: false, error: "invalid_origin" },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const session = await getUserSession(request);
    if (!session) {
      return NextResponse.json(
        { ok: false, error: "unauthorized" },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
    }
    if (!session.deviceId || !DEVICE_ID_RE.test(session.deviceId)) {
      return NextResponse.json(
        { ok: false, error: "device_not_linked" },
        { status: 409, headers: { "Cache-Control": "no-store" } },
      );
    }

    const body = await request.json().catch(() => null);
    const targetUid =
      body && typeof body === "object" && "uid" in body
        ? body.uid
        : null;
    if (
      typeof targetUid !== "number" ||
      !Number.isSafeInteger(targetUid) ||
      targetUid <= 0 ||
      targetUid === session.uid
    ) {
      return NextResponse.json(
        { ok: false, error: "invalid_account" },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const [currentAccount, targetAccount] = await Promise.all([
      listActiveAccountsForDevice(session.deviceId, session.uid),
      listActiveAccountsForDevice(session.deviceId, targetUid),
    ]);
    if (!currentAccount.length) {
      return NextResponse.json(
        { ok: false, error: "device_not_linked" },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      );
    }
    const account = targetAccount[0];
    if (!account) {
      return NextResponse.json(
        { ok: false, error: "account_not_available_on_device" },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      );
    }

    await setDeviceAccountState(session.deviceId, account.uid);
    const response = NextResponse.json(
      { ok: true, uid: account.uid },
      { headers: { "Cache-Control": "no-store" } },
    );
    response.cookies.set(
      SESSION_COOKIE_NAME,
      createSessionToken(
        account.uid,
        session.deviceId,
        false,
        account.sessionVersion,
      ),
      {
        httpOnly: true,
        secure:
          process.env.NODE_ENV === "production" ||
          request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ===
            "https" ||
          request.nextUrl.protocol === "https:",
        sameSite: "lax",
        path: "/",
        maxAge: SESSION_MAX_AGE_SECONDS,
      },
    );
    return response;
  } catch (error) {
    console.error("[session/accounts] failed to switch device account:", error);
    return unavailable();
  }
}
