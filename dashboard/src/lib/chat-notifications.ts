import { config } from "@/lib/config";
import { buildPushNotification, sendPushToUid } from "@/lib/push";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function centeredSenderMarkup(senderName: string): string {
  const visualLength = [...senderName].length;
  const padding = Math.max(0, Math.floor((30 - visualLength) / 2));
  return `${"&#160;".repeat(padding)}<b>${escapeHtml(senderName)}</b>`;
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
  const text = `${centeredSenderMarkup(senderName)}\n${DIVIDER}\n${escapeHtml(content)}`;
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
  messageId,
}: {
  recipientUid: number;
  senderUid: number;
  senderName: string;
  content: string;
  messageId: string;
}): Promise<void> {
  const results = await Promise.allSettled([
    sendTelegramNotification(recipientUid, senderUid, senderName, content),
    sendPushToUid(
      recipientUid,
      buildPushNotification({
        uid: recipientUid,
        contact: {
          id: String(senderUid),
          name: senderName,
          avatarUrl: `/api/avatar/${senderUid}/circular`,
        },
        body: content,
        url: `/${recipientUid}/chat/${senderUid}`,
        msgId: messageId,
      }),
    ),
  ]);
  for (const result of results) {
    if (result.status === "rejected") {
      console.error("[chats] offline notification delivery failed:", result.reason);
    }
  }
}