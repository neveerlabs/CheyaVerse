type CacheEntry = {
  buffer: Buffer;
  contentType: string;
  contentLength: number;
  timestamp: number;
};

const MAX_ENTRIES = 30;
const TTL_MS = 30 * 60 * 1000;

const cache = new Map<string, CacheEntry>();

export function getCachedMedia(id: string): CacheEntry | null {
  const entry = cache.get(id);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > TTL_MS) {
    cache.delete(id);
    return null;
  }
  cache.delete(id);
  cache.set(id, entry);
  return entry;
}

export function setCachedMedia(
  id: string,
  data: { buffer: Buffer; contentType: string; contentLength: number },
): void {
  if (cache.size >= MAX_ENTRIES) {
    const first = cache.keys().next().value;
    if (first) cache.delete(first);
  }
  cache.set(id, { ...data, timestamp: Date.now() });
}

export function invalidateCachedMedia(id: string): void {
  cache.delete(id);
}
