type CacheEntry = {
  buffer: Buffer;
  contentType: string;
  contentLength: number;
  timestamp: number;
};

const MAX_ENTRIES = 30;
const MAX_TOTAL_BYTES = 64 * 1024 * 1024;
const TTL_MS = 30 * 60 * 1000;

const cache = new Map<string, CacheEntry>();
let totalBytes = 0;

export function getCachedMedia(id: string): CacheEntry | null {
  const entry = cache.get(id);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > TTL_MS) {
    cache.delete(id);
    totalBytes -= entry.buffer.length;
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
  const existing = cache.get(id);
  if (existing) {
    cache.delete(id);
    totalBytes -= existing.buffer.length;
  }

  while (
    cache.size >= MAX_ENTRIES ||
    totalBytes + data.buffer.length > MAX_TOTAL_BYTES
  ) {
    const first = cache.keys().next().value;
    if (!first) break;
    const e = cache.get(first);
    if (e) totalBytes -= e.buffer.length;
    cache.delete(first);
  }

  if (data.buffer.length > MAX_TOTAL_BYTES) return;

  cache.set(id, { ...data, timestamp: Date.now() });
  totalBytes += data.buffer.length;
}

export function invalidateCachedMedia(id: string): void {
  const existing = cache.get(id);
  if (existing) totalBytes -= existing.buffer.length;
  cache.delete(id);
}
