import "server-only";

import { config } from "@/lib/config";

export type TelegramGroupMemoryEntry = {
  id: string;
  messageId: string;
  senderName: string;
  role: "admin" | "bot" | "memory";
  content: string;
  timestamp: string;
  timestampIso: string;
  mediaTypes: string[];
  replyToMessageId: string | null;
};

export type TelegramOwnerMemoryEntry = {
  groupId: number;
  groupTitle: string;
  id: string;
  messageId: string;
  source: "summary" | "reply";
  content: string;
  timestamp: string;
  timestampIso: string;
};

export type TelegramGroupHistoryImportMessage = {
  messageId: number;
  senderKind: "user" | "bot";
  senderName: string;
  content: string;
  mediaTypes: string[];
  replyToMessageId: number | null;
  createdAt: string;
};

type MemoryResponse = {
  ok?: boolean;
  error?: string;
  stored?: boolean;
  reason?: string;
  summary?: string | null;
  memory?: unknown;
  imported?: number;
};

function memoryEndpoint(): URL {
  if (!config.telegramAiMemoryUrl || !config.telegramAiMemorySecret) {
    throw new Error(
      "Telegram AI memory service is not configured; set TELEGRAM_AI_MEMORY_URL and TELEGRAM_AI_MEMORY_SECRET.",
    );
  }
  let base: URL;
  try {
    base = new URL(config.telegramAiMemoryUrl);
  } catch {
    throw new Error("TELEGRAM_AI_MEMORY_URL must be an absolute HTTPS URL.");
  }
  const localHttp =
    process.env.NODE_ENV !== "production" &&
    base.protocol === "http:" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(base.hostname);
  if (
    base.username ||
    base.password ||
    (base.protocol !== "https:" && !localHttp)
  ) {
    throw new Error("Telegram AI memory service URL must use HTTPS.");
  }
  base.pathname = `${base.pathname.replace(/\/+$/, "")}/internal/telegram-group-ai`;
  base.search = "";
  base.hash = "";
  return base;
}

async function requestMemoryService(
  action: string,
  ownerUid: number,
  payload: Record<string, unknown> = {},
): Promise<MemoryResponse> {
  const endpoint = memoryEndpoint();
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.telegramAiMemorySecret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action, ownerUid, ...payload }),
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "network request failed";
    throw new Error(`Telegram AI memory service is unreachable: ${detail}`);
  }

  const result = (await response.json().catch(() => null)) as MemoryResponse | null;
  if (!response.ok || !result || result.ok !== true) {
    const code = result && typeof result.error === "string" ? result.error : "invalid_response";
    throw new Error(
      `Telegram AI memory service rejected ${action} (HTTP ${response.status}: ${code}).`,
    );
  }
  return result;
}

function parseMemory<T>(value: unknown, validate: (row: unknown) => row is T): T[] {
  if (!Array.isArray(value) || !value.every(validate)) {
    throw new Error("Telegram AI memory service returned an invalid memory list.");
  }
  return value;
}

function isGroupMemoryEntry(value: unknown): value is TelegramGroupMemoryEntry {
  if (typeof value !== "object" || value === null) return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === "string" &&
    /^\d{40}$/.test(row.id) &&
    typeof row.messageId === "string" &&
    /^\d{40}$/.test(row.messageId) &&
    typeof row.senderName === "string" &&
    (row.role === "admin" || row.role === "bot" || row.role === "memory") &&
    typeof row.content === "string" &&
    typeof row.timestamp === "string" &&
    typeof row.timestampIso === "string" &&
    Array.isArray(row.mediaTypes) &&
    row.mediaTypes.every((item) => typeof item === "string") &&
    (row.replyToMessageId === null || typeof row.replyToMessageId === "string")
  );
}

function isOwnerMemoryEntry(value: unknown): value is TelegramOwnerMemoryEntry {
  if (typeof value !== "object" || value === null) return false;
  const row = value as Record<string, unknown>;
  return (
    Number.isSafeInteger(row.groupId) &&
    typeof row.groupTitle === "string" &&
    typeof row.id === "string" &&
    /^\d{40}$/.test(row.id) &&
    typeof row.messageId === "string" &&
    /^\d{40}$/.test(row.messageId) &&
    (row.source === "summary" || row.source === "reply") &&
    typeof row.content === "string" &&
    typeof row.timestamp === "string" &&
    typeof row.timestampIso === "string"
  );
}

export async function storeTelegramOwnerMessage(input: {
  ownerUid: number;
  groupId: number;
  groupTitle: string;
  messageId: number;
  senderName: string;
  content: string;
  mediaTypes: string[];
  replyToMessageId: number | null;
  timestamp: string;
  edited: boolean;
}): Promise<{ stored: boolean; reason: string }> {
  const result = await requestMemoryService("store_owner_message", input.ownerUid, input);
  if (typeof result.stored !== "boolean" || typeof result.reason !== "string") {
    throw new Error("Telegram AI memory service returned an invalid store response.");
  }
  return { stored: result.stored, reason: result.reason };
}

export async function retrieveTelegramGroupMemory(input: {
  ownerUid: number;
  groupId: number;
  query: string;
  replyToMessageId: number | null;
}): Promise<TelegramGroupMemoryEntry[]> {
  const result = await requestMemoryService("retrieve_group_memory", input.ownerUid, input);
  return parseMemory(result.memory, isGroupMemoryEntry);
}

export async function getTelegramStoredInsight(input: {
  ownerUid: number;
  groupId: number;
  messageId: number;
}): Promise<string | null> {
  const result = await requestMemoryService("get_insight", input.ownerUid, input);
  if (result.summary !== null && typeof result.summary !== "string") {
    throw new Error("Telegram AI memory service returned an invalid insight.");
  }
  return result.summary ?? null;
}

export async function storeTelegramInsight(input: {
  ownerUid: number;
  groupId: number;
  groupTitle: string;
  messageId: number;
  summary: string;
  replace: boolean;
}): Promise<void> {
  await requestMemoryService("store_insight", input.ownerUid, input);
}

export async function storeTelegramBotMessage(input: {
  ownerUid: number;
  groupId: number;
  messageId: number;
  content: string;
  replyToMessageId: number | null;
  timestamp: string;
}): Promise<void> {
  await requestMemoryService("store_bot_message", input.ownerUid, input);
}

export async function retrieveTelegramOwnerMemory(
  ownerUid: number,
  query: string,
): Promise<TelegramOwnerMemoryEntry[]> {
  const result = await requestMemoryService("retrieve_owner_memory", ownerUid, { query });
  return parseMemory(result.memory, isOwnerMemoryEntry);
}

export async function importTelegramGroupHistory(input: {
  ownerUid: number;
  groupId: number;
  groupTitle: string;
  messages: TelegramGroupHistoryImportMessage[];
}): Promise<number> {
  const result = await requestMemoryService("import_messages", input.ownerUid, input);
  if (!Number.isSafeInteger(result.imported)) {
    throw new Error("Telegram AI memory service returned an invalid import count.");
  }
  return result.imported!;
}
