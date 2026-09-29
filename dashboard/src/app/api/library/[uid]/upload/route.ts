import { head } from "@vercel/blob";
import {
  handleUpload,
  type HandleUploadBody,
} from "@vercel/blob/client";
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getUserSession, hasValidSameOrigin } from "@/lib/auth-request";
import { config } from "@/lib/config";
import {
  createLibraryNode,
  getLibraryNode,
  LIBRARY_MEDIA_LIMIT,
  validateLibraryDestination,
} from "@/lib/library";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function cleanName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.trim();
  if (
    !name ||
    name.length > 180 ||
    name === "." ||
    name === ".." ||
    /[\\/\u0000-\u001f]/.test(name)
  ) {
    return null;
  }
  return name;
}

function parseClientPayload(value: string | null): {
  nodeId: string;
  parentId: string | null;
  name: string;
  contentType: string;
} {
  if (!value || value.length > 1024) throw new Error("INVALID_UPLOAD");
  const payload = JSON.parse(value) as Record<string, unknown>;
  const nodeId = typeof payload.nodeId === "string" ? payload.nodeId : "";
  const parentId =
    payload.parentId === null ||
    payload.parentId === undefined ||
    payload.parentId === ""
      ? null
      : typeof payload.parentId === "string" && payload.parentId.length <= 64
        ? payload.parentId
        : undefined;
  const name = cleanName(payload.name);
  const contentType =
    typeof payload.contentType === "string" &&
    payload.contentType.length <= 200 &&
    (payload.contentType.startsWith("image/") ||
      payload.contentType.startsWith("video/")) &&
    !/[\r\n]/.test(payload.contentType)
      ? payload.contentType
      : "";
  if (!UUID_RE.test(nodeId) || parentId === undefined || !name || !contentType) {
    throw new Error("INVALID_UPLOAD");
  }
  return { nodeId, parentId, name, contentType };
}

function parseSignedPayload(value: string | null): {
  uid: number;
  nodeId: string;
  parentId: string | null;
  name: string;
  contentType: string;
} {
  if (!value || value.length > 1024) throw new Error("INVALID_UPLOAD");
  const payload = JSON.parse(value) as Record<string, unknown>;
  const uid = Number(payload.uid);
  if (!Number.isSafeInteger(uid) || uid <= 0) throw new Error("INVALID_UPLOAD");
  return { uid, ...parseClientPayload(value) };
}

export async function POST(
  request: NextRequest,
  { params }: { params: { uid: string } },
) {
  const uid = Number(params.uid);
  if (!Number.isSafeInteger(uid) || uid <= 0) {
    return NextResponse.json({ error: "Invalid account." }, { status: 400 });
  }

  try {
    const body = (await request.json()) as HandleUploadBody;
    if (body.type === "blob.generate-client-token") {
      if (!(await getUserSession(request, uid))) {
        return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
      }
      if (!hasValidSameOrigin(request)) {
        return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
      }
      if (!config.publicUrl.startsWith("https://")) {
        return NextResponse.json(
          { error: "Set PUBLIC_URL to a public HTTPS dashboard URL for media uploads." },
          { status: 503 },
        );
      }
    } else if (body.type !== "blob.upload-completed") {
      return NextResponse.json({ error: "Invalid upload event." }, { status: 400 });
    }
    const result = await handleUpload({
      request,
      body,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const metadata = parseClientPayload(clientPayload);
        const expectedPath = `library/${uid}/${metadata.nodeId}`;
        if (pathname !== expectedPath) throw new Error("INVALID_UPLOAD");
        const existing = await getLibraryNode(uid, metadata.nodeId);
        if (existing) throw new Error("UPLOAD_ALREADY_EXISTS");
        await validateLibraryDestination(uid, metadata.parentId, metadata.name);
        return {
          allowedContentTypes: ["image/*", "video/*"],
          maximumSizeInBytes: LIBRARY_MEDIA_LIMIT,
          validUntil: Date.now() + 60 * 60 * 1000,
          addRandomSuffix: false,
          allowOverwrite: false,
          callbackUrl: `${config.publicUrl}/api/library/${uid}/upload`,
          tokenPayload: JSON.stringify({ uid, ...metadata }),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        if (!tokenPayload) {
          throw new Error("INVALID_UPLOAD");
        }
        const signed = parseSignedPayload(tokenPayload);
        if (signed.uid !== uid) throw new Error("INVALID_UPLOAD");
        if (blob.pathname !== `library/${uid}/${signed.nodeId}`) {
          throw new Error("INVALID_UPLOAD");
        }
        const storedBlob = await head(blob.url);
        if (storedBlob.size > LIBRARY_MEDIA_LIMIT) {
          throw new Error("INVALID_UPLOAD");
        }
        const existing = await getLibraryNode(signed.uid, signed.nodeId);
        if (existing) return;
        await createLibraryNode({
          id: signed.nodeId,
          ownerUid: signed.uid,
          parentId: signed.parentId,
          kind: "media",
          name: signed.name,
          contentType: signed.contentType || blob.contentType,
          storageUrl: blob.url,
          fileSize: storedBlob.size,
        });
      },
    });
    return NextResponse.json(result);
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "INVALID_UPLOAD") {
      return NextResponse.json({ error: "Invalid upload details." }, { status: 400 });
    }
    if (code === "PARENT_NOT_FOUND") {
      return NextResponse.json({ error: "Destination folder not found." }, { status: 404 });
    }
    if (code === "NAME_EXISTS" || code === "UPLOAD_ALREADY_EXISTS") {
      return NextResponse.json(
        { error: "A file or folder with that name already exists." },
        { status: 409 },
      );
    }
    console.error("[library/upload] Blob upload failed:", error);
    return NextResponse.json(
      {
        error: process.env.BLOB_READ_WRITE_TOKEN
          ? "Media upload failed. Please retry."
          : "Media storage is not configured. Set BLOB_READ_WRITE_TOKEN in the dashboard environment.",
      },
      { status: 503 },
    );
  }
}
