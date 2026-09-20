export const config = {
  supabase: {
    url: process.env.SUPABASE_URL ?? "",
    key: process.env.SUPABASE_KEY ?? "",
    bucket: process.env.SUPABASE_BUCKET ?? "cheyaverse-media",
    table: process.env.SUPABASE_TABLE ?? "media",
  },
  botUsername: (process.env.BOT_USERNAME ?? "").replace(/^@/, ""),
  publicUrl: (process.env.PUBLIC_URL ?? "").replace(/\/+$/, ""),
  mediaTtlDays: Number(process.env.MEDIA_TTL_DAYS ?? 30),
  signedUrlTtl: Number(process.env.SIGNED_URL_TTL ?? 2592000),
  maxProxyBytes: Number(process.env.MAX_PROXY_BYTES ?? 50 * 1024 * 1024),
  captchaTtlSec: 900,
  rateLimitWindowSec: 60,
  rateLimitMax: 30,
} as const;