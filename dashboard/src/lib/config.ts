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
  vapid: {
    publicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "",
    privateKey: process.env.VAPID_PRIVATE_KEY ?? "",
    subject: process.env.VAPID_SUBJECT ?? "mailto:userlinuxorg@gmail.com",
  },
} as const;
