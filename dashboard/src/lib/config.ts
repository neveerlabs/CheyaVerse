export const config = {
  turso: {
    url: process.env.TURSO_URL ?? "",
    authToken: process.env.TURSO_AUTH_TOKEN ?? "",
  },
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN ?? "",
    storageChatId: process.env.TELEGRAM_STORAGE_CHAT_ID ?? "",
  },
  botUsername: (process.env.BOT_USERNAME ?? "").replace(/^@/, ""),
  publicUrl: (process.env.PUBLIC_URL ?? "").replace(/\/+$/, ""),
  mediaTtlDays: Number(process.env.MEDIA_TTL_DAYS ?? 30),
  recaptchaSiteKey: process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY ?? "",
  recaptchaSecretKey: process.env.RECAPTCHA_SECRET_KEY ?? "",
} as const;