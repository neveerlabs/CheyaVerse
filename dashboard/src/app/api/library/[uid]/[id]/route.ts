import { NextRequest, NextResponse } from "next/server";
import { getUserSession, hasValidSameOrigin } from "@/lib/auth-request";
import {
  deleteLibraryNode,
  getLibraryNode,
  LIBRARY_MEDIA_LIMIT,
  updateLibraryNode,
} from "@/lib/library";
import { deleteUserMediaObject, isUserMediaPath } from "@/lib/supabase-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseUid(value: string): number | null {
  const uid = Number(value);
  return Number.isSafeInteger(uid) && uid > 0 ? uid : null;
}

function cleanName(value: unknown): string | undefined | null {
  if (value === undefined) return undefined;
  if (typeof value !== "string") return null;
  const name = value.trim();
  if (!name || name.length > 180 || name === "." || name === ".." || /[\\/\u0000-\u001f]/.test(name)) {
    return null;
  }
  return name;
}

function parseParentId(value: unknown): string | null | undefined {
  if (value === null || value === "") return null;
  return typeof value === "string" && value.length <= 64 ? value : undefined;
}

export async function GET(
  request: NextRequest,
  { params }: { params: { uid: string; id: string } },
) {
  const uid = parseUid(params.uid);
  if (uid === null) return NextResponse.json({ error: "Invalid account." }, { status: 400 });
  if (!(await getUserSession(request, uid))) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const node = await getLibraryNode(uid, params.id);
  if (!node) return NextResponse.json({ error: "Item not found." }, { status: 404 });
  if (node.kind === "media") {
    return NextResponse.json({ error: "Media content is not available as text." }, { status: 415 });
  }
  return NextResponse.json({ node });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { uid: string; id: string } },
) {
  const uid = parseUid(params.uid);
  if (uid === null) return NextResponse.json({ error: "Invalid account." }, { status: 400 });
  if (!(await getUserSession(request, uid))) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!hasValidSameOrigin(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }
  try {
    const body = await request.json();
    const name = cleanName(body.name);
    const parentId = Object.hasOwn(body, "parentId")
      ? parseParentId(body.parentId)
      : undefined;
    if (name === null) return NextResponse.json({ error: "Invalid name." }, { status: 400 });
    if (parentId === undefined && Object.hasOwn(body, "parentId")) {
      return NextResponse.json({ error: "Invalid destination folder." }, { status: 400 });
    }
    if (body.content !== undefined && typeof body.content !== "string") {
      return NextResponse.json({ error: "Invalid text content." }, { status: 400 });
    }
    if (typeof body.content === "string" && Buffer.byteLength(body.content) > 1_000_000) {
      return NextResponse.json({ error: "Text files must be 1 MB or smaller." }, { status: 413 });
    }
    const current = await getLibraryNode(uid, params.id);
    if (!current) return NextResponse.json({ error: "Item not found." }, { status: 404 });
    if (current.kind === "media" && body.content !== undefined) {
      return NextResponse.json({ error: "Media content cannot be edited as text." }, { status: 415 });
    }
    const node = await updateLibraryNode(uid, params.id, {
      ...(name === undefined ? {} : { name }),
      ...(body.content === undefined ? {} : { content: body.content }),
      ...(parentId === undefined ? {} : { parentId }),
    });
    return NextResponse.json({ node });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "NAME_EXISTS") {
      return NextResponse.json({ error: "A file or folder with that name already exists." }, { status: 409 });
    }
    if (code === "PARENT_NOT_FOUND") {
      return NextResponse.json({ error: "Destination folder not found." }, { status: 404 });
    }
    if (code === "INVALID_MOVE") {
      return NextResponse.json({ error: "A folder cannot be moved inside itself." }, { status: 400 });
    }
    console.error("Library update failed:", error);
    return NextResponse.json({ error: "Library update failed." }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { uid: string; id: string } },
) {
  const uid = parseUid(params.uid);
  if (uid === null) return NextResponse.json({ error: "Invalid account." }, { status: 400 });
  if (!(await getUserSession(request, uid))) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!hasValidSameOrigin(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }
  const deleted = await deleteLibraryNode(uid, params.id);
  if (!deleted.deleted) {
    return NextResponse.json({ error: "Item not found." }, { status: 404 });
  }
  const storagePaths = deleted.storagePaths.filter((path) => isUserMediaPath(uid, path));
  const invalidStoragePathCount = deleted.storagePaths.length - storagePaths.length;
  const storageCleanup = await Promise.allSettled(
    storagePaths.map((path) => deleteUserMediaObject(uid, path)),
  );
  const storageCleanupFailed =
    invalidStoragePathCount +
    storageCleanup.filter((result) => result.status === "rejected").length;
  if (storageCleanupFailed) {
    console.error(
      `[library/delete] ${storageCleanupFailed} Supabase Storage object(s) could not be deleted for account ${uid}.`,
    );
  }
  return NextResponse.json({
    ok: true,
    storageCleanupFailed,
    telegramStorageCleanupFailed: storageCleanupFailed,
  });
}

export async function HEAD(
  request: NextRequest,
  context: { params: { uid: string; id: string } },
) {
  const uid = parseUid(context.params.uid);
  if (uid === null || !(await getUserSession(request, uid))) {
    return new NextResponse(null, { status: 401 });
  }
  const node = await getLibraryNode(uid, context.params.id);
  if (!node) return new NextResponse(null, { status: 404 });
  if (node.kind !== "media" || node.file_size > LIBRARY_MEDIA_LIMIT) {
    return new NextResponse(null, { status: 415 });
  }
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Content-Type": node.content_type ?? "application/octet-stream",
      "Content-Length": String(node.file_size),
    },
  });
}
