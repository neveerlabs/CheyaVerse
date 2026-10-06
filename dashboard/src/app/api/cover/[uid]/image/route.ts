import { NextRequest, NextResponse } from "next/server";
import { getCover } from "@/lib/storage";
import { getUserSession } from "@/lib/auth-request";
import { fetchUserMediaObject } from "@/lib/supabase-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(
  req: NextRequest,
  { params }: { params: { uid: string } },
) {
  const uid = Number(params.uid);
  if (!Number.isInteger(uid) || uid <= 0) {
    return new NextResponse("Invalid uid", {
      status: 400,
      headers: { "Cache-Control": "no-store" },
    });
  }
  if (!(await getUserSession(req))) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const cover = await getCover(uid);
  if (!cover || (cover.type !== "upload" && cover.type !== "telegram")) {
    return new NextResponse("No cover image", {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  }
  if (!cover.storage_path) {
    return new NextResponse("No cover image", {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const upstream = await fetchUserMediaObject(uid, cover.storage_path).catch((error) => {
    console.error(`[cover/image] Supabase Storage fetch failed for account ${uid}:`, error);
    return null;
  });
  if (!upstream?.ok || !upstream.body) {
    return new NextResponse("Cover unavailable", {
      status: 502,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const headers = new Headers();
  headers.set(
    "Content-Type",
    cover.content_type || upstream.headers.get("Content-Type") || "image/jpeg",
  );
  headers.set("Cache-Control", "private, max-age=86400, stale-while-revalidate=604800");

  return new NextResponse(upstream.body, { status: 200, headers });
}