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
const FILE_URL_TTL_MS = 45 * 60 * 1000;
const fileUrlCache = new Map<string, { url: string; expiresAt: number }>();
const pendingFileUrlLookups = new Map<string, Promise<string | null>>();

type FetchRetryOptions = {
  maxAttempts?: number;
  timeoutMs?: number;
};

async function fetchWithRetry(
  input: RequestInfo | URL,
  init?: RequestInit,
  options: FetchRetryOptions = {},
): Promise<Response | null> {
  const maxAttempts = options.maxAttempts ?? MAX_RETRIES;
  const timeoutMs = options.timeoutMs ?? FETCH_TIMEOUT_MS;
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(input, { ...init, signal: controller.signal });
      clearTimeout(timer);
      return res;
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      if (attempt < maxAttempts - 1) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * (attempt + 1)));
      }
    }
  }
  console.error("Telegram fetch failed after retries:", lastErr);
  return null;
}

const FAST_LOOKUP_OPTIONS: FetchRetryOptions = {
  maxAttempts: 1,
  timeoutMs: 8_000,
};

export async function getTelegramFileUrl(fileId: string): Promise<string | null> {
  if (!config.telegram.botToken) {
    console.error("TELEGRAM_BOT_TOKEN not configured");
    return null;
  }
  const cached = fileUrlCache.get(fileId);
  if (cached && cached.expiresAt > Date.now()) return cached.url;
  const pending = pendingFileUrlLookups.get(fileId);
  if (pending) return pending;

  const lookup = (async (): Promise<string | null> => {
    try {
    const res = await fetchWithRetry(
      `https://api.telegram.org/bot${config.telegram.botToken}/getFile?file_id=${encodeURIComponent(fileId)}`,
      { cache: "no-store" },
      FAST_LOOKUP_OPTIONS,
    );
    if (!res || !res.ok) return null;
    const data = await res.json();
    if (!data?.ok || !data?.result?.file_path) return null;
      const url = `https://api.telegram.org/file/bot${config.telegram.botToken}/${data.result.file_path}`;
      fileUrlCache.set(fileId, { url, expiresAt: Date.now() + FILE_URL_TTL_MS });
      if (fileUrlCache.size > 500) {
        const oldestKey = fileUrlCache.keys().next().value;
        if (oldestKey) fileUrlCache.delete(oldestKey);
      }
      return url;
    } catch (err) {
      console.error("Telegram getFile error:", err);
      return null;
    }
  })();
  pendingFileUrlLookups.set(fileId, lookup);
  try {
    return await lookup;
  } finally {
    if (pendingFileUrlLookups.get(fileId) === lookup) {
      pendingFileUrlLookups.delete(fileId);
    }
  }
}

export async function fetchTelegramFile(
  fileId: string,
  init?: RequestInit,
): Promise<Response | null> {
  const url = await getTelegramFileUrl(fileId);
  if (!url) return null;
  try {
    const upstream = await fetchWithRetry(
      url,
      { ...init, cache: "no-store" },
      FAST_LOOKUP_OPTIONS,
    );
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
      FAST_LOOKUP_OPTIONS,
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

export async function uploadAudioToStorage(
  file: Blob,
  filename: string,
): Promise<{ message_id: number; file_id: string } | null> {
  if (!config.telegram.botToken || !config.telegram.storageChatId) {
    console.error("Telegram bot token or storage chat is not configured");
    return null;
  }
  try {
    const form = new FormData();
    form.append("chat_id", config.telegram.storageChatId);
    form.append("document", file, filename);
    const response = await fetchWithRetry(
      `https://api.telegram.org/bot${config.telegram.botToken}/sendDocument`,
      { method: "POST", body: form, cache: "no-store" },
    );
    if (!response) {
      console.error("Telegram audio upload did not receive a response");
      return null;
    }
    const data = await response.json();
    if (!response.ok) {
      console.error(
        `Telegram audio upload failed (${response.status}): ${data?.description ?? "unknown Telegram API error"}`,
      );
      return null;
    }
    const document = data?.result?.document;
    if (data?.ok !== true || typeof document?.file_id !== "string") {
      console.error("Telegram audio upload response did not contain a document file_id");
      return null;
    }
    return {
      message_id: Number(data.result.message_id),
      file_id: document.file_id,
    };
  } catch (error) {
    console.error("Telegram audio upload error:", error);
    return null;
  }
}

export async function uploadDocumentToStorage(
  file: Blob,
  filename: string,
): Promise<{ message_id: number; file_id: string } | null> {
  if (!config.telegram.botToken || !config.telegram.storageChatId) {
    console.error("Telegram bot token or storage chat is not configured");
    return null;
  }
  try {
    const form = new FormData();
    form.append("chat_id", config.telegram.storageChatId);
    form.append("document", file, filename);
    const response = await fetchWithRetry(
      `https://api.telegram.org/bot${config.telegram.botToken}/sendDocument`,
      { method: "POST", body: form, cache: "no-store" },
    );
    if (!response) {
      console.error("Telegram document upload did not receive a response");
      return null;
    }
    const data = await response.json();
    const document = data?.result?.document;
    const messageId = Number(data?.result?.message_id);
    if (
      !response.ok ||
      data?.ok !== true ||
      typeof document?.file_id !== "string" ||
      !Number.isSafeInteger(messageId) ||
      messageId <= 0
    ) {
      console.error(
        `Telegram document upload failed (${response.status}): ${data?.description ?? "invalid Telegram API response"}`,
      );
      return null;
    }
    return { message_id: messageId, file_id: document.file_id };
  } catch (error) {
    console.error("Telegram document upload error:", error);
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
    retry?: FetchRetryOptions;
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
      options?.retry,
    );
    if (!res || !res.ok) return false;
    const data = await res.json();
    return data?.ok === true;
  } catch (err) {
    console.error("Telegram sendMessage error:", err);
    return false;
  }
}

export async function sendTelegramPhoto(
  chatId: number | string,
  photo: Blob,
  caption: string,
  retry?: FetchRetryOptions,
  parseMode?: "HTML",
): Promise<boolean> {
  if (!config.telegram.botToken) {
    console.error("TELEGRAM_BOT_TOKEN not configured");
    return false;
  }
  try {
    const form = new FormData();
    form.set("chat_id", String(chatId));
    form.set("caption", caption);
    if (parseMode) form.set("parse_mode", parseMode);
    form.set("photo", photo, photo.type === "image/png" ? "bug-report.png" : "bug-report.jpg");
    const response = await fetchWithRetry(
      `https://api.telegram.org/bot${config.telegram.botToken}/sendPhoto`,
      { method: "POST", body: form, cache: "no-store" },
      retry,
    );
    if (!response?.ok) return false;
    const result = await response.json();
    return result?.ok === true;
  } catch (error) {
    console.error("Telegram sendPhoto error:", error);
    return false;
  }
}

export async function sendTelegramMediaGroup(
  chatId: number | string,
  media: Array<{ blob: Blob; filename: string }>,
  caption: string,
  retry?: FetchRetryOptions,
): Promise<boolean> {
  if (!config.telegram.botToken) {
    console.error("TELEGRAM_BOT_TOKEN not configured");
    return false;
  }
  if (media.length < 2 || media.length > 10) {
    console.error(`Telegram media group size is invalid: ${media.length}.`);
    return false;
  }

  try {
    const form = new FormData();
    form.set("chat_id", String(chatId));
    form.set(
      "media",
      JSON.stringify(
        media.map((item, index) => ({
          type: "photo",
          media: `attach://photo${index}`,
          ...(index === 0 ? { caption, parse_mode: "HTML" } : {}),
        })),
      ),
    );
    media.forEach((item, index) => {
      form.set(`photo${index}`, item.blob, item.filename);
    });

    const response = await fetchWithRetry(
      `https://api.telegram.org/bot${config.telegram.botToken}/sendMediaGroup`,
      { method: "POST", body: form, cache: "no-store" },
      retry,
    );
    if (!response?.ok) {
      console.error(
        `Telegram media group upload failed (${response?.status ?? "network error"}).`,
      );
      return false;
    }
    const result = await response.json();
    if (!Array.isArray(result?.result) || result.result.length !== media.length) {
      console.error("Telegram media group response did not contain all messages.");
      return false;
    }
    return result?.ok === true;
  } catch (error) {
    console.error("Telegram media group upload error:", error);
    return false;
  }
}

export async function sendTelegramDocument(
  chatId: number | string,
  document: Blob,
  filename: string,
  caption: string,
  retry?: FetchRetryOptions,
): Promise<boolean> {
  if (!config.telegram.botToken) {
    console.error("TELEGRAM_BOT_TOKEN not configured");
    return false;
  }
  try {
    const form = new FormData();
    form.set("chat_id", String(chatId));
    form.set("caption", caption.slice(0, 1024));
    form.set("document", document, filename);
    const response = await fetchWithRetry(
      `https://api.telegram.org/bot${config.telegram.botToken}/sendDocument`,
      { method: "POST", body: form, cache: "no-store" },
      retry,
    );
    if (!response) return false;
    const result = await response.json();
    if (!response.ok || result?.ok !== true) {
      console.error(
        `Telegram document delivery failed (${response.status}): ${result?.description ?? "invalid Telegram API response"}`,
      );
      return false;
    }
    return true;
  } catch (error) {
    console.error("Telegram sendDocument error:", error);
    return false;
  }
}