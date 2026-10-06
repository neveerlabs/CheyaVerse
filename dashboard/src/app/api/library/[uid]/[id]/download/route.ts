import { NextRequest, NextResponse } from "next/server";
import { getUserSession } from "@/lib/auth-request";
import { getLibraryNode } from "@/lib/library";
import { fetchUserMediaObject } from "@/lib/supabase-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
    return NextResponse.json({ error: "Media not found." }, { status: 404 });
  }
  const safeName = node.name.replace(/["\\\r\n]/g, "_");
  if (node.storage_file_id) {
    try {
      const upstream = await fetchUserMediaObject(
        uid,
        node.storage_file_id,
        undefined,
        safeName,
      );
      if (!upstream.ok || !upstream.body) {
        return NextResponse.json(
          { error: "Media is temporarily unavailable." },
          { status: 502 },
        );
      }
      return new NextResponse(upstream.body, {
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Length": String(node.file_size),
          "Content-Disposition": `attachment; filename="${safeName}"`,
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    } catch (error) {
      console.error("[library/download] Supabase Storage download failed:", error);
      return NextResponse.json(
        { error: "Media is temporarily unavailable." },
        { status: 502 },
      );
    }
  }
  if (node.content === null) {
    return NextResponse.json({ error: "Media not found." }, { status: 404 });
  }
  const bytes = Buffer.from(node.content, "base64");
  return new NextResponse(bytes, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Length": String(bytes.length),
      "Content-Disposition": `attachment; filename="${safeName}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
