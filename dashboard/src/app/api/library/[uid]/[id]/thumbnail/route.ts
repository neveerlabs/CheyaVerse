import { NextRequest, NextResponse } from "next/server";
import { getUserSession, hasValidSameOrigin } from "@/lib/auth-request";
import { getLibraryNode, setLibraryThumbnailStorage } from "@/lib/library";
import {
  deleteUserMediaObject,
  fetchUserMediaObject,
  isUserMediaPath,
  uploadUserMediaObject,
} from "@/lib/supabase-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_THUMBNAIL_BYTES = 120 * 1024;

export async function GET(
  request: NextRequest,
  { params }: { params: { uid: string; id: string } },
) {
  const uid = Number(params.uid);
  if (!Number.isSafeInteger(uid) || uid <= 0) {
    return NextResponse.json({ error: "Invalid account." }, { status: 400 });
  }
  if (!(await getUserSession(request, uid))) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const node = await getLibraryNode(uid, params.id);
  if (!node || node.kind !== "media") {
    return new NextResponse(null, { status: 404 });
  }
  if (node.thumbnail_file_id) {
    try {
      const upstream = await fetchUserMediaObject(uid, node.thumbnail_file_id);
      if (!upstream.ok || !upstream.body) {
        return NextResponse.json({ error: "Thumbnail is temporarily unavailable." }, { status: 502 });
      }
      return new NextResponse(upstream.body, {
        headers: {
          "Content-Type": "image/jpeg",
          "Cache-Control": "private, max-age=3600",
          "X-Content-Type-Options": "nosniff",
        },
      });
    } catch (error) {
      console.error("[library/thumbnail] Thumbnail fetch failed:", error);
      return NextResponse.json({ error: "Thumbnail is temporarily unavailable." }, { status: 502 });
    }
  }
  if (!node.thumbnail_content) return new NextResponse(null, { status: 404 });
  const bytes = Buffer.from(node.thumbnail_content, "base64");
  return new NextResponse(bytes, {
    headers: {
      "Content-Type": "image/jpeg",
      "Content-Length": String(bytes.length),
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { uid: string; id: string } },
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
  const node = await getLibraryNode(uid, params.id);
  if (!node || node.kind !== "media") {
    return NextResponse.json({ error: "Media not found." }, { status: 404 });
  }
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType !== "image/jpeg") {
    return NextResponse.json({ error: "Thumbnail must be a JPEG image." }, { status: 415 });
  }
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_THUMBNAIL_BYTES) {
    return NextResponse.json({ error: "Thumbnail is too large." }, { status: 413 });
  }
  const bytes = Buffer.from(await request.arrayBuffer());
  if (bytes.length === 0 || bytes.length > MAX_THUMBNAIL_BYTES) {
    return NextResponse.json({ error: "Thumbnail is too large." }, { status: 413 });
  }
  let storagePath: string;
  try {
    storagePath = await uploadUserMediaObject(
      uid,
      "library-thumbnails",
      new Blob([bytes], { type: "image/jpeg" }),
      `${node.id}-thumbnail.jpg`,
      "image/jpeg",
    );
  } catch (error) {
    console.error("[library/thumbnail] Supabase Storage upload failed:", error);
    return NextResponse.json({ error: "Thumbnail could not be saved." }, { status: 503 });
  }
  try {
    const saved = await setLibraryThumbnailStorage(
      uid,
      params.id,
      storagePath,
      null,
    );
    if (!saved) {
      await deleteUserMediaObject(uid, storagePath).catch((error) => {
        console.error("[library/thumbnail] Storage rollback failed:", error);
      });
      return NextResponse.json({ error: "Thumbnail could not be saved." }, { status: 500 });
    }
    if (node.thumbnail_file_id && isUserMediaPath(uid, node.thumbnail_file_id)) {
      await deleteUserMediaObject(uid, node.thumbnail_file_id).catch((error) => {
        console.error("[library/thumbnail] Previous thumbnail cleanup failed:", error);
      });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    await deleteUserMediaObject(uid, storagePath).catch((cleanupError) => {
      console.error("[library/thumbnail] Storage object cleanup failed:", cleanupError);
    });
    console.error("[library/thumbnail] Could not save thumbnail metadata:", error);
    return NextResponse.json({ error: "Thumbnail could not be saved." }, { status: 500 });
  }
}
