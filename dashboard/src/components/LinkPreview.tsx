"use client";

import { useEffect, useState } from "react";
import { ExternalLink, Link2, Play } from "lucide-react";

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

const cache = new Map<string, OgData | null>();

function hostFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function isDirectVideo(videoType: string | null, videoUrl: string | null): boolean {
  if (!videoUrl) return false;
  if (videoType && /^video\//i.test(videoType)) return true;
  return /\.(mp4|webm|mov|m4v|ogv)(\?|$)/i.test(videoUrl);
}

const clamp2: React.CSSProperties = {
  display: "-webkit-box",
  WebkitLineClamp: 2,
  WebkitBoxOrient: "vertical",
  overflow: "hidden",
  wordBreak: "break-word",
};

export function LinkPreview({
  url,
  tone = "incoming",
}: {
  url: string;
  tone?: "incoming" | "outgoing";
}) {
  const [data, setData] = useState<OgData | null | undefined>(() => {
    if (cache.has(url)) return cache.get(url) ?? null;
    return undefined;
  });
  const [imageFailed, setImageFailed] = useState(false);
  const [faviconFailed, setFaviconFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
    setFaviconFailed(false);
    if (cache.has(url)) {
      setData(cache.get(url) ?? null);
      return;
    }
    let cancelled = false;
    setData(undefined);
    fetch(`/api/link-preview?url=${encodeURIComponent(url)}`, {
      cache: "no-store",
    })
      .then((res) => res.json())
      .then((json) => {
        if (cancelled) return;
        if (json?.ok === true && json.data) {
          cache.set(url, json.data);
          setData(json.data);
        } else {
          cache.set(url, null);
          setData(null);
        }
      })
      .catch(() => {
        if (cancelled) return;
        cache.set(url, null);
        setData(null);
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (data === undefined) {
    return (
      <span
        aria-hidden
        className={`my-1 block h-16 animate-pulse rounded-lg border-l-[3px] ${
          tone === "outgoing"
            ? "border-white/50 bg-white/[.10]"
            : "border-ink/40 bg-black/[.04]"
        }`}
      />
    );
  }

  if (data === null) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(event) => event.stopPropagation()}
        className={`my-1 flex items-center gap-2 overflow-hidden rounded-lg border-l-[3px] px-2 py-1.5 text-[12px] transition-colors ${
          tone === "outgoing"
            ? "border-white/50 bg-white/[.12] text-white/90 active:bg-white/[.22]"
            : "border-ink/40 bg-black/[.04] text-ink-soft active:bg-black/[.09]"
        }`}
      >
        <Link2 size={13} className="flex-shrink-0 opacity-70" />
        <span className="truncate font-medium">{hostFromUrl(url)}</span>
        <ExternalLink size={12} className="ml-auto flex-shrink-0 opacity-60" />
      </a>
    );
  }

  const showImage = Boolean(data.image) && !imageFailed;
  const showVideoOverlay = Boolean(data.video);
  const directVideo = isDirectVideo(data.videoType, data.video);
  const siteLabel = data.siteName || hostFromUrl(data.url);

  return (
    <a
      href={data.url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(event) => event.stopPropagation()}
      className={`group my-1 block w-full max-w-full overflow-hidden rounded-lg border-l-[3px] transition-colors ${
        tone === "outgoing"
          ? "border-white/50 bg-white/[.12] active:bg-white/[.22]"
          : "border-ink/40 bg-black/[.04] active:bg-black/[.09]"
      }`}
    >
      {directVideo && data.video && (
        <span className="relative block w-full overflow-hidden bg-black/5">
          <span className="block w-full" style={{ aspectRatio: "1.91 / 1" }} />
          <video
            src={data.video}
            poster={data.image ?? undefined}
            controls
            playsInline
            preload="metadata"
            onClick={(event) => event.stopPropagation()}
            className="absolute inset-0 h-full w-full object-cover"
          />
        </span>
      )}
      {!directVideo && showImage && (
        <span className="relative block w-full overflow-hidden bg-black/5">
          <span className="block w-full" style={{ aspectRatio: "1.91 / 1" }} />
          <img
            src={data.image as string}
            alt=""
            loading="lazy"
            decoding="async"
            onError={() => setImageFailed(true)}
            className="absolute inset-0 h-full w-full object-cover"
          />
          {showVideoOverlay && (
            <>
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0 bg-black/20"
              />
              <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white/95 shadow-[0_4px_14px_rgba(0,0,0,.35)] transition-transform group-active:scale-95">
                  <Play
                    size={18}
                    strokeWidth={0}
                    className="ml-0.5 fill-ink"
                  />
                </span>
              </span>
            </>
          )}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-black/35 to-transparent"
          />
        </span>
      )}
      <span className="flex flex-col gap-1 px-2.5 py-2">
        <span
          className={`flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[.06em] ${
            tone === "outgoing" ? "text-white/65" : "text-ink-mute"
          }`}
        >
          {data.favicon && !faviconFailed && (
            <img
              src={data.favicon}
              alt=""
              className="h-3 w-3 flex-shrink-0 rounded-sm object-contain"
              onError={() => setFaviconFailed(true)}
            />
          )}
          <span className="truncate">{siteLabel}</span>
        </span>
        {data.title && (
          <span
            className={`block text-[13px] font-semibold leading-snug ${
              tone === "outgoing" ? "text-white" : "text-ink"
            }`}
            style={clamp2}
          >
            {data.title}
          </span>
        )}
        {data.description && (
          <span
            className={`block text-[11.5px] leading-snug ${
              tone === "outgoing" ? "text-white/75" : "text-ink-soft"
            }`}
            style={clamp2}
          >
            {data.description}
          </span>
        )}
      </span>
    </a>
  );
}