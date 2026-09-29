import { NextRequest, NextResponse } from "next/server";
import { getUserSession, hasValidSameOrigin } from "@/lib/auth-request";
import { getLibraryNode, setLibraryThumbnail } from "@/lib/library";

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
  if (!node?.thumbnail_content || node.kind !== "media") {
    return new NextResponse(null, { status: 404 });
  }
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
  const saved = await setLibraryThumbnail(uid, params.id, bytes.toString("base64"));
  return saved
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ error: "Thumbnail could not be saved." }, { status: 500 });
}
