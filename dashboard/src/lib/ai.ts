import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { getTurso } from "@/lib/turso";

export const AI_PROVIDER_OPTIONS = [
  { value: "openrouter", label: "OpenRouter", defaultModel: "openai/gpt-4o-mini" },
  { value: "openai", label: "OpenAI", defaultModel: "gpt-4o-mini" },
  { value: "gemini", label: "Gemini", defaultModel: "gemini-2.0-flash" },
] as const;

export type AiProviderValue = (typeof AI_PROVIDER_OPTIONS)[number]["value"];

export type AiProviderRow = {
  id: string;
  uid: number;
  provider: AiProviderValue;
  model: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  lastError: string | null;
};

export type ProviderConnectionCheck = {
  ok: boolean;
  message: string;
  provider?: AiProviderValue;
  model?: string;
};

type PromptTextBlock = {
  title: string;
  description: string | string[];
};

type PromptBranch = PromptTextBlock & {
  triggers: string[];
  children?: PromptBranch[];
};

type PromptSection = PromptTextBlock & {
  id: string;
  triggers: string[];
  branches: PromptBranch[];
};

type PromptDocument = {
  version: number;
  core: PromptTextBlock & {
    formatting: PromptTextBlock;
    reply: PromptTextBlock;
    privacy: PromptTextBlock;
  };
  sections: PromptSection[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isPromptTextBlock(value: unknown): value is PromptTextBlock {
  return (
    isRecord(value) &&
    typeof value.title === "string" &&
    (typeof value.description === "string" || isStringArray(value.description))
  );
}

function isPromptBranch(value: unknown): value is PromptBranch {
  if (!isRecord(value) || !isStringArray(value.triggers)) return false;
  if (
    value.children !== undefined &&
    (!Array.isArray(value.children) || !value.children.every(isPromptBranch))
  ) {
    return false;
  }
  return isPromptTextBlock(value);
}

function isPromptDocument(value: unknown): value is PromptDocument {
  if (!isRecord(value) || !isRecord(value.core) || !Array.isArray(value.sections)) {
    return false;
  }
  const core = value.core;
  if (
    typeof value.version !== "number" ||
    !isPromptTextBlock(core.formatting) ||
    !isPromptTextBlock(core.reply) ||
    !isPromptTextBlock(core.privacy) ||
    !isPromptTextBlock(core)
  ) {
    return false;
  }
  return value.sections.every((section) => {
    if (
      !isRecord(section) ||
      typeof section.id !== "string" ||
      !isStringArray(section.triggers) ||
      !Array.isArray(section.branches) ||
      !section.branches.every(isPromptBranch)
    ) {
      return false;
    }
    return isPromptTextBlock(section);
  });
}

function providerEncryptionKey(): Buffer | null {
  const configured = (
    process.env.AI_PROVIDER_ENCRYPTION_KEY?.trim() ||
    process.env.GITHUB_TOKEN_ENCRYPTION_KEY?.trim()
  );
  if (!configured) return null;
  const key = Buffer.from(configured, "base64");
  if (key.length !== 32 || key.toString("base64").replace(/=+$/, "") !== configured.replace(/=+$/, "")) {
    throw new Error("AI_PROVIDER_ENCRYPTION_KEY_INVALID");
  }
  return key;
}

function encryptSecret(value: string): string {
  const key = providerEncryptionKey();
  if (!key) return value;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [
    "v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

function decryptSecret(value: string): string {
  const key = providerEncryptionKey();
  if (!key) return value;
  const [version, ivValue, tagValue, encryptedValue, ...extra] = value.split(".");
  if (version !== "v1" || !ivValue || !tagValue || !encryptedValue || extra.length > 0) {
    throw new Error("AI_CIPHERTEXT_INVALID");
  }
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

function normalizeProvider(value: unknown): AiProviderValue | null {
  return AI_PROVIDER_OPTIONS.some((item) => item.value === value)
    ? (value as AiProviderValue)
    : null;
}

function normalizeModel(value: unknown): string {
  const text = String(value ?? "").trim();
  return text.length > 0 && text.length <= 128 ? text : "";
}

async function ensureAiProviderTable(): Promise<void> {
  await getTurso().execute(`CREATE TABLE IF NOT EXISTS ai_provider_keys (
    id TEXT PRIMARY KEY,
    uid INTEGER NOT NULL,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    api_key_encrypted TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    last_error TEXT
  )`);
}

export async function listAiProviders(uid: number): Promise<AiProviderRow[]> {
  await ensureAiProviderTable();
  const result = await getTurso().execute({
    sql: "SELECT id, uid, provider, model, api_key_encrypted, is_active, created_at, updated_at, last_error FROM ai_provider_keys WHERE uid = ? ORDER BY updated_at DESC",
    args: [uid],
  });
  const providers: AiProviderRow[] = [];
  for (const row of result.rows) {
    const item = row as Record<string, unknown>;
    const provider = normalizeProvider(item.provider);
    if (!provider) continue;
    const model = normalizeModel(item.model);
    if (!model) continue;
    providers.push({
      id: String(item.id ?? ""),
      uid: Number(item.uid ?? uid),
      provider,
      model,
      active: Number(item.is_active ?? 1) === 1,
      createdAt: String(item.created_at ?? new Date().toISOString()),
      updatedAt: String(item.updated_at ?? new Date().toISOString()),
      lastError: item.last_error == null ? null : String(item.last_error),
    });
  }
  return providers;
}

export async function saveAiProvider(
  uid: number,
  provider: unknown,
  model: unknown,
  apiKey: string,
  active = true,
): Promise<{ id: string }> {
  const normalizedProvider = normalizeProvider(provider);
  const normalizedModel = normalizeModel(model);
  if (!normalizedProvider || !normalizedModel) {
    throw new Error("Provider and model are required.");
  }
  const trimmedKey = apiKey.trim();
  if (trimmedKey.length < 8 || trimmedKey.length > 2048) {
    throw new Error("API key is invalid.");
  }
  await ensureAiProviderTable();
  const id = `ai-${normalizedProvider}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const now = new Date().toISOString();
  await getTurso().execute({
    sql: `INSERT INTO ai_provider_keys (id, uid, provider, model, api_key_encrypted, is_active, created_at, updated_at, last_error)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)
      ON CONFLICT(id) DO UPDATE SET
        uid = excluded.uid,
        provider = excluded.provider,
        model = excluded.model,
        api_key_encrypted = excluded.api_key_encrypted,
        is_active = excluded.is_active,
        updated_at = excluded.updated_at,
        last_error = NULL`,
    args: [
      id,
      uid,
      normalizedProvider,
      normalizedModel,
      encryptSecret(trimmedKey),
      active ? 1 : 0,
      now,
      now,
    ],
  });
  return { id };
}

export async function deleteAiProvider(uid: number, providerId: string): Promise<void> {
  await ensureAiProviderTable();
  await getTurso().execute({
    sql: "DELETE FROM ai_provider_keys WHERE uid = ? AND id = ?",
    args: [uid, providerId],
  });
}

export async function readAiProviderSecrets(uid: number): Promise<Array<{id:string; provider:AiProviderValue; model:string; apiKey:string; active:boolean}>> {
  const providers = await listAiProviders(uid);
  const items = await Promise.all(
    providers.map(async (item) => ({
      id: item.id,
      provider: item.provider,
      model: item.model,
      apiKey: await fetchAiProviderSecret(uid, item.id),
      active: item.active,
    })),
  );
  return items;
}

async function fetchAiProviderSecret(uid: number, providerId: string): Promise<string> {
  await ensureAiProviderTable();
  const result = await getTurso().execute({
    sql: "SELECT api_key_encrypted FROM ai_provider_keys WHERE uid = ? AND id = ? LIMIT 1",
    args: [uid, providerId],
  });
  const row = result.rows[0] as Record<string, unknown> | undefined;
  const raw = row?.api_key_encrypted == null ? "" : String(row.api_key_encrypted);
  try {
    return decryptSecret(raw);
  } catch {
    return "";
  }
}

function normalizePromptText(value: string): string {
  return ` ${value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ")} `;
}

function matchPromptTriggers(triggers: string[], normalizedText: string): number {
  return triggers.reduce((score, trigger) => {
    const normalizedTrigger = normalizePromptText(trigger).trim();
    return normalizedTrigger && normalizedText.includes(` ${normalizedTrigger} `)
      ? score + 1
      : score;
  }, 0);
}

function renderPromptBlock(block: PromptTextBlock): string {
  const description = Array.isArray(block.description)
    ? block.description.join("\n")
    : block.description;
  return `## ${block.title}\n${description}`;
}

function renderPromptBranch(
  branch: PromptBranch,
  normalizedText: string,
): string {
  const description = Array.isArray(branch.description)
    ? branch.description
    : [branch.description];
  const lines = [`### ${branch.title}`, ...description];
  if (branch.children?.length) {
    const matchingChildren = branch.children
      .map((child) => ({
        child,
        score: matchPromptTriggers(child.triggers, normalizedText),
      }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
    for (const { child } of matchingChildren) {
      lines.push(`#### ${child.title}`, ...child.description);
    }
  }
  return lines.join("\n");
}

function getPromptText(userMessage: string, contextText?: string): string {
  const promptPath = path.join(process.cwd(), "src", "lib", "ai-prompt.txt");
  const rawPrompt: unknown = JSON.parse(readFileSync(promptPath, "utf8"));
  if (!isPromptDocument(rawPrompt)) {
    throw new Error("AI prompt guide has an invalid JSON structure.");
  }

  const recentUserTurns = contextText
    ?.split("\n")
    .filter((line) => line.includes(" User:"))
    .slice(-3)
    .join("\n");
  const normalizedText = normalizePromptText(
    [userMessage, recentUserTurns].filter(Boolean).join("\n"),
  );
  const selectedSections = rawPrompt.sections
    .map((section, index) => ({
      section,
      index,
      score: matchPromptTriggers(section.triggers, normalizedText),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, 5);

  const guide = selectedSections.map(({ section }) => {
    const branches = section.branches
      .map((branch, index) => ({
        branch,
        index,
        score: matchPromptTriggers(branch.triggers, normalizedText),
      }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .slice(0, 4);
    const selectedBranches = branches.length
      ? branches.map(({ branch }) => branch)
      : section.branches.slice(0, 1);
    return [
      `# ${section.title}`,
      Array.isArray(section.description)
        ? section.description.join("\n")
        : section.description,
      ...selectedBranches.map((branch) =>
        renderPromptBranch(branch, normalizedText),
      ),
    ].join("\n");
  });

  return [
    renderPromptBlock(rawPrompt.core),
    renderPromptBlock(rawPrompt.core.formatting),
    renderPromptBlock(rawPrompt.core.reply),
    renderPromptBlock(rawPrompt.core.privacy),
    "## Relevant CheyaVerse guide sections",
    guide.length
      ? guide.join("\n\n")
      : "No product-guide section matched this message. Do not invent CheyaVerse behavior; ask a focused clarifying question when product-specific facts are needed.",
  ].join("\n\n");
}

async function requestJson(url: string, headers: Record<string, string>, body?: unknown): Promise<any> {
  const response = await fetch(url, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Accept: "application/json",
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const text = await response.text();
  if (!text) {
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return {};
  }
  let result: unknown;
  try {
    result = JSON.parse(text);
  } catch {
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${text.slice(0, 300)}`);
    }
    return text;
  }
  if (!response.ok) {
    const errorValue =
      result && typeof result === "object" && "error" in result
        ? (result as { error?: unknown }).error
        : null;
    const detail =
      typeof errorValue === "string"
        ? errorValue
        : errorValue &&
            typeof errorValue === "object" &&
            "message" in errorValue &&
            typeof errorValue.message === "string"
          ? errorValue.message
          : `HTTP ${response.status}`;
    throw new Error(detail);
  }
  return result;
}

async function providerCall(
  provider: AiProviderValue,
  model: string,
  apiKey: string,
  systemPrompt: string,
  userMessage: string,
  contextText?: string,
): Promise<{ text: string; inputTokens: number | null; outputTokens: number | null }> {
  const normalizedContext = contextText?.trim()
    ? `\n\nRepository/context:\n${contextText.trim()}`
    : "";

  if (provider === "openrouter" || provider === "openai") {
    const endpoint = provider === "openrouter"
      ? "https://openrouter.ai/api/v1/chat/completions"
      : "https://api.openai.com/v1/chat/completions";
    const headers: Record<string, string> = provider === "openrouter"
      ? {
          Authorization: "Bearer " + apiKey,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://cheyaverse.app",
          "X-Title": "CheyaVerse",
        }
      : {
          Authorization: "Bearer " + apiKey,
          "Content-Type": "application/json",
        };
    const payload = {
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `${userMessage}${normalizedContext}` },
      ],
      temperature: 0.35,
      max_tokens: 600,
    };
    const result = await requestJson(endpoint, headers, payload);
    if (result && typeof result === "object" && Array.isArray((result as any).error)) {
      throw new Error(String((result as any).error[0]?.message ?? "AI provider error"));
    }
    const text = (result as any)?.choices?.[0]?.message?.content;
    const responseText = typeof text === "string"
      ? text
      : Array.isArray(text)
        ? text.map((part) => typeof part === "string" ? part : (part?.text ?? "")).join("\n")
        : "";
    if (!responseText) throw new Error("Unexpected provider response format.");
    const usage = (result as any)?.usage;
    return {
      text: responseText,
      inputTokens: Number.isSafeInteger(usage?.prompt_tokens)
        ? usage.prompt_tokens
        : null,
      outputTokens: Number.isSafeInteger(usage?.completion_tokens)
        ? usage.completion_tokens
        : null,
    };
  }

  if (provider === "gemini") {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const payload = {
      contents: [{
        role: "user",
        parts: [{ text: `${systemPrompt}

${userMessage}${normalizedContext}` }],
      }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 600 },
    };
    const result = await requestJson(endpoint, { "Content-Type": "application/json" }, payload);
    const response = (result as any)?.candidates?.[0]?.content?.parts ?? [];
    const text = response.map((item: any) => item?.text ?? "").join("\n");
    if (text) {
      const usage = (result as any)?.usageMetadata;
      return {
        text,
        inputTokens: Number.isSafeInteger(usage?.promptTokenCount)
          ? usage.promptTokenCount
          : null,
        outputTokens: Number.isSafeInteger(usage?.candidatesTokenCount)
          ? usage.candidatesTokenCount
          : null,
      };
    }
    if ((result as any)?.error?.message) throw new Error(String((result as any).error.message));
    throw new Error("Gemini returned no content.");
  }

  throw new Error(`Unsupported provider: ${provider}`);
}

export async function testAiProviderConnection(
  provider: unknown,
  model: unknown,
  apiKey: string,
): Promise<ProviderConnectionCheck> {
  const normalizedProvider = normalizeProvider(provider);
  const normalizedModel = normalizeModel(model);
  if (!normalizedProvider || !normalizedModel) {
    return { ok: false, message: "Provider and model are required." };
  }
  try {
    await providerCall(normalizedProvider, normalizedModel, apiKey.trim(), "You are a health check.", "Reply with OK.", "");
    return {
      ok: true,
      message: `${normalizedProvider.toUpperCase()} is connected and ready.`,
      provider: normalizedProvider,
      model: normalizedModel,
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Provider connection failed.",
      provider: normalizedProvider,
      model: normalizedModel,
    };
  }
}

export async function generateAiReply(
  uid: number,
  message: string,
  contextText?: string,
): Promise<{
  reply: string;
  provider: string;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
}> {
  const providers = await listAiProviders(uid);
  const activeProviders = providers.filter((item) => item.active);
  if (activeProviders.length === 0) {
    throw new Error("No active AI providers are configured.");
  }
  const systemPrompt = getPromptText(message, contextText);
  const lastErrors: string[] = [];
  for (const provider of activeProviders) {
    const secret = await fetchAiProviderSecret(uid, provider.id);
    if (!secret) {
      lastErrors.push(`${provider.provider}: missing API key`);
      continue;
    }
    try {
      const completion = await providerCall(
        provider.provider,
        provider.model,
        secret,
        systemPrompt,
        message,
        contextText,
      );
      await getTurso().execute({
        sql: "UPDATE ai_provider_keys SET updated_at = ?, last_error = NULL WHERE id = ? AND uid = ?",
        args: [new Date().toISOString(), provider.id, uid],
      });
      return {
        reply: completion.text,
        provider: provider.provider,
        model: provider.model,
        inputTokens: completion.inputTokens,
        outputTokens: completion.outputTokens,
      };
    } catch (error) {
      const detail = error instanceof Error ? error.message : "AI request failed.";
      lastErrors.push(`${provider.provider}: ${detail}`);
      await getTurso().execute({
        sql: "UPDATE ai_provider_keys SET updated_at = ?, last_error = ? WHERE id = ? AND uid = ?",
        args: [new Date().toISOString(), detail.slice(0, 500), provider.id, uid],
      });
    }
  }
  throw new Error(lastErrors.join("; ") || "All configured AI providers failed.");
}
