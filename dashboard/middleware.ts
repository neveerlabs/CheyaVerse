import { NextRequest, NextResponse } from "next/server";

type SessionPayload = {
  uid: number;
  deviceId: string | null;
  exp: number;
};

const COOKIE_NAME = "cheya_session";
const PUBLIC_API = [
  /^\/api\/auth\/telegram$/,
  /^\/api\/media\/\d{7}\/content$/,
  /^\/api\/media\/\d{7}\/direct-download$/,
  /^\/api\/download\/\d{7}$/,
  /^\/api\/avatar\/\d+$/,
  /^\/api\/avatar\/\d+\/circular$/,
  /^\/api\/user\/\d+\/avatar$/,
];

function decodeBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let index = 0; index < raw.length; index++) {
    bytes[index] = raw.charCodeAt(index);
  }
  return bytes;
}

async function readEdgeSession(
  token: string | undefined,
): Promise<SessionPayload | null> {
  const secret = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token || !secret) return null;
  try {
    const [payload, suppliedSignature, ...extra] = token.split(".");
    if (!payload || !suppliedSignature || extra.length) return null;
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      decodeBase64Url(suppliedSignature),
      new TextEncoder().encode(payload),
    );
    if (!valid) return null;
    const session = JSON.parse(
      new TextDecoder().decode(decodeBase64Url(payload)),
    ) as Partial<SessionPayload>;
    if (
      !Number.isSafeInteger(session.uid) ||
      (session.uid ?? 0) <= 0 ||
      !Number.isSafeInteger(session.exp) ||
      (session.exp ?? 0) <= Math.floor(Date.now() / 1000) ||
      (session.deviceId !== null &&
        session.deviceId !== undefined &&
        !/^\d{10}$/.test(session.deviceId))
    ) {
      return null;
    }
    return {
      uid: session.uid!,
      deviceId: session.deviceId ?? null,
      exp: session.exp!,
    };
  } catch {
    return null;
  }
}

function loginRedirect(request: NextRequest): NextResponse {
  const login = new URL("/login", request.url);
  login.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(login);
}

function requestUid(request: NextRequest): number | null {
  const pathParts = request.nextUrl.pathname.split("/").filter(Boolean);
  if (pathParts[0] === "api") {
    const uidPathIndex = ["avatar", "cover", "messages", "notifications"].includes(
      pathParts[1] ?? "",
    )
      ? 2
      : pathParts[1] === "user"
        ? 2
        : -1;
    if (uidPathIndex >= 0) {
      const parsed = Number(pathParts[uidPathIndex]);
      if (Number.isSafeInteger(parsed) && parsed > 0) return parsed;
    }
    const queryUid = request.nextUrl.searchParams.get("uid");
    if (queryUid) {
      const parsed = Number(queryUid);
      if (Number.isSafeInteger(parsed) && parsed > 0) return parsed;
      return -1;
    }
    return null;
  }
  if (pathParts[0] === "security" && pathParts[1] === "block") {
    const queryUid = Number(request.nextUrl.searchParams.get("uid"));
    return Number.isSafeInteger(queryUid) && queryUid > 0 ? queryUid : -1;
  }
  const parsed = Number(pathParts[0]);
  if (Number.isSafeInteger(parsed) && parsed > 0) return parsed;
  return null;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (
    pathname === "/" ||
    pathname === "/login" ||
    pathname === "/blocked" ||
    pathname.startsWith("/m/") ||
    pathname.startsWith("/download/") ||
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/assets/") ||
    pathname === "/sw.js" ||
    pathname === "/manifest.json" ||
    PUBLIC_API.some((pattern) => pattern.test(pathname))
  ) {
    return NextResponse.next();
  }

  if (!pathname.startsWith("/api/")) {
    const parts = pathname.split("/").filter(Boolean);
    if (!/^\d+$/.test(parts[0] ?? "") && !(parts[0] === "security" && parts[1] === "block")) {
      return loginRedirect(request);
    }
  }

  const session = await readEdgeSession(
    request.cookies.get(COOKIE_NAME)?.value,
  );
  if (!session) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
    return loginRedirect(request);
  }

  const expectedUid = requestUid(request);
  if (expectedUid === -1 || (expectedUid !== null && expectedUid !== session.uid)) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }
    return NextResponse.redirect(new URL(`/${session.uid}`, request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico)$).*)"],
};
