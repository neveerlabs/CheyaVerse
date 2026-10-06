import { NextRequest, NextResponse } from "next/server";
import { getUserSession, hasValidSameOrigin } from "@/lib/auth-request";
import {
  createLibraryNode,
  getLibraryNode,
  LIBRARY_MEDIA_LIMIT,
  validateLibraryDestination,
} from "@/lib/library";
import {
  deleteUserMediaObject,
  uploadUserMediaObject,
} from "@/lib/supabase-storage";

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

function parseUploadFields(form: FormData): {
  nodeId: string;
  parentId: string | null;
  name: string;
  file: File;
} | null {
  const nodeId = form.get("nodeId");
  const rawParentId = form.get("parentId");
  const rawName = form.get("name");
  const file = form.get("file");
  const parentId =
    rawParentId === null || rawParentId === ""
      ? null
      : typeof rawParentId === "string" && rawParentId.length <= 64
        ? rawParentId
        : undefined;
  const name = cleanName(rawName);
  if (
    typeof nodeId !== "string" ||
    !UUID_RE.test(nodeId) ||
    parentId === undefined ||
    !name ||
    typeof file === "string" ||
    !file ||
    typeof file.arrayBuffer !== "function" ||
    file.name.length > 180 ||
    file.size > LIBRARY_MEDIA_LIMIT ||
    !file.type ||
    file.type.length > 200 ||
    (!file.type.startsWith("image/") && !file.type.startsWith("video/")) ||
    /[\r\n]/.test(file.type)
  ) {
    return null;
  }
  return { nodeId, parentId, name, file };
}

export async function POST(
  request: NextRequest,
  { params }: { params: { uid: string } },
) {
  const uid = Number(params.uid);
  if (!Number.isSafeInteger(uid) || uid <= 0) {
    return NextResponse.json({ error: "Invalid account." }, { status: 400 });
  }
  if (!(await getUserSession(request, uid))) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!hasValidSameOrigin(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data;")) {
    return NextResponse.json({ error: "Invalid upload details." }, { status: 400 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid upload details." }, { status: 400 });
  }
  const upload = parseUploadFields(form);
  if (!upload) {
    const file = form.get("file");
    if (
      file &&
      typeof file !== "string" &&
      typeof file.size === "number" &&
      file.size > LIBRARY_MEDIA_LIMIT
    ) {
      return NextResponse.json(
        { error: `Media must be ${LIBRARY_MEDIA_LIMIT / (1024 * 1024)} MB or smaller.` },
        { status: 413 },
      );
    }
    return NextResponse.json({ error: "Invalid upload details." }, { status: 400 });
  }

  try {
    if (await getLibraryNode(uid, upload.nodeId)) {
      return NextResponse.json({ error: "A file or folder with that name already exists." }, { status: 409 });
    }
    await validateLibraryDestination(uid, upload.parentId, upload.name);

    const storagePath = await uploadUserMediaObject(
      uid,
      "library",
      upload.file,
      upload.name,
      upload.file.type,
    );

    try {
      const node = await createLibraryNode({
        id: upload.nodeId,
        ownerUid: uid,
        parentId: upload.parentId,
        kind: "media",
        name: upload.name,
        contentType: upload.file.type,
        storageFileId: storagePath,
        storageMessageId: null,
        fileSize: upload.file.size,
      });
      return NextResponse.json({ node }, { status: 201 });
    } catch (error) {
      await deleteUserMediaObject(uid, storagePath).catch((cleanupError) => {
        console.error("[library/upload] Storage object cleanup failed:", cleanupError);
      });
      throw error;
    }
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "PARENT_NOT_FOUND") {
      return NextResponse.json({ error: "Destination folder not found." }, { status: 404 });
    }
    if (code === "NAME_EXISTS" || code === "UPLOAD_ALREADY_EXISTS") {
      return NextResponse.json(
        { error: "A file or folder with that name already exists." },
        { status: 409 },
      );
    }
    console.error("[library/upload] Supabase Storage upload failed:", error);
    return NextResponse.json({ error: "Media upload failed. Please retry." }, { status: 503 });
  }
}
