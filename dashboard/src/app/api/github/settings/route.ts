import { NextRequest, NextResponse } from "next/server";
import { getUserSession, hasValidSameOrigin } from "@/lib/auth-request";
import {
  getGitHubCredentialStatus,
  githubFetch,
  GitHubApiError,
  getGitHubResponseError,
  getGitHubEncryptionStatus,
  getGitHubToken,
  isGitHubEncryptionConfigured,
  removeGitHubCredential,
  saveGitHubCredential,
} from "@/lib/github";
import {
  readBoundedJson,
  RequestBodyTooLargeError,
} from "@/lib/read-bounded-json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_TOKEN_REQUEST_BYTES = 2048;

export async function GET(request: NextRequest) {
  try {
    const session = await getUserSession(request);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    const credential = await getGitHubCredentialStatus(session.uid);
    return NextResponse.json(
      {
        connected: credential.connected,
        tokenReadable: credential.tokenReadable,
        login: credential.login,
        scopes: credential.scopes,
        updatedAt: credential.updatedAt,
        encryptionConfigured: isGitHubEncryptionConfigured(),
        encryptionStatus: getGitHubEncryptionStatus(),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[github/settings] failed to read GitHub settings:", error);
    return NextResponse.json(
      { error: "GitHub settings are temporarily unavailable. Check the database connection and retry." },
      {
        status: 503,
        headers: { "Cache-Control": "no-store", "Retry-After": "5" },
      },
    );
  }
}

export async function POST(request: NextRequest) {
  if (!hasValidSameOrigin(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }
  const session = await getUserSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!isGitHubEncryptionConfigured()) {
    return NextResponse.json(
      { error: "GitHub token encryption is not configured on the server." },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await readBoundedJson(request, MAX_TOKEN_REQUEST_BYTES);
  } catch (error) {
    const oversized = error instanceof RequestBodyTooLargeError;
    return NextResponse.json(
      {
        error:
          oversized
            ? "Token request is too large."
            : "Invalid token request.",
      },
      {
        status: oversized ? 413 : 400,
      },
    );
  }
  const payload =
    body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const token = typeof payload.token === "string" ? payload.token.trim() : "";
  if (token.length < 20 || token.length > 512 || !/^[A-Za-z0-9_]+$/.test(token)) {
    return NextResponse.json(
      { error: "Enter a valid GitHub personal access token." },
      { status: 400 },
    );
  }

  try {
    const response = await githubFetch(token, "/user");
    if (!response.ok) throw await getGitHubResponseError(response);
    const user = (await response.json()) as { login?: unknown };
    if (typeof user.login !== "string" || !user.login) {
      return NextResponse.json(
        { error: "GitHub did not return an account for this token." },
        { status: 502 },
      );
    }
    await saveGitHubCredential(
      session.uid,
      token,
      user.login,
      response.headers.get("x-oauth-scopes"),
    );
    const storedToken = await getGitHubToken(session.uid);
    if (storedToken !== token) {
      throw new Error("GITHUB_CREDENTIAL_READBACK_FAILED");
    }
    return NextResponse.json(
      { ok: true, connected: true, login: user.login },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof GitHubApiError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }
    console.error("[github/settings] failed to save or verify GitHub credential:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error &&
          error.message === "GITHUB_CREDENTIAL_READBACK_FAILED"
            ? "GitHub checked the token, but the saved connection could not be verified. Please retry and check the server database connection."
            : "GitHub token could not be saved. Check the server database connection and try again.",
      },
      { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "10" } },
    );
  }
}

export async function DELETE(request: NextRequest) {
  if (!hasValidSameOrigin(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }
  const session = await getUserSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  try {
    await removeGitHubCredential(session.uid);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[github/settings] failed to remove GitHub token:", error);
    return NextResponse.json(
      { error: "GitHub token could not be removed." },
      { status: 500 },
    );
  }
}
