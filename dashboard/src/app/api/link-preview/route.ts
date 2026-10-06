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

function matchMeta(html: string, names: string[]): string | null {
  const expectedAttributes = new Set(names.map((name) => name.toLowerCase()));
  for (const tag of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attributes = new Map<string, string>();
    for (const attribute of tag[0].matchAll(
      /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g,
    )) {
      attributes.set(
        attribute[1].toLowerCase(),
        decodeEntities(attribute[2] ?? attribute[3] ?? attribute[4] ?? ""),
      );
    }
    const key = (
      attributes.get("property") ??
      attributes.get("name") ??
      ""
    ).toLowerCase();
    if (!expectedAttributes.has(key)) continue;
    const value = attributes.get("content")?.trim();
    if (value) return value;
  }

  return null;
}

function matchTagText(html: string, pattern: RegExp): string | null {
  const match = html.match(pattern);
  return match?.[1] ? decodeEntities(match[1].trim()) : null;
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

    const title =
      matchMeta(html, ["og:title", "twitter:title"]) ??
      matchTagText(html, /<title[^>]*>([^<]+)<\/title>/i);
    const description = matchMeta(html, [
      "og:description",
      "twitter:description",
      "description",
    ]);
    const image = matchMeta(html, [
      "og:image:secure_url",
      "og:image",
      "twitter:image",
      "twitter:image:src",
    ]);
    const video = matchMeta(html, [
      "og:video:secure_url",
      "og:video:url",
      "og:video",
      "twitter:player:stream",
    ]);
    const videoType = matchMeta(html, [
      "og:video:type",
      "twitter:player:stream:content_type",
    ]);
    const siteName = matchMeta(html, ["og:site_name"]);

    let favicon: string | null = null;
    for (const tag of html.matchAll(/<link\b[^>]*>/gi)) {
      const attributes = new Map<string, string>();
      for (const attribute of tag[0].matchAll(
        /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g,
      )) {
        attributes.set(
          attribute[1].toLowerCase(),
          decodeEntities(attribute[2] ?? attribute[3] ?? attribute[4] ?? ""),
        );
      }
      const rel = attributes.get("rel")?.toLowerCase() ?? "";
      const href = attributes.get("href");
      if (href && /(?:^|\s)(?:icon|shortcut icon|apple-touch-icon)(?:\s|$)/.test(rel)) {
        favicon = href;
        break;
      }
    }

    const parsed = new URL(url);
    let absoluteFavicon: string | null = null;
    try {
      absoluteFavicon = favicon
        ? new URL(favicon, parsed.origin).toString()
        : `${parsed.origin}/favicon.ico`;
    } catch {
      absoluteFavicon = null;
    }

    let absoluteImage: string | null = null;
    try {
      if (image) {
        const candidate = new URL(image, url);
        if (
          (candidate.protocol === "https:" || candidate.protocol === "http:") &&
          !candidate.username &&
          !candidate.password &&
          !isPrivateHost(candidate.hostname)
        ) {
          absoluteImage = candidate.toString();
        }
      }
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
      favicon: absoluteFavicon,
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