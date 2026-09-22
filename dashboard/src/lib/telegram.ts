import { config } from "./config";

export async function getTelegramFileUrl(fileId: string): Promise<string | null> {
  if (!config.telegram.botToken) {
    console.error("TELEGRAM_BOT_TOKEN not configured");
    return null;
  }
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${config.telegram.botToken}/getFile?file_id=${encodeURIComponent(fileId)}`,
      { cache: "no-store" },
    );
    if (!res.ok) return null;
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
    const upstream = await fetch(url, { cache: "no-store" });
    if (!upstream.ok || !upstream.body) return null;
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
    const res = await fetch(
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
    if (!res.ok) return false;
    const data = await res.json();
    return data?.ok === true;
  } catch (err) {
    console.error("Telegram deleteMessage error:", err);
    return false;
  }
}
