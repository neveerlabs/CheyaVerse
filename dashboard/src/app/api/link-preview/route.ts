import { NextRequest, NextResponse } from "next/server";
import { getUserSession } from "@/lib/auth-request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type OgData = {
  url: string;
  title: string | null;
  description: string | null;
  image: string | null;
  video: string | null;
  videoType: string | null;
  siteName: string | null;
  favicon: string | null;
};

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/")
    .replace(/&nbsp;/g, " ");
}

function matchMeta(html: string, patterns: RegExp[]): string | null {
  for (const re of patterns) {
    const m = html.match(re);
    if (m && m[1]) return decodeEntities(m[1].trim());
  }
  return null;
}

function isPrivateHost(host: string): boolean {
  const h = host.toLowerCase();
  if (!h) return true;
  if (h === "localhost" || h === "0.0.0.0" || h === "::1") return true;
  if (h.endsWith(".local") || h.endsWith(".internal")) return true;
  if (/^127\./.test(h)) return true;
  if (/^10\./.test(h)) return true;
  if (/^192\.168\./.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  if (/^169\.254\./.test(h)) return true;
  if (h.startsWith("[")) return true;
  return false;
}

async function fetchOg(url: string): Promise<OgData | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; CheyaVerseBot/1.0; +https://t.me)",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.8",
      },
      cache: "no-store",
      redirect: "follow",
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html")) return null;

    let html = "";
    const reader = res.body?.getReader();
    if (reader) {
      const decoder = new TextDecoder();
      let total = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        html += decoder.decode(value, { stream: true });
        if (total > 250_000) break;
      }
      try {
        reader.cancel();
      } catch {}
    } else {
      html = await res.text();
    }

    const title = matchMeta(html, [
      /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+name=["']twitter:title["'][^>]+content=["']([^"']+)["']/i,
      /<title[^>]*>([^<]+)<\/title>/i,
    ]);
    const description = matchMeta(html, [
      /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+name=["']twitter:description["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i,
    ]);
    const image = matchMeta(html, [
      /<meta[^>]+property=["']og:image:secure_url["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+name=["']twitter:image:src["'][^>]+content=["']([^"']+)["']/i,
    ]);
    const video = matchMeta(html, [
      /<meta[^>]+property=["']og:video:secure_url["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+property=["']og:video:url["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+property=["']og:video["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+name=["']twitter:player:stream["'][^>]+content=["']([^"']+)["']/i,
    ]);
    const videoType = matchMeta(html, [
      /<meta[^>]+property=["']og:video:type["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+name=["']twitter:player:stream:content_type["'][^>]+content=["']([^"']+)["']/i,
    ]);
    const siteName = matchMeta(html, [
      /<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i,
    ]);

    const faviconMatch = html.match(
      /<link[^>]+rel=["'](?:icon|shortcut icon|apple-touch-icon)["'][^>]+href=["']([^"']+)["']/i,
    );
    let favicon: string | null = faviconMatch ? faviconMatch[1].trim() : null;

    try {
      const parsed = new URL(url);
      favicon = favicon
        ? new URL(favicon, parsed.origin).toString()
        : `${parsed.origin}/favicon.ico`;
    } catch {
      favicon = null;
    }

    let absoluteImage: string | null = image;
    try {
      if (image) absoluteImage = new URL(image, url).toString();
    } catch {
      absoluteImage = null;
    }

    let absoluteVideo: string | null = video;
    try {
      if (video) absoluteVideo = new URL(video, url).toString();
    } catch {
      absoluteVideo = null;
    }

    if (absoluteVideo && /youtube\.com\/embed\//i.test(absoluteVideo)) {
      const thumb = absoluteVideo.match(/\/embed\/([A-Za-z0-9_-]{6,})/);
      if (thumb && !absoluteImage) {
        absoluteImage = `https://i.ytimg.com/vi/${thumb[1]}/hqdefault.jpg`;
      }
    }

    return {
      url,
      title,
      description,
      image: absoluteImage,
      video: absoluteVideo,
      videoType,
      siteName,
      favicon,
    };
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const session = await getUserSession(request);
  if (!session) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401 },
    );
  }
  const rawUrl = request.nextUrl.searchParams.get("url") ?? "";
  const url = rawUrl.trim();
  if (!url || url.length > 2048 || !/^https?:\/\//i.test(url)) {
    return NextResponse.json(
      { ok: false, error: "invalid_url" },
      { status: 400 },
    );
  }
  try {
    const parsed = new URL(url);
    if (isPrivateHost(parsed.hostname)) {
      return NextResponse.json(
        { ok: false, error: "invalid_url" },
        { status: 400 },
      );
    }
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_url" },
      { status: 400 },
    );
  }

  const data = await fetchOg(url);
  if (!data) {
    return NextResponse.json(
      { ok: false, error: "preview_unavailable" },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
  return NextResponse.json(
    { ok: true, data },
    { headers: { "Cache-Control": "no-store" } },
  );
}