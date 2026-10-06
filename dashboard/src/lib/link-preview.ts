export type LinkPreviewData = {
  url: string;
  title: string | null;
  description: string | null;
  image: string | null;
  video: string | null;
  videoType: string | null;
  siteName: string | null;
  favicon: string | null;
};

const previewCache = new Map<string, LinkPreviewData | null>();
const previewRequests = new Map<string, Promise<LinkPreviewData | null>>();

export function extractFirstUrl(text: string): string | null {
  if (!text) return null;
  return extractSourceLinks(text)[0]?.url ?? null;
}

export function extractSourceLinks(
  text: string,
): Array<{ url: string; label: string }> {
  const sources = new Map<string, { url: string; label: string }>();
  const add = (rawUrl: string, label?: string) => {
    const url = rawUrl.replace(/[.,!?;:)\]}]+$/g, "");
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return;
      const normalized = parsed.toString();
      if (!sources.has(normalized)) {
        sources.set(normalized, {
          url: normalized,
          label: label?.trim().slice(0, 80) || parsed.hostname.replace(/^www\./, ""),
        });
      }
    } catch {
      return;
    }
  };

  for (const match of text.matchAll(/\[([^\]]{1,120})\]\((https?:\/\/[^)\s]+)\)/g)) {
    add(match[2], match[1]);
  }
  for (const match of text.matchAll(/https?:\/\/[^\s<>"'()[\]]+/g)) {
    add(match[0]);
  }
  return Array.from(sources.values()).slice(0, 8);
}

export function stripSourceLinks(text: string): string {
  return text
    .replace(/\[([^\]]{1,120})\]\(https?:\/\/[^)\s]+\)[.,!?;:]?/g, "")
    .replace(/https?:\/\/[^\s<>"'()[\]]+/g, "")
    .replace(/^[ \t]*[-*+][ \t]*$/gm, "")
    .replace(/^[ \t]*\d+\.[ \t]*$/gm, "")
    .replace(/[ \t]+([,.;!?])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/^[ \t]+|[ \t]+$/gm, "");
}

export function getCachedLinkPreview(
  url: string,
): LinkPreviewData | null | undefined {
  return previewCache.get(url);
}

export function loadLinkPreview(
  url: string,
): Promise<LinkPreviewData | null> {
  const cached = previewCache.get(url);
  if (cached !== undefined || previewCache.has(url)) {
    return Promise.resolve(cached ?? null);
  }
  const pending = previewRequests.get(url);
  if (pending) return pending;

  const request = fetch(`/api/link-preview?url=${encodeURIComponent(url)}`, {
    cache: "no-store",
  })
    .then(async (response) => {
      if (!response.ok) return null;
      const json = await response.json();
      if (json?.ok !== true || !json.data || typeof json.data !== "object") {
        return null;
      }
      return json.data as LinkPreviewData;
    })
    .catch(() => null)
    .then((data) => {
      previewCache.set(url, data);
      if (previewCache.size > 150) {
        const oldestUrl = previewCache.keys().next().value;
        if (oldestUrl) previewCache.delete(oldestUrl);
      }
      return data;
    })
    .finally(() => {
      previewRequests.delete(url);
    });
  previewRequests.set(url, request);
  return request;
}