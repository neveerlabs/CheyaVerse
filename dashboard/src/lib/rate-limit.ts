import { config } from "./config";

type Hits = Map<string, number[]>;
const g = globalThis as unknown as { __cheyaHits?: Hits };
const hits: Hits = g.__cheyaHits ?? (g.__cheyaHits = new Map());

export function isRateLimited(ip: string): boolean {
  const t = Date.now() / 1000;
  const cutoff = t - config.rateLimitWindowSec;
  const arr = (hits.get(ip) ?? []).filter((x) => x >= cutoff);
  if (arr.length >= config.rateLimitMax) {
    hits.set(ip, arr);
    return true;
  }
  arr.push(t);
  hits.set(ip, arr);
  if (hits.size > 5000) {
    for (const [k, v] of hits) {
      if (!v.length || v[v.length - 1] < cutoff) hits.delete(k);
    }
  }
  return false;
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for") ?? "";
  if (fwd) return fwd.split(",")[0].trim() || "unknown";
  const real = req.headers.get("x-real-ip");
  if (real) return real;
  return "unknown";
}