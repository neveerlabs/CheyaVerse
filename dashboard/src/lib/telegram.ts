import { config } from "./config";

export type TelegramUserInfo = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
};

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 800;
const FETCH_TIMEOUT_MS = 20000;

async function fetchWithRetry(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response | null> {
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(input, { ...init, signal: controller.signal });
      clearTimeout(timer);
      return res;
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      if (attempt < MAX_RETRIES - 1) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * (attempt + 1)));
      }
    }
  }
  console.error("Telegram fetch failed after retries:", lastErr);
  return null;
}

export async function getTelegramFileUrl(fileId: string): Promise<string | null> {
  if (!config.telegram.botToken) {
    console.error("TELEGRAM_BOT_TOKEN not configured");
    return null;
  }
  try {
    const res = await fetchWithRetry(
      `https://api.telegram.org/bot${config.telegram.botToken}/getFile?file_id=${encodeURIComponent(fileId)}`,
      { cache: "no-store" },
    );
    if (!res || !res.ok) return null;
    const data = await res.json();
    if (!data?.ok || !data?.result?.file_path) return null;
    return `https://api.telegram.org/file/bot${config.telegram.botToken}/${data.result.file_path}`;
  } catch (err) {
    console.error("Telegram getFile error:", err);
    return null;
  }
}

export async function fetchTelegramFile(fileId: string): Promise<Response | null> {
  const url = await getTelegramFileUrl(fileId);
  if (!url) return null;
  try {
    const upstream = await fetchWithRetry(url, { cache: "no-store" });
    if (!upstream || !upstream.ok || !upstream.body) return null;
    return upstream;
  } catch (err) {
    console.error("Telegram fetch file error:", err);
    return null;
  }
}

export async function deleteTelegramMessage(
  messageId: number | string,
): Promise<boolean> {
  if (!config.telegram.botToken) {
    console.error("TELEGRAM_BOT_TOKEN not configured");
    return false;
  }
  if (!config.telegram.storageChatId) {
    console.error("TELEGRAM_STORAGE_CHAT_ID not configured");
    return false;
  }
  try {
    const res = await fetchWithRetry(
      `https://api.telegram.org/bot${config.telegram.botToken}/deleteMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: config.telegram.storageChatId,
          message_id: Number(messageId),
        }),
        cache: "no-store",
      },
    );
    if (!res || !res.ok) return false;
    const data = await res.json();
    return data?.ok === true;
  } catch (err) {
    console.error("Telegram deleteMessage error:", err);
    return false;
  }
}

export async function getTelegramChatInfo(
  userId: string | number,
): Promise<TelegramUserInfo | null> {
  if (!config.telegram.botToken) return null;
  try {
    const res = await fetchWithRetry(
      `https://api.telegram.org/bot${config.telegram.botToken}/getChat?chat_id=${encodeURIComponent(String(userId))}`,
      { cache: "no-store" },
    );
    if (!res || !res.ok) return null;
    const data = await res.json();
    if (!data?.ok || !data?.result) return null;
    const r = data.result;
    return {
      id: Number(r.id),
      first_name: r.first_name ?? undefined,
      last_name: r.last_name ?? undefined,
      username: r.username ?? undefined,
    };
  } catch (err) {
    console.error("Telegram getChat error:", err);
    return null;
  }
}

export async function getTelegramAvatarFileId(
  userId: string | number,
): Promise<string | null> {
  if (!config.telegram.botToken) return null;
  try {
    const res = await fetchWithRetry(
      `https://api.telegram.org/bot${config.telegram.botToken}/getUserProfilePhotos?user_id=${encodeURIComponent(String(userId))}&limit=1`,
      { cache: "no-store" },
    );
    if (!res || !res.ok) return null;
    const data = await res.json();
    if (!data?.ok) return null;
    const photos = data.result?.photos;
    if (!Array.isArray(photos) || photos.length === 0) return null;
    const sizes = photos[0];
    if (!Array.isArray(sizes) || sizes.length === 0) return null;
    const best = sizes[sizes.length - 1];
    return best?.file_id ?? null;
  } catch (err) {
    console.error("Telegram getUserProfilePhotos error:", err);
    return null;
  }
}

export async function uploadPhotoToStorage(
  file: Blob,
  filename: string,
): Promise<{ message_id: number; file_id: string } | null> {
  if (!config.telegram.botToken) {
    console.error("TELEGRAM_BOT_TOKEN not configured");
    return null;
  }
  if (!config.telegram.storageChatId) {
    console.error("TELEGRAM_STORAGE_CHAT_ID not configured");
    return null;
  }
  try {
    const form = new FormData();
    form.append("chat_id", config.telegram.storageChatId);
    form.append("photo", file, filename);
    const res = await fetchWithRetry(
      `https://api.telegram.org/bot${config.telegram.botToken}/sendPhoto`,
      { method: "POST", body: form, cache: "no-store" },
    );
    if (!res || !res.ok) return null;
    const data = await res.json();
    if (!data?.ok) return null;
    const photos = data.result?.photo;
    if (!Array.isArray(photos) || photos.length === 0) return null;
    const best = photos[photos.length - 1];
    if (!best?.file_id) return null;
    return {
      message_id: Number(data.result.message_id),
      file_id: String(best.file_id),
    };
  } catch (err) {
    console.error("Telegram uploadPhoto error:", err);
    return null;
  }
}

export async function sendTelegramMessage(
  chatId: number | string,
  text: string,
  options?: {
    parseMode?: "HTML" | "MarkdownV2" | "Markdown";
    replyMarkup?: unknown;
    disableWebPagePreview?: boolean;
  },
): Promise<boolean> {
  if (!config.telegram.botToken) {
    console.error("TELEGRAM_BOT_TOKEN not configured");
    return false;
  }
  try {
    const payload: Record<string, unknown> = {
      chat_id: chatId,
      text,
      disable_web_page_preview: options?.disableWebPagePreview ?? true,
    };
    if (options?.parseMode) payload.parse_mode = options.parseMode;
    if (options?.replyMarkup) payload.reply_markup = options.replyMarkup;

    const res = await fetchWithRetry(
      `https://api.telegram.org/bot${config.telegram.botToken}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        cache: "no-store",
      },
    );
    if (!res || !res.ok) return false;
    const data = await res.json();
    return data?.ok === true;
  } catch (err) {
    console.error("Telegram sendMessage error:", err);
    return false;
  }
}