import "server-only";

import { createHmac, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const BUCKET = "user-media";
const SIGNED_URL_TTL_SECONDS = 60;

let client: ReturnType<typeof createClient> | null = null;

function createStorageAccessToken(): string {
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) {
    throw new Error(
      "SUPABASE_JWT_SECRET is required with an sb_secret_ key to authorize Supabase Storage requests.",
    );
  }

  const now = Math.floor(Date.now() / 1000);
  const encode = (value: Record<string, string | number>) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  const signingInput = [
    encode({ alg: "HS256", typ: "JWT" }),
    encode({
      aud: "authenticated",
      iss: "supabase",
      role: "service_role",
      iat: now,
      exp: now + 300,
    }),
  ].join(".");
  const signature = createHmac("sha256", secret)
    .update(signingInput)
    .digest("base64url");
  return `${signingInput}.${signature}`;
}

function getStorageClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("Supabase Storage is not configured.");
  }
  if (!client) {
    const accessToken = serviceRoleKey.startsWith("sb_secret_")
      ? async () => createStorageAccessToken()
      : undefined;
    client = createClient(url, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      ...(accessToken ? { accessToken } : {}),
    });
  }
  return client;
}

function isValidUid(uid: number): boolean {
  return Number.isSafeInteger(uid) && uid > 0;
}

export function isUserMediaPath(uid: number, path: string | null | undefined): path is string {
  if (!isValidUid(uid) || !path || path.includes("\\") || /[\u0000-\u001f]/.test(path)) {
    return false;
  }
  const segments = path.split("/");
  return (
    segments.length >= 3 &&
    segments[0] === String(uid) &&
    segments.every((segment) => segment !== "" && segment !== "." && segment !== "..")
  );
}

function getPathUid(path: string): number | null {
  const uid = Number(path.split("/", 1)[0]);
  return isValidUid(uid) ? uid : null;
}

function cleanFilename(value: string): string {
  const cleaned = value
    .replace(/[\\/]/g, "_")
    .replace(/[\u0000-\u001f]/g, "")
    .replace(/^\.+$/, "")
    .trim()
    .slice(0, 140);
  return cleaned || "file";
}

export async function uploadUserMediaObject(
  uid: number,
  category: string,
  file: Blob,
  filename: string,
  contentType: string,
): Promise<string> {
  if (!isValidUid(uid)) throw new Error("Invalid storage owner.");
  if (!/^[a-z][a-z0-9_-]{0,39}$/i.test(category)) {
    throw new Error("Invalid storage category.");
  }
  const path = `${uid}/${category}/${randomUUID()}-${cleanFilename(filename)}`;
  const bytes = Buffer.from(await file.arrayBuffer());
  const { error } = await getStorageClient()
    .storage
    .from(BUCKET)
    .upload(path, bytes, { contentType, upsert: false });
  if (error) throw error;
  return path;
}

export async function deleteUserMediaObject(
  uid: number,
  path: string,
): Promise<void> {
  if (!isUserMediaPath(uid, path)) {
    throw new Error("Storage object is outside the requested user's namespace.");
  }
  const { error } = await getStorageClient()
    .storage
    .from(BUCKET)
    .remove([path]);
  if (error) throw error;
}

export async function createUserMediaSignedDownloadUrl(
  uid: number,
  path: string,
  downloadName?: string,
): Promise<string> {
  const pathUid = getPathUid(path);
  const ownerUid = uid > 0 ? uid : pathUid;
  if (pathUid === null || ownerUid !== pathUid || !isUserMediaPath(ownerUid, path)) {
    throw new Error("Storage object is outside the requested user's namespace.");
  }
  const { data, error } = await getStorageClient()
    .storage
    .from(BUCKET)
    .createSignedUrl(
      path,
      SIGNED_URL_TTL_SECONDS,
      downloadName ? { download: cleanFilename(downloadName) } : undefined,
    );
  if (error) throw error;
  if (!data?.signedUrl) throw new Error("Could not sign storage download URL.");
  return data.signedUrl;
}

export async function fetchUserMediaObject(
  uid: number | null,
  path: string,
  init?: RequestInit,
  downloadName?: string,
): Promise<Response> {
  const signedUrl = await createUserMediaSignedDownloadUrl(uid ?? 0, path, downloadName);
  return fetch(signedUrl, { ...init, cache: "no-store" });
}
