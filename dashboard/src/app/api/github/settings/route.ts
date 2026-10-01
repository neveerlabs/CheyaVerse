import { NextRequest, NextResponse } from "next/server";
import { getUserSession, hasValidSameOrigin } from "@/lib/auth-request";
import {
  getGitHubCredentialStatus,
  githubFetch,
  GitHubApiError,
  getGitHubResponseError,
  isGitHubEncryptionConfigured,
  removeGitHubCredential,
  saveGitHubCredential,
} from "@/lib/github";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = await getUserSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  try {
    const credential = await getGitHubCredentialStatus(session.uid);
    return NextResponse.json(
      {
        connected: credential.connected,
        login: credential.login,
        scopes: credential.scopes,
        updatedAt: credential.updatedAt,
        encryptionConfigured: isGitHubEncryptionConfigured(),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[github/settings] failed to read GitHub settings:", error);
    return NextResponse.json(
      { error: "GitHub settings could not be loaded." },
      { status: 500 },
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

  const body = await request.json().catch(() => null);
  const token = typeof body?.token === "string" ? body.token.trim() : "";
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
    return NextResponse.json(
      { ok: true, login: user.login },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof GitHubApiError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }
    console.error("[github/settings] failed to save GitHub token:", error);
    return NextResponse.json(
      { error: "GitHub token could not be saved." },
      { status: 500 },
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
