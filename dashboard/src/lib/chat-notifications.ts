import { config } from "@/lib/config";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

const DIVIDER = "─".repeat(26);

async function sendTelegramNotification(
  recipientUid: number,
  senderUid: number,
  senderName: string,
  content: string,
): Promise<void> {
  if (!config.telegram.botToken) {
    throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  }
  const text = `<b>${escapeHtml(senderName)}</b>\n${DIVIDER}\n${escapeHtml(content)}`;
  const response = await fetch(
    `https://api.telegram.org/bot${config.telegram.botToken}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: recipientUid,
        text,
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [
              { text: "Mark as read", callback_data: `dm:read:${senderUid}` },
              { text: "Reply", callback_data: `dm:reply:${senderUid}` },
            ],
          ],
        },
      }),
      cache: "no-store",
    },
  );
  const result = (await response.json().catch(() => null)) as
    | { ok?: boolean; description?: string }
    | null;
  if (!response.ok || result?.ok !== true) {
    throw new Error(
      `Telegram API ${response.status}: ${result?.description ?? "notification rejected"}`,
    );
  }
}

export async function sendOfflineDirectMessageNotifications({
  recipientUid,
  senderUid,
  senderName,
  content,
}: {
  recipientUid: number;
  senderUid: number;
  senderName: string;
  content: string;
}): Promise<void> {
  try {
    await sendTelegramNotification(recipientUid, senderUid, senderName, content);
  } catch (error) {
    console.error("[chats] offline Telegram notification delivery failed:", error);
  }
}