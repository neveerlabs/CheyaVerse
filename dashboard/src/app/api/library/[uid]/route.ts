import { NextRequest, NextResponse } from "next/server";
import { getUserSession, hasValidSameOrigin } from "@/lib/auth-request";
import {
  createLibraryNode,
  listLibraryNodes,
} from "@/lib/library";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseUid(value: string): number | null {
  const uid = Number(value);
  return Number.isSafeInteger(uid) && uid > 0 ? uid : null;
}

function parseParentId(value: unknown): string | null | undefined {
  if (value === undefined || value === null || value === "") return null;
  return typeof value === "string" && value.length <= 64 ? value : undefined;
}

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

function errorResponse(error: unknown): NextResponse {
  const code = error instanceof Error ? error.message : "";
  if (code === "PARENT_NOT_FOUND") {
    return NextResponse.json({ error: "Parent folder not found." }, { status: 404 });
  }
  if (code === "NAME_EXISTS") {
    return NextResponse.json({ error: "A file or folder with that name already exists." }, { status: 409 });
  }
  console.error("Library request failed:", error);
  return NextResponse.json({ error: "Library request failed." }, { status: 500 });
}

export async function GET(
  request: NextRequest,
  { params }: { params: { uid: string } },
) {
  const uid = parseUid(params.uid);
  if (uid === null) return NextResponse.json({ error: "Invalid account." }, { status: 400 });
  if (!(await getUserSession(request, uid))) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const parentId = parseParentId(request.nextUrl.searchParams.get("parentId"));
  if (parentId === undefined) {
    return NextResponse.json({ error: "Invalid parent folder." }, { status: 400 });
  }
  try {
    const nodes = await listLibraryNodes(uid, parentId);
    return NextResponse.json({ nodes });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { uid: string } },
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
    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
      return NextResponse.json(
        { error: "Use the direct media upload endpoint for media files." },
        { status: 415 },
      );
    }

    const body = await request.json();
    const parentId = parseParentId(body.parentId);
    const name = cleanName(body.name);
    if (parentId === undefined || !name || (body.kind !== "folder" && body.kind !== "text")) {
      return NextResponse.json({ error: "Invalid library item." }, { status: 400 });
    }
    const content = body.kind === "text" ? body.content ?? "" : null;
    if (content !== null && (typeof content !== "string" || Buffer.byteLength(content) > 1_000_000)) {
      return NextResponse.json({ error: "Text files must be 1 MB or smaller." }, { status: 413 });
    }
    const node = await createLibraryNode({
      ownerUid: uid,
      parentId,
      kind: body.kind,
      name,
      content,
      contentType: body.kind === "text" ? "text/plain; charset=utf-8" : null,
      fileSize: typeof content === "string" ? Buffer.byteLength(content) : 0,
    });
    return NextResponse.json({ node }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
