import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SIZE = 256;

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function getOrigin(req: NextRequest): string {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") ?? "http";
  if (host) return `${proto}://${host}`;
  return req.nextUrl.origin;
}

async function fetchImage(
  url: string,
): Promise<{ buf: Buffer; contentType: string } | null> {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    const arrayBuf = await res.arrayBuffer();
    const contentType = res.headers.get("content-type") || "image/png";
    return { buf: Buffer.from(arrayBuf), contentType };
  } catch {
    return null;
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: { uid: string } },
) {
  const id = params.uid;
  if (!id) {
    return new Response("Invalid id", { status: 400 });
  }

  const origin = getOrigin(req);
  let sourceUrl: string;

  if (id === "system" || id === "bot") {
    sourceUrl = `${origin}/icon.png`;
  } else {
    const uid = Number(id);
    if (!Number.isInteger(uid) || uid <= 0) {
      return new Response("Invalid id", { status: 400 });
    }
    sourceUrl = `${origin}/api/user/${uid}/avatar`;
  }

  const img = await fetchImage(sourceUrl);
  if (!img) {
    return new Response("Not found", { status: 404 });
  }

  const b64 = img.buf.toString("base64");
  const href = `data:${escapeXml(img.contentType)};base64,${b64}`;

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <defs>
    <clipPath id="clip">
      <circle cx="${SIZE / 2}" cy="${SIZE / 2}" r="${SIZE / 2}" />
    </clipPath>
  </defs>
  <g clip-path="url(#clip)">
    <image href="${href}" x="0" y="0" width="${SIZE}" height="${SIZE}" preserveAspectRatio="xMidYMid slice" />
  </g>
</svg>`;

  return new Response(svg, {
    status: 200,
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=300",
    },
  });
}
