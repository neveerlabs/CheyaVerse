import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";
import { getTurso } from "@/lib/turso";

const GITHUB_API = "https://api.github.com";
const GITHUB_TIMEOUT_MS = 12_000;
export const GITHUB_CREDENTIAL_COOKIE = "cheya_github_credential";
export const GITHUB_CREDENTIAL_COOKIE_TTL_SECONDS = 5 * 60;
let githubCredentialsReady: Promise<void> | null = null;

export type GitHubCredentialStatus = {
  connected: boolean;
  tokenReadable: boolean | null;
  login: string | null;
  scopes: string | null;
  updatedAt: string | null;
};

export class GitHubApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly resetAt?: string,
  ) {
    super(message);
    this.name = "GitHubApiError";
  }
}

export class GitHubCredentialError extends Error {
  constructor() {
    super("The saved GitHub token cannot be decrypted. Reconnect GitHub in Settings.");
    this.name = "GitHubCredentialError";
  }
}

function encryptionKey(): Buffer {
  const configured = process.env.GITHUB_TOKEN_ENCRYPTION_KEY?.trim();
  if (!configured) throw new Error("GITHUB_TOKEN_ENCRYPTION_KEY_MISSING");
  const key = Buffer.from(configured, "base64");
  if (key.length !== 32 || key.toString("base64").replace(/=+$/, "") !== configured.replace(/=+$/, "")) {
    throw new Error("GITHUB_TOKEN_ENCRYPTION_KEY_INVALID");
  }
  return key;
}

export function isGitHubEncryptionConfigured(): boolean {
  return getGitHubEncryptionStatus() === "configured";
}

export function getGitHubEncryptionStatus(): "configured" | "missing" | "invalid" {
  if (!process.env.GITHUB_TOKEN_ENCRYPTION_KEY?.trim()) return "missing";
  try {
    encryptionKey();
    return "configured";
  } catch {
    return "invalid";
  }
}

function encryptToken(token: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(token, "utf8"),
    cipher.final(),
  ]);
  return [
    "v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

function decryptToken(value: string): string {
  const [version, ivValue, tagValue, encryptedValue, ...extra] = value.split(".");
  if (
    version !== "v1" ||
    !ivValue ||
    !tagValue ||
    !encryptedValue ||
    extra.length > 0
  ) {
    throw new Error("GITHUB_TOKEN_CIPHERTEXT_INVALID");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(ivValue, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function createGitHubCredentialCookie(uid: number, token: string): string {
  const expiresAt = Math.floor(Date.now() / 1000) + GITHUB_CREDENTIAL_COOKIE_TTL_SECONDS;
  return encryptToken(`${uid}:${expiresAt}:${token}`);
}

function readGitHubCredentialCookie(
  uid: number,
  value: string | undefined,
): string | null {
  if (!value) return null;
  try {
    const decrypted = decryptToken(value);
    const match = decrypted.match(/^(\d+):(\d+):([A-Za-z0-9_]{20,512})$/);
    if (!match) return null;
    const cookieUid = Number(match[1]);
    const expiresAt = Number(match[2]);
    if (
      cookieUid !== uid ||
      !Number.isSafeInteger(expiresAt) ||
      expiresAt <= Math.floor(Date.now() / 1000)
    ) {
      return null;
    }
    return match[3];
  } catch {
    return null;
  }
}

async function ensureGitHubCredentialsTable(): Promise<void> {
  if (!githubCredentialsReady) {
    githubCredentialsReady = getTurso()
      .execute(`CREATE TABLE IF NOT EXISTS github_credentials (
        uid INTEGER PRIMARY KEY,
        encrypted_token TEXT NOT NULL,
        github_login TEXT NOT NULL,
        scopes TEXT,
        updated_at TEXT NOT NULL
      )`)
      .then(() => undefined)
      .catch((error) => {
        githubCredentialsReady = null;
        throw error;
      });
  }
  await githubCredentialsReady;
}

export async function getGitHubCredentialStatus(
  uid: number,
): Promise<GitHubCredentialStatus> {
  const credential = await getGitHubCredential(uid);
  return credential.status;
}

export async function getGitHubCredential(
  uid: number,
): Promise<{ status: GitHubCredentialStatus; token: string | null }> {
  await ensureGitHubCredentialsTable();
  const result = await getTurso().execute({
    sql: "SELECT encrypted_token, github_login, scopes, updated_at FROM github_credentials WHERE uid = ? LIMIT 1",
    args: [uid],
  });
  const row = result.rows[0] as Record<string, unknown> | undefined;
  let token: string | null = null;
  let tokenReadable: boolean | null = null;
  if (row?.encrypted_token != null) {
    try {
      token = decryptToken(String(row.encrypted_token));
      tokenReadable = true;
    } catch {
      tokenReadable = false;
    }
  }
  return {
    status: {
      connected: Boolean(row),
      tokenReadable,
      login: row?.github_login == null ? null : String(row.github_login),
      scopes: row?.scopes == null ? null : String(row.scopes),
      updatedAt: row?.updated_at == null ? null : String(row.updated_at),
    },
    token,
  };
}

export async function getGitHubToken(
  uid: number,
  fallbackCookie?: string,
): Promise<string | null> {
  const credential = await getGitHubCredential(uid);
  if (!credential.status.connected) {
    return readGitHubCredentialCookie(uid, fallbackCookie);
  }
  if (credential.status.tokenReadable !== true || credential.token === null) {
    throw new GitHubCredentialError();
  }
  return credential.token;
}

export async function saveGitHubCredential(
  uid: number,
  token: string,
  login: string,
  scopes: string | null,
): Promise<void> {
  await ensureGitHubCredentialsTable();
  const now = new Date().toISOString();
  await getTurso().execute({
    sql: `INSERT INTO github_credentials (uid, encrypted_token, github_login, scopes, updated_at)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(uid) DO UPDATE SET
            encrypted_token = excluded.encrypted_token,
            github_login = excluded.github_login,
            scopes = excluded.scopes,
            updated_at = excluded.updated_at`,
    args: [uid, encryptToken(token), login, scopes, now],
  });
}

export async function removeGitHubCredential(uid: number): Promise<void> {
  await ensureGitHubCredentialsTable();
  await getTurso().execute({
    sql: "DELETE FROM github_credentials WHERE uid = ?",
    args: [uid],
  });
}

export async function githubFetch(
  token: string,
  path: string,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GITHUB_TIMEOUT_MS);
  try {
    return await fetch(`${GITHUB_API}${path}`, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "CheyaVerse",
      },
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new GitHubApiError("GitHub request timed out. Please try again.", 504);
    }
    throw new GitHubApiError("Could not connect to GitHub. Please try again.", 502);
  } finally {
    clearTimeout(timer);
  }
}

export async function githubJson<T>(
  token: string,
  path: string,
): Promise<{ data: T; response: Response }> {
  const response = await githubFetch(token, path);
  if (!response.ok) throw await getGitHubResponseError(response);
  return { data: (await response.json()) as T, response };
}

export async function getGitHubResponseError(
  response: Response,
): Promise<GitHubApiError> {
  if (response.status === 401) {
    return new GitHubApiError(
      "GitHub token is invalid or expired. Update it in Settings.",
      response.status,
    );
  }
  if (response.status === 403) {
    const reset = response.headers.get("x-ratelimit-reset");
    const resetAt = reset ? new Date(Number(reset) * 1000).toISOString() : undefined;
    const limited = response.headers.get("x-ratelimit-remaining") === "0";
    return new GitHubApiError(
      limited
        ? `GitHub API rate limit reached${resetAt ? `. Try again after ${resetAt}` : ""}.`
        : "GitHub denied access. Check the token's repository permissions and authorize it for organization SSO if required.",
      response.status,
      resetAt,
    );
  }
  if (response.status === 404) {
    return new GitHubApiError(
      "Repository or GitHub resource was not found, or this token cannot access it.",
      response.status,
    );
  }
  if (response.status === 422) {
    return new GitHubApiError(
      "GitHub could not process this request. Check the selected branch or history range.",
      response.status,
    );
  }
  return new GitHubApiError(
    `GitHub request failed (HTTP ${response.status}).`,
    response.status,
  );
}

export function getGitHubMessage(error: unknown): string {
  return error instanceof GitHubApiError
    ? error.message
    : "GitHub data could not be loaded. Please try again.";
}

export function hasNextLink(linkHeader: string | null): boolean {
  return Boolean(linkHeader?.split(",").some((link) => /rel="next"/.test(link)));
}

export function lastPageFromLink(linkHeader: string | null): number | null {
  if (!linkHeader) return null;
  const lastLink = linkHeader
    .split(",")
    .find((link) => /rel="last"/.test(link));
  const page = lastLink?.match(/[?&]page=(\d+)/)?.[1];
  return page ? Number(page) : null;
}
