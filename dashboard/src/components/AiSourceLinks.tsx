"use client";

import { useEffect, useState } from "react";
import { ExternalLink, Globe2 } from "lucide-react";
import {
  extractSourceLinks,
  getCachedLinkPreview,
  loadLinkPreview,
  type LinkPreviewData,
} from "@/lib/link-preview";

function SourcePill({ url, label }: { url: string; label: string }) {
  const [preview, setPreview] = useState<LinkPreviewData | null | undefined>(
    () => getCachedLinkPreview(url),
  );
  const [faviconFailed, setFaviconFailed] = useState(false);

  useEffect(() => {
    let active = true;
    void loadLinkPreview(url).then((data) => {
      if (active) setPreview(data);
    });
    return () => {
      active = false;
    };
  }, [url]);

  let host = label;
  try {
    host = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    // URLs are normalized before they reach this component.
  }
  const favicon = preview?.favicon;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(event) => event.stopPropagation()}
      className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-black/[.08] bg-white/85 py-1 pl-1 pr-2.5 text-[11px] font-medium text-ink shadow-[0_1px_3px_rgba(0,0,0,.07)] transition-colors hover:bg-white active:bg-black/[.04]"
      title={url}
    >
      <span className="flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#f0f1f3]">
        {favicon && !faviconFailed ? (
          <img
            src={favicon}
            alt=""
            loading="lazy"
            decoding="async"
            onError={() => setFaviconFailed(true)}
            className="h-3.5 w-3.5 object-contain"
          />
        ) : (
          <Globe2 size={12} className="text-ink-mute" />
        )}
      </span>
      <span className="truncate">{label || host}</span>
      <ExternalLink size={11} className="shrink-0 text-ink-mute" />
    </a>
  );
}

export function AiSourceLinks({ content }: { content: string }) {
  const sources = extractSourceLinks(content);
  if (sources.length === 0) return null;

  return (
    <div
      aria-label="AI source links"
      className="mt-2 flex flex-wrap gap-1.5"
    >
      {sources.map((source) => (
        <SourcePill
          key={source.url}
          url={source.url}
          label={source.label}
        />
      ))}
    </div>
  );
}
