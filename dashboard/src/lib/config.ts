export const config = {
  adminTelegramIds: new Set(
    (process.env.ADMIN_TELEGRAM_IDS ?? "")
      .split(",")
      .map((id) => Number(id.trim()))
      .filter((id) => Number.isSafeInteger(id) && id > 0),
  ),
  supabase: {
    databaseUrl: process.env.SUPABASE_DB_URL ?? "",
    url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
    jwtSecret: process.env.SUPABASE_JWT_SECRET ?? "",
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  },
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN ?? "",
    storageChatId: process.env.TELEGRAM_STORAGE_CHAT_ID ?? "",
    apiBaseUrl: process.env.TELEGRAM_BOT_API_URL ?? "https://api.telegram.org",
  },
  botUsername: (process.env.BOT_USERNAME ?? "").replace(/^@/, ""),
  broadcastWebSecret: process.env.BROADCAST_WEB_SECRET ?? "",
  telegramGroupAiSecret: process.env.TELEGRAM_GROUP_AI_SECRET ?? "",
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
