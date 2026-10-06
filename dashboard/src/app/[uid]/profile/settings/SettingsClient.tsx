"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { reportClientError } from "@/lib/client-errors";
import { readApiJson } from "@/lib/read-api-json";
import { useBackDismiss } from "@/lib/back-dismiss";
import {
  Calendar,
  Check,
  ChevronDown,
  ChevronRight,
  Database,
  Github,
  Globe,
  Layers,
  RotateCcw,
  Save,
  Shield,
  Smartphone,
  Trash2,
  X,
} from "lucide-react";

type Device = {
  deviceId: string;
  type: string | null;
  os: string | null;
  brand: string | null;
  model: string | null;
  browser: string | null;
  browserVersion: string | null;
  cpuCores: number | null;
  ramGb: number | null;
  screen: string | null;
  viewport: string | null;
  pixelRatio: number | null;
  orientation: string | null;
  colorGamut: string | null;
  architecture: string | null;
  platformVersion: string | null;
  bitness: string | null;
  networkType: string | null;
  language: string | null;
  timezone: string | null;
  lastSeen: string;
};

type Tab = "overview" | "general" | "security" | "data" | "github" | "about";

type AccountSettings = {
  telegramId: number;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  createdAt: string | null;
};

type TelegramHistoryImportMessage = {
  messageId: number;
  senderKind: "user" | "bot";
  senderName: string;
  content: string;
  mediaTypes: string[];
  replyToMessageId: number | null;
  createdAt: string;
};

type TelegramHistoryGroup = {
  groupId: number;
  groupTitle: string;
};

function recordValue(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function exportedText(value: unknown): string {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return "";
  return value.map((part) => {
    if (typeof part === "string") return part;
    const item = recordValue(part);
    return typeof item?.text === "string" ? item.text : "";
  }).join("");
}

function exportedMediaType(message: Record<string, unknown>): string | null {
  const raw = [
    message.media_type,
    message.photo ? "photo" : "",
    message.video_file ? "video" : "",
    message.video_message ? "video_note" : "",
    message.voice_message ? "voice" : "",
    message.audio_file ? "audio" : "",
    message.sticker_emoji || message.sticker ? "sticker" : "",
    message.animation ? "animation" : "",
    message.file ? "document" : "",
  ].find((value) => typeof value === "string" && value);
  if (typeof raw !== "string") return null;
  const normalized = raw.toLowerCase();
  if (normalized.includes("photo")) return "photo";
  if (normalized.includes("video_message") || normalized.includes("video_note")) return "video_note";
  if (normalized.includes("video")) return "video";
  if (normalized.includes("voice")) return "voice";
  if (normalized.includes("audio")) return "audio";
  if (normalized.includes("sticker")) return "sticker";
  if (normalized.includes("animation") || normalized.includes("gif")) return "animation";
  if (normalized.includes("document") || normalized.includes("file")) return "document";
  return null;
}

function parseTelegramDesktopExport(
  value: unknown,
  ownerUid: number,
  botUid: number | null,
  targetGroupId: number,
): TelegramHistoryImportMessage[] {
  const root = recordValue(value);
  if (!root || !Array.isArray(root.messages)) {
    throw new Error("JSON tidak berisi daftar messages dari Telegram Desktop.");
  }
  const exportChatId = typeof root.id === "number"
    ? String(root.id)
    : typeof root.id === "string" && /^\d+$/.test(root.id)
      ? root.id
      : "";
  const exportType = typeof root.type === "string" ? root.type : "";
  const targetId = String(targetGroupId).replace(/^-100/, "").replace(/^-/, "");
  const isSelectedChannelExport =
    ["private_channel", "public_channel", "channel"].includes(exportType) &&
    exportChatId !== "" &&
    exportChatId === targetId;
  if (
    ["private_channel", "public_channel", "channel"].includes(exportType) &&
    !isSelectedChannelExport
  ) {
    throw new Error("Export ini bukan dari channel Telegram yang dipilih di atas.");
  }
  if (root.messages.length > 100_000) {
    throw new Error("Export terlalu besar; batas impor adalah 100.000 pesan.");
  }
  const imported = new Map<number, TelegramHistoryImportMessage>();
  let mostRecentOwnerMessageId: number | null = null;
  for (const candidate of root.messages) {
    const message = recordValue(candidate);
    if (!message || message.type !== "message") continue;
    const id = typeof message.id === "number"
      ? message.id
      : typeof message.id === "string" && /^\d+$/.test(message.id)
        ? Number(message.id)
        : NaN;
    if (!Number.isSafeInteger(id) || id <= 0) continue;
    const fromId = typeof message.from_id === "string"
      ? message.from_id
      : typeof message.from_id === "number"
        ? String(message.from_id)
        : "";
    const senderKind = fromId === `user${ownerUid}` ||
      fromId === String(ownerUid) ||
      isSelectedChannelExport && fromId === `channel${exportChatId}`
      ? "user"
      : botUid !== null && (fromId === `user${botUid}` || fromId === String(botUid))
        ? "bot"
        : null;
    if (!senderKind) continue;

    const mediaType = exportedMediaType(message);
    const text = exportedText(message.text).trim();
    if (!text && !mediaType) continue;
    const content = [
      text.slice(0, 3600),
      mediaType ? `[${mediaType}; media file is not included in this text import]` : "",
    ].filter(Boolean).join("\n").slice(0, 4000);
    const createdAt = typeof message.date === "string"
      ? new Date(message.date)
      : null;
    if (!createdAt || !Number.isFinite(createdAt.getTime())) continue;
    const explicitReplyToMessageId = typeof message.reply_to_message_id === "number"
      ? message.reply_to_message_id
      : typeof message.reply_to_message_id === "string" &&
          /^\d+$/.test(message.reply_to_message_id)
        ? Number(message.reply_to_message_id)
        : null;
    const replyToMessageId = explicitReplyToMessageId ??
      (senderKind === "bot" ? mostRecentOwnerMessageId : null);
    if (
      replyToMessageId !== null &&
      (!Number.isSafeInteger(replyToMessageId) || replyToMessageId <= 0)
    ) continue;
    const senderName = senderKind === "bot"
      ? "Cheya"
      : typeof message.from === "string"
        ? message.from.slice(0, 120)
        : "Admin";
    imported.set(id, {
      messageId: id,
      senderKind,
      senderName,
      content,
      mediaTypes: mediaType ? [mediaType] : [],
      replyToMessageId,
      createdAt: createdAt.toISOString(),
    });
    if (senderKind === "user") mostRecentOwnerMessageId = id;
  }
  return Array.from(imported.values()).sort(
    (a, b) => a.createdAt.localeCompare(b.createdAt) || a.messageId - b.messageId,
  );
}

const DEVICE_ID_KEY = "cheya_device_id";
const DELETE_CONFIRMATION = "HAPUS AKUN";

function formatDate(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Tanggal tidak diketahui";
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function SettingsClient({
  uid,
  initialTab,
  isConfiguredAdmin,
}: {
  uid: string;
  initialTab: Tab;
  isConfiguredAdmin: boolean;
}) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [account, setAccount] = useState<AccountSettings | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [accountLoading, setAccountLoading] = useState(true);
  const [accountBusy, setAccountBusy] = useState(false);
  const [accountError, setAccountError] = useState("");
  const [accountNotice, setAccountNotice] = useState("");
  const [devices, setDevices] = useState<Device[]>([]);
  const [currentDeviceId, setCurrentDeviceId] = useState<string | null>(null);
  const [devicesLoading, setDevicesLoading] = useState(false);
  const [deviceError, setDeviceError] = useState("");
  const [cleared, setCleared] = useState(false);
  const [notice, setNotice] = useState("");
  const [revokingDevice, setRevokingDevice] = useState<Device | null>(null);
  const [revokeBusy, setRevokeBusy] = useState(false);
  const [revokeError, setRevokeError] = useState("");
  const [logoutOthersOpen, setLogoutOthersOpen] = useState(false);
  const [logoutOthersBusy, setLogoutOthersBusy] = useState(false);
  const [logoutOthersError, setLogoutOthersError] = useState("");
  const [logoutOthersNotice, setLogoutOthersNotice] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteText, setDeleteText] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [githubConnected, setGithubConnected] = useState(false);
  const [githubNeedsReconnect, setGithubNeedsReconnect] = useState(false);
  const [githubReplaceOpen, setGithubReplaceOpen] = useState(false);
  const [githubLogin, setGithubLogin] = useState<string | null>(null);
  const [githubScopes, setGithubScopes] = useState<string | null>(null);
  const [githubEncryptionStatus, setGithubEncryptionStatus] = useState<
    "checking" | "configured" | "missing" | "invalid" | "unavailable"
  >("checking");
  const githubEncryptionConfigured = githubEncryptionStatus === "configured";
  const [githubToken, setGithubToken] = useState("");
  const [githubLoading, setGithubLoading] = useState(false);
  const [githubBusy, setGithubBusy] = useState(false);
  const [githubError, setGithubError] = useState("");
  const [githubNotice, setGithubNotice] = useState("");
  const [aiProviders, setAiProviders] = useState<
    Array<{ id: string; provider: string; model: string; active: boolean; createdAt: string; lastError: string | null }>
  >([]);
  const [aiProviderOptions, setAiProviderOptions] = useState<
    Array<{ value: string; label: string }>
  >([]);
  const [aiModels, setAiModels] = useState<Array<{ id: string; name: string }>>([]);
  const [aiModelsLoading, setAiModelsLoading] = useState(false);
  const [aiForm, setAiForm] = useState({
    provider: "openrouter",
    model: "",
    apiKey: "",
    endpointUrl: "",
  });
  const [aiBusy, setAiBusy] = useState(false);
  const [aiTesting, setAiTesting] = useState(false);
  const [aiError, setAiError] = useState("");
  const [aiNotice, setAiNotice] = useState("");
  const [telegramHistoryGroups, setTelegramHistoryGroups] = useState<TelegramHistoryGroup[]>([]);
  const [telegramHistoryGroupId, setTelegramHistoryGroupId] = useState("");
  const [telegramBotUid, setTelegramBotUid] = useState<number | null>(null);
  const [telegramHistoryLoading, setTelegramHistoryLoading] = useState(false);
  const [telegramHistoryBusy, setTelegramHistoryBusy] = useState(false);
  const [telegramHistoryProgress, setTelegramHistoryProgress] = useState("");
  const [telegramHistoryError, setTelegramHistoryError] = useState("");
  const [telegramHistoryNotice, setTelegramHistoryNotice] = useState("");
  useBackDismiss(Boolean(revokingDevice), () => setRevokingDevice(null), "settings-revoke-device");
  useBackDismiss(logoutOthersOpen, () => setLogoutOthersOpen(false), "settings-logout-others");
  useBackDismiss(deleteOpen, () => setDeleteOpen(false), "settings-delete-account");
  useBackDismiss(githubReplaceOpen, () => setGithubReplaceOpen(false), "settings-github-replace");

  const loadAccountSettings = useCallback(async () => {
    setAccountLoading(true);
    setAccountError("");
    try {
      const response = await fetch("/api/account/preferences", {
        cache: "no-store",
      });
      const result = (await response.json()) as {
        account?: AccountSettings;
        displayName?: string | null;
        error?: string;
      };
      if (!response.ok || !result.account) {
        throw new Error(result.error || "Account settings could not be loaded.");
      }
      setAccount(result.account);
      setDisplayName(result.displayName ?? "");
    } catch (cause) {
      setAccountError(
        cause instanceof Error
          ? cause.message
          : "Account settings could not be loaded.",
      );
    } finally {
      setAccountLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAccountSettings();
  }, [loadAccountSettings]);

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  const saveDisplayName = async () => {
    setAccountBusy(true);
    setAccountError("");
    setAccountNotice("");
    try {
      const response = await fetch("/api/account/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName }),
        cache: "no-store",
      });
      const result = (await response.json()) as {
        displayName?: string;
        error?: string;
      };
      if (!response.ok || typeof result.displayName !== "string") {
        throw new Error(result.error || "Display name could not be saved.");
      }
      setDisplayName(result.displayName);
      setAccountNotice("Display name saved.");
    } catch (cause) {
      setAccountError(
        cause instanceof Error ? cause.message : "Display name could not be saved.",
      );
    } finally {
      setAccountBusy(false);
    }
  };

  const resetDisplayName = async () => {
    setAccountBusy(true);
    setAccountError("");
    setAccountNotice("");
    try {
      const response = await fetch("/api/account/preferences", {
        method: "DELETE",
        cache: "no-store",
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(result.error || "Display name could not be reset.");
      }
      setDisplayName("");
      setAccountNotice("Display name reset to your Telegram name.");
    } catch (cause) {
      setAccountError(
        cause instanceof Error ? cause.message : "Display name could not be reset.",
      );
    } finally {
      setAccountBusy(false);
    }
  };

  const loadDevices = useCallback(async () => {
    setDevicesLoading(true);
    setDeviceError("");
    try {
      const response = await fetch("/api/session/devices", { cache: "no-store" });
      const result = (await response.json()) as {
        ok?: boolean;
        currentDeviceId?: string | null;
        devices?: Device[];
      };
      if (!response.ok || !result.ok || !Array.isArray(result.devices)) {
        throw new Error(
          response.status === 401
            ? "Sesi berakhir. Silakan masuk kembali."
            : "Daftar perangkat tidak dapat dimuat.",
        );
      }
      setCurrentDeviceId(result.currentDeviceId ?? null);
      setDevices(result.devices);
    } catch (cause) {
      setDeviceError(
        cause instanceof Error
          ? cause.message
          : "Daftar perangkat tidak dapat dimuat.",
      );
    } finally {
      setDevicesLoading(false);
    }
  }, []);

  const loadGitHubSettings = useCallback(async () => {
    setGithubLoading(true);
    setGithubError("");
    try {
      const response = await fetch("/api/github/settings", { cache: "no-store" });
      const result = await readApiJson<{
        connected?: boolean;
        tokenReadable?: boolean | null;
        login?: string | null;
        scopes?: string | null;
        encryptionConfigured?: boolean;
        encryptionStatus?: "configured" | "missing" | "invalid";
      }>(response);
      if (!response.ok) {
        throw new Error("GitHub settings could not be loaded.");
      }
      const needsReconnect =
        result.connected === true && result.tokenReadable === false;
      setGithubNeedsReconnect(needsReconnect);
      setGithubConnected(result.connected === true && !needsReconnect);
      setGithubLogin(result.login ?? null);
      setGithubScopes(result.scopes ?? null);
      setGithubEncryptionStatus(
        result.encryptionStatus ??
          (result.encryptionConfigured === true ? "configured" : "missing"),
      );
    } catch (cause) {
      setGithubEncryptionStatus("unavailable");
      reportClientError(cause, "GitHub settings status");
      setGithubError(
        cause instanceof Error ? cause.message : "GitHub settings could not be loaded.",
      );
    } finally {
      setGithubLoading(false);
    }
  }, []);

  useEffect(() => {
    try {
      setCurrentDeviceId(window.localStorage.getItem(DEVICE_ID_KEY));
    } catch {}
  }, []);

  useEffect(() => {
    if (tab === "security") void loadDevices();
  }, [tab, loadDevices]);

  const loadAiProviders = useCallback(async () => {
    try {
      const response = await fetch("/api/ai/providers", { cache: "no-store" });
      const result = (await response.json()) as {
        ok?: boolean;
        providers?: Array<{
          id: string;
          provider: string;
          model: string;
          active: boolean;
          createdAt: string;
          lastError: string | null;
        }>;
        options?: Array<{ value: string; label: string }>;
        error?: string;
      };
      if (!response.ok || !result.ok || !Array.isArray(result.providers)) {
        throw new Error(result.error || "AI providers could not be loaded.");
      }
      setAiProviders(result.providers);
      if (Array.isArray(result.options)) setAiProviderOptions(result.options);
    } catch (cause) {
      setAiError(
        cause instanceof Error
          ? cause.message
          : "AI providers could not be loaded.",
      );
    }
  }, []);

  const loadTelegramHistoryGroups = useCallback(async () => {
    if (!isConfiguredAdmin) return;
    setTelegramHistoryLoading(true);
    setTelegramHistoryError("");
    try {
      const response = await fetch("/api/telegram/group-ai/history", {
        cache: "no-store",
      });
      const result = await readApiJson<{
        ok?: boolean;
        error?: string;
        groups?: TelegramHistoryGroup[];
        botId?: number | null;
      }>(response);
      if (!response.ok || !result.ok || !Array.isArray(result.groups)) {
        throw new Error(result.error || "Grup Telegram AI tidak dapat dimuat.");
      }
      setTelegramHistoryGroups(result.groups);
      setTelegramBotUid(
        typeof result.botId === "number" && Number.isSafeInteger(result.botId)
          ? result.botId
          : null,
      );
      setTelegramHistoryGroupId((current) =>
        result.groups?.some((group) => String(group.groupId) === current)
          ? current
          : String(result.groups?.[0]?.groupId ?? ""),
      );
    } catch (cause) {
      setTelegramHistoryError(
        cause instanceof Error
          ? cause.message
          : "Grup Telegram AI tidak dapat dimuat.",
      );
    } finally {
      setTelegramHistoryLoading(false);
    }
  }, [isConfiguredAdmin]);

  async function importTelegramHistoryFile(file: File) {
    if (telegramHistoryBusy) return;
    setTelegramHistoryError("");
    setTelegramHistoryNotice("");
    setTelegramHistoryProgress("");
    if (file.size > 50 * 1024 * 1024) {
      setTelegramHistoryError("Ukuran export melebihi batas 50 MiB.");
      return;
    }
    if (!telegramHistoryGroupId) {
      setTelegramHistoryError("Pilih grup Telegram AI yang akan diisi.");
      return;
    }

    setTelegramHistoryBusy(true);
    let importedCount = 0;
    try {
      let exportData: unknown;
      try {
        exportData = JSON.parse(await file.text());
      } catch {
        throw new Error("File bukan JSON export Telegram Desktop yang valid.");
      }
      const entries = parseTelegramDesktopExport(
        exportData,
        Number(uid),
        telegramBotUid,
        Number(telegramHistoryGroupId),
      );
      if (entries.length === 0) {
        throw new Error(
          "Tidak ditemukan pesan teks/media dari akun admin atau bot ini. Pastikan export memakai format JSON dan pilih chat yang benar.",
        );
      }
      for (let offset = 0; offset < entries.length; offset += 100) {
        const batch = entries.slice(offset, offset + 100);
        setTelegramHistoryProgress(
          `Menyimpan riwayat Telegram… ${Math.min(offset + batch.length, entries.length)} dari ${entries.length}`,
        );
        const response = await fetch("/api/telegram/group-ai/history", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            groupId: Number(telegramHistoryGroupId),
            messages: batch,
          }),
          cache: "no-store",
        });
        const result = await readApiJson<{
          ok?: boolean;
          error?: string;
          imported?: number;
        }>(response);
        if (
          !response.ok ||
          !result.ok ||
          result.imported !== batch.length
        ) {
          throw new Error(
            result.error || "Sebagian riwayat Telegram gagal disimpan.",
          );
        }
        importedCount += result.imported;
      }
      setTelegramHistoryNotice(
        `${importedCount} pesan lama berhasil diimpor. Pesan tersebut sekarang dapat ditemukan lewat pencarian memori AI.`,
      );
      setTelegramHistoryProgress("");
    } catch (cause) {
      setTelegramHistoryError(
        `${cause instanceof Error ? cause.message : "Riwayat Telegram gagal diimpor."}${
          importedCount
            ? ` ${importedCount} pesan sudah tersimpan; impor dapat diulangi dengan aman.`
            : ""
        }`,
      );
    } finally {
      setTelegramHistoryBusy(false);
    }
  }

  async function loadAiModels() {
    if (aiModelsLoading) return;
    setAiModelsLoading(true);
    setAiError("");
    setAiNotice("");
    try {
      const response = await fetch("/api/ai/providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "models",
          provider: aiForm.provider,
          apiKey: aiForm.apiKey,
          endpointUrl: aiForm.endpointUrl,
        }),
        cache: "no-store",
      });
      const result = await readApiJson<{
        ok?: boolean;
        error?: string;
        models?: Array<{ id: string; name: string }>;
      }>(response);
      if (!response.ok || !result.ok || !Array.isArray(result.models)) {
        throw new Error(result.error || "AI models could not be loaded.");
      }
      setAiModels(result.models);
      if (result.models.length === 0) {
        throw new Error("The provider returned no models available to this API key.");
      }
      setAiForm((current) => ({
        ...current,
        model: result.models?.some((model) => model.id === current.model)
          ? current.model
          : result.models?.[0]?.id ?? "",
      }));
      setAiNotice(`${result.models.length} available models loaded.`);
    } catch (cause) {
      setAiModels([]);
      setAiForm((current) => ({ ...current, model: "" }));
      setAiError(
        cause instanceof Error ? cause.message : "AI models could not be loaded.",
      );
    } finally {
      setAiModelsLoading(false);
    }
  }

  useEffect(() => {
    if (tab === "github") {
      void loadGitHubSettings();
      void loadAiProviders();
      if (isConfiguredAdmin) void loadTelegramHistoryGroups();
    }
  }, [tab, loadGitHubSettings, loadAiProviders, isConfiguredAdmin, loadTelegramHistoryGroups]);

  async function connectGitHub() {
    if (githubBusy || !githubToken.trim()) return;
    setGithubBusy(true);
    setGithubError("");
    setGithubNotice("");
    try {
      const response = await fetch("/api/github/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: githubToken }),
        cache: "no-store",
      });
      const result = await readApiJson<{
        ok?: boolean;
        error?: string;
        login?: string;
      }>(response);
      if (!response.ok || !result.ok) {
        throw new Error(result.error || "GitHub account could not be connected.");
      }
      setGithubToken("");
      setGithubReplaceOpen(false);
      setGithubNotice(`Connected as @${result.login ?? "GitHub user"}.`);
      await loadGitHubSettings();
    } catch (cause) {
      reportClientError(cause, "GitHub token connection");
      setGithubError(
        cause instanceof Error ? cause.message : "GitHub account could not be connected.",
      );
    } finally {
      setGithubBusy(false);
    }
  }

  async function disconnectGitHub() {
    if (githubBusy) return;
    setGithubBusy(true);
    setGithubError("");
    setGithubNotice("");
    try {
      const response = await fetch("/api/github/settings", {
        method: "DELETE",
        cache: "no-store",
      });
      const result = await readApiJson<{ ok?: boolean; error?: string }>(response);
      if (!response.ok || !result.ok) {
        throw new Error(result.error || "GitHub account could not be disconnected.");
      }
      setGithubConnected(false);
      setGithubLogin(null);
      setGithubScopes(null);
      setGithubReplaceOpen(false);
      setGithubNotice("GitHub token removed from this account.");
    } catch (cause) {
      setGithubError(
        cause instanceof Error ? cause.message : "GitHub token could not be removed.",
      );
    } finally {
      setGithubBusy(false);
    }
  }

  async function testAiProviderConnection() {
    if (
      aiTesting ||
      aiBusy ||
      !aiForm.provider ||
      !aiForm.model ||
      (aiForm.provider !== "local" && !aiForm.apiKey.trim())
    ) {
      return;
    }
    setAiTesting(true);
    setAiError("");
    setAiNotice("");
    try {
      const response = await fetch("/api/ai/providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "test",
          provider: aiForm.provider,
          model: aiForm.model,
          apiKey: aiForm.apiKey,
          endpointUrl: aiForm.endpointUrl,
        }),
        cache: "no-store",
      });
      const result = (await response.json()) as {
        ok?: boolean;
        error?: string;
        message?: string;
      };
      if (!response.ok || result.ok !== true) {
        throw new Error(result.error || "AI provider test failed.");
      }
      setAiNotice(result.message || "AI provider is ready.");
    } catch (cause) {
      setAiError(
        cause instanceof Error ? cause.message : "AI provider test failed.",
      );
    } finally {
      setAiTesting(false);
    }
  }

  async function saveAiProviderConnection() {
    if (
      aiBusy ||
      !aiForm.provider ||
      !aiForm.model ||
      (aiForm.provider !== "local" && !aiForm.apiKey.trim())
    ) {
      return;
    }
    setAiBusy(true);
    setAiError("");
    setAiNotice("");
    try {
      const response = await fetch("/api/ai/providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: aiForm.provider,
          model: aiForm.model,
          apiKey: aiForm.apiKey,
          endpointUrl: aiForm.endpointUrl,
          active: true,
        }),
        cache: "no-store",
      });
      const result = (await response.json()) as {
        ok?: boolean;
        error?: string;
        message?: string;
      };
      if (!response.ok || result.ok !== true) {
        throw new Error(result.error || "AI provider could not be saved.");
      }
      setAiForm((current) => ({ ...current, apiKey: "" }));
      setAiNotice(result.message || "AI provider saved.");
      await loadAiProviders();
    } catch (cause) {
      setAiError(
        cause instanceof Error ? cause.message : "AI provider could not be saved.",
      );
    } finally {
      setAiBusy(false);
    }
  }

  async function deleteAiProviderConfig(providerId: string) {
    if (!providerId || aiBusy) return;
    setAiBusy(true);
    setAiError("");
    try {
      const response = await fetch(`/api/ai/providers?id=${encodeURIComponent(providerId)}`, {
        method: "DELETE",
        cache: "no-store",
      });
      const result = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || result.ok !== true) {
        throw new Error(result.error || "AI provider could not be removed.");
      }
      setAiNotice("AI provider removed.");
      await loadAiProviders();
    } catch (cause) {
      setAiError(
        cause instanceof Error ? cause.message : "AI provider could not be removed.",
      );
    } finally {
      setAiBusy(false);
    }
  }

  function clearCache() {
    try {
      localStorage.removeItem("cheya-media-view");
      setCleared(true);
      setNotice("");
      window.setTimeout(() => setCleared(false), 1800);
    } catch {
      setNotice("Cache lokal tidak dapat dihapus di browser ini.");
    }
  }

  async function revokeDevice() {
    if (!revokingDevice || revokeBusy) return;
    setRevokeBusy(true);
    setDeviceError("");
    setRevokeError("");
    try {
      const response = await fetch("/api/session/blacklist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uid: Number(uid),
          deviceId: revokingDevice.deviceId,
        }),
      });
      const result = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !result.ok) {
        throw new Error(
          result.error === "unknown_device"
            ? "Perangkat tersebut sudah tidak terdaftar."
            : "Sesi perangkat tidak dapat dihentikan.",
        );
      }
      const current = revokingDevice.deviceId === currentDeviceId;
      setDevices((items) =>
        items.filter((item) => item.deviceId !== revokingDevice.deviceId),
      );
      setRevokingDevice(null);
      if (current) {
        window.location.replace("/blocked");
      }
    } catch (cause) {
      setRevokeError(
        cause instanceof Error
          ? cause.message
          : "Sesi perangkat tidak dapat dihentikan.",
      );
    } finally {
      setRevokeBusy(false);
    }
  }

  async function logoutOtherSessions() {
    if (logoutOthersBusy) return;
    setLogoutOthersBusy(true);
    setLogoutOthersError("");
    try {
      const response = await fetch("/api/session/logout-others", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
        cache: "no-store",
      });
      const result = (await response.json()) as { ok?: boolean };
      if (!response.ok || !result.ok) {
        throw new Error(
          response.status === 401
            ? "Sesi masuk tidak valid. Muat ulang halaman dan masuk kembali."
            : "Sesi lain tidak dapat dihentikan. Silakan coba kembali.",
        );
      }
      setLogoutOthersOpen(false);
      setLogoutOthersNotice(
        "Sesi lain telah dihentikan. Sesi ini tetap aktif.",
      );
    } catch (cause) {
      setLogoutOthersError(
        cause instanceof Error
          ? cause.message
          : "Sesi lain tidak dapat dihentikan. Silakan coba kembali.",
      );
    } finally {
      setLogoutOthersBusy(false);
    }
  }

  async function deleteAccount() {
    if (deleteText !== DELETE_CONFIRMATION || deleteBusy) return;
    setDeleteBusy(true);
    setNotice("");
    try {
      const response = await fetch("/api/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation: deleteText }),
        cache: "no-store",
      });
      const result = (await response.json()) as {
        ok?: boolean;
        storageCleanupFailed?: number;
      };
      if (!response.ok || !result.ok) {
        throw new Error(
          response.status === 401
            ? "Sesi perangkat tidak valid. Masuk kembali, lalu coba lagi."
            : "Akun tidak dapat dihapus. Silakan coba kembali.",
        );
      }
      setDeleteOpen(false);
      setDeleteText("");
      setNotice(
        result.storageCleanupFailed
          ? `Akun telah dihapus. ${result.storageCleanupFailed} file Telegram gagal dibersihkan.`
          : "Akun dan data web telah dihapus. Anda akan diarahkan ke halaman masuk.",
      );
      window.setTimeout(() => {
        window.location.replace("/login");
      }, 3500);
    } catch (cause) {
      setNotice(
        cause instanceof Error ? cause.message : "Akun tidak dapat dihapus.",
      );
      setDeleteBusy(false);
    }
  }

  const tabs: Array<{ id: Tab; label: string; icon: React.ReactNode }> = [
    { id: "general", label: "Account", icon: <Globe size={16} /> },
    { id: "security", label: "Devices & Security", icon: <Shield size={16} /> },
    { id: "data", label: "Data", icon: <Database size={16} /> },
    { id: "github", label: "GitHub", icon: <Github size={16} /> },
    { id: "about", label: "About", icon: <Layers size={16} /> },
  ];

  return (
    <>
      {tab === "overview" && (
        <nav aria-label="Settings pages" className="animate-fade-up">
          <p className="mb-3 px-1 text-[11px] font-semibold uppercase tracking-[.12em] text-ink-mute">
            Your settings
          </p>
          <div className="divide-y divide-slate-100">
            {tabs.map((item) => (
              <Link
                key={item.id}
                href={`/${uid}/profile/settings?tab=${item.id}`}
                className="group flex min-h-[76px] items-center gap-4 py-4 transition-colors active:bg-slate-50"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#f2f3f7] text-ink-soft transition-colors group-hover:bg-[#e9eaf1]">
                  {item.icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-semibold tracking-[-.01em] text-ink">
                    {item.label}
                  </span>
                  <span className="mt-1 block text-[12px] leading-relaxed text-ink-mute">
                    {item.id === "general" && "Account information and display name"}
                    {item.id === "security" && "Connected devices and active sessions"}
                    {item.id === "data" && "Manage locally stored app data"}
                    {item.id === "github" && "Connect or manage your GitHub account"}
                    {item.id === "about" && "App version and product information"}
                  </span>
                </span>
                <ChevronRight size={18} className="shrink-0 text-ink-mute transition-transform group-hover:translate-x-0.5" />
              </Link>
            ))}
          </div>
        </nav>
      )}

      {tab !== "overview" && notice && !deleteOpen && (
        <p
          role="status"
          className="mb-4 rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-[12px] leading-relaxed text-amber-800"
        >
          {notice}
        </p>
      )}

      {tab === "general" && (
        <div
          id="settings-panel-general"
          className="animate-fade-up space-y-5"
        >
          <SettingsSection title="Account">
            {accountLoading ? (
              <p className="px-3 py-4 text-[12px] text-ink-mute">Loading account details…</p>
            ) : accountError ? (
              <p role="alert" className="px-3 py-4 text-[12px] text-danger">{accountError}</p>
            ) : account ? (
              <>
                <Row
                  icon={<Smartphone size={17} />}
                  title="Telegram ID"
                  value={String(account.telegramId)}
                />
                <Row
                  icon={<Globe size={17} />}
                  title="Telegram username"
                  value={account.username ? `@${account.username}` : "Not set"}
                />
                <Row
                  icon={<Calendar size={17} />}
                  title="Account created"
                  value={account.createdAt ? formatDate(account.createdAt) : "Date unavailable"}
                  last
                />
              </>
            ) : null}
          </SettingsSection>
          <SettingsSection title="Display name">
            <div className="px-3 py-4">
              <label htmlFor="account-display-name" className="block text-[12px] font-medium text-ink-soft">
                Name shown in your CheyaVerse profile
              </label>
              <input
                id="account-display-name"
                value={displayName}
                onChange={(event) => {
                  setDisplayName(event.target.value);
                  setAccountNotice("");
                }}
                maxLength={40}
                autoComplete="nickname"
                placeholder={account?.firstName || "Use your Telegram name"}
                disabled={accountLoading || accountBusy}
                className="mt-2 w-full rounded-xl border border-line bg-[#fafafa] px-3.5 py-3 text-[13px] text-ink outline-none transition focus:border-ink/30 focus:bg-white disabled:opacity-60"
              />
              <p className="mt-2 text-[11px] leading-relaxed text-ink-mute">
                This only changes your name in CheyaVerse. Your Telegram profile stays unchanged.
              </p>
              {accountError && !accountLoading && (
                <p role="alert" className="mt-3 text-[12px] text-danger">{accountError}</p>
              )}
              {accountNotice && (
                <p role="status" className="mt-3 text-[12px] text-emerald-700">{accountNotice}</p>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void saveDisplayName()}
                  disabled={accountBusy || accountLoading || !displayName.trim() || displayName.length > 40}
                  className="inline-flex items-center gap-2 rounded-xl bg-ink px-4 py-2.5 text-[12px] font-semibold text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Save size={14} />
                  {accountBusy ? "Saving…" : "Save name"}
                </button>
                <button
                  type="button"
                  onClick={() => void resetDisplayName()}
                  disabled={accountBusy || accountLoading || !displayName}
                  className="inline-flex items-center gap-2 rounded-xl border border-line bg-white px-4 py-2.5 text-[12px] font-semibold text-ink-soft transition hover:bg-[#fafafa] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <RotateCcw size={14} />
                  Reset
                </button>
              </div>
            </div>
          </SettingsSection>
        </div>
      )}

      {tab === "security" && (
        <div
          id="settings-panel-security"
          className="animate-fade-up space-y-5"
        >
          <div className="flex items-start justify-between gap-4 px-3">
            <div>
              <h2 className="text-[11.5px] font-semibold uppercase tracking-[.08em] text-ink-mute">
                Devices & Security
              </h2>
              <p className="mt-1 text-[12px] leading-relaxed text-ink-mute">
                Sesi aktif tetap tercatat hingga Anda menghentikannya. Perangkat yang dicabut tidak dapat digunakan untuk masuk kembali.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void loadDevices()}
              disabled={devicesLoading}
              className="shrink-0 rounded-full border border-line bg-white px-3 py-1.5 text-[11px] font-semibold text-ink-soft disabled:opacity-50"
            >
              {devicesLoading ? "Loading…" : "Refresh"}
            </button>
          </div>
          {deviceError && (
            <p role="alert" className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-[12px] text-danger">
              {deviceError}
            </p>
          )}
          <section className="rounded-[22px] border border-line bg-white p-4 shadow-[0_8px_32px_-28px_rgba(15,23,42,.38)] sm:flex sm:items-center sm:justify-between sm:gap-5">
            <div className="flex items-start gap-3">
              <div className="min-w-0">
                <h3 className="text-[13px] font-semibold text-ink">
                  Sign out other sessions
                </h3>
                <p className="mt-1 text-[11.5px] leading-relaxed text-ink-mute">
                  Hentikan sesi lain pada akun Anda. Sesi ini akan tetap aktif.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setLogoutOthersError("");
                setLogoutOthersNotice("");
                setLogoutOthersOpen(true);
              }}
              className="mt-3 w-full rounded-full border border-red-100 bg-red-50 px-4 py-2.5 text-[11.5px] font-semibold text-danger transition-colors hover:bg-red-100 sm:mt-0 sm:w-auto sm:shrink-0"
            >
              Sign out other sessions
            </button>
            {logoutOthersNotice && (
              <p role="status" className="mt-3 text-[11px] leading-relaxed text-emerald-700 sm:mt-0 sm:basis-full">
                {logoutOthersNotice}
              </p>
            )}
          </section>
          <div className="space-y-2.5">
            {devices.map((device) => {
              const current = device.deviceId === currentDeviceId;
              const name = [device.brand, device.model]
                .filter((part, index, values) => part && values.indexOf(part) === index)
                .join(" ") || device.type || "Perangkat";
              return (
                <article
                  key={device.deviceId}
                  className="rounded-[22px] border border-line bg-white p-4 shadow-[0_8px_32px_-28px_rgba(15,23,42,.38)]"
                >
                  <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[15px] bg-[#f1f2f8] text-[#626b9d]">
                      <Smartphone size={19} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <h3 className="truncate text-[13px] font-semibold text-ink">{name}</h3>
                        {current && (
                          <span className="rounded-full bg-[#eef1ff] px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[#59649f]">
                            This device
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-[11px] text-ink-mute">
                        {[
                          device.os,
                          device.browserVersion
                            ? `${device.browser ?? "Browser"} ${device.browserVersion}`
                            : device.browser,
                        ]
                          .filter(Boolean)
                          .join(" · ") || "Detail perangkat tidak tersedia."}
                      </p>
                      <p className="mt-1 text-[10px] leading-relaxed text-ink-mute">
                        {[
                          device.screen ? `Screen ${device.screen}` : null,
                          device.viewport ? `view ${device.viewport}` : null,
                          device.pixelRatio ? `DPR ${device.pixelRatio}×` : null,
                          device.orientation,
                          device.cpuCores ? `${device.cpuCores} cores` : null,
                          device.ramGb ? `${device.ramGb} GB RAM` : null,
                          device.architecture,
                          device.bitness ? `${device.bitness}-bit` : null,
                          device.colorGamut,
                          device.networkType,
                        ]
                          .filter(Boolean)
                          .join(" · ") || "Detail perangkat tambahan tidak tersedia."}
                      </p>
                      <p className="mt-1 text-[10px] text-ink-mute">
                        {[device.language, device.timezone]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                      <p className="mt-2 text-[10.5px] text-ink-mute">
                        Last active · {formatDate(device.lastSeen)}
                      </p>
                      <p className="mt-1 font-mono text-[10px] text-ink-mute">
                        Device ID · {device.deviceId}
                      </p>
                    </div>
                    <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-500" title="Session active" />
                  </div>
                  <div className="mt-3 flex items-center justify-between border-t border-[#f0f0f2] pt-3">
                    <span className="text-[10px] font-medium text-emerald-700">
                      Active
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setRevokeError("");
                        setRevokingDevice(device);
                      }}
                      className="rounded-full px-3 py-1.5 text-[11px] font-semibold text-danger transition-colors hover:bg-red-50"
                    >
                      Revoke session
                    </button>
                  </div>
                </article>
              );
            })}
            {!devicesLoading && !deviceError && devices.length === 0 && (
              <div className="rounded-[22px] border border-line bg-white px-4 py-8 text-center text-[12px] text-ink-mute">
                Belum ada perangkat yang terdaftar.
              </div>
            )}
            {devicesLoading && devices.length === 0 && (
              <div role="status" className="rounded-[22px] border border-line bg-white px-4 py-8 text-center text-[12px] text-ink-mute">
                Loading devices…
              </div>
            )}
          </div>
          <SettingsSection title="Danger Zone">
            <div className="p-4">
              <p className="text-[13px] font-semibold text-ink">Delete web account</p>
              <p className="mt-1 text-[11.5px] leading-relaxed text-ink-mute">
                Profil dan data web Anda akan dihapus. Salinan pesan yang sudah tersimpan di percakapan akun lain tetap tersedia bagi pemiliknya.
              </p>
              <button
                type="button"
                onClick={() => {
                  setDeleteText("");
                  setDeleteOpen(true);
                }}
                className="mt-4 inline-flex items-center gap-2 rounded-full border border-red-100 bg-red-50 px-4 py-2.5 text-[12px] font-semibold text-danger transition-colors hover:bg-red-100"
              >
                <Trash2 size={15} />
                Delete account
              </button>
            </div>
          </SettingsSection>
        </div>
      )}

      {tab === "data" && (
        <div
          id="settings-panel-data"
          className="animate-fade-up space-y-5"
        >
          <SettingsSection title="On this device">
            <Row
              icon={<Trash2 size={17} />}
              title="Clear local cache"
              subtitle="Menghapus preferensi tampilan media pada perangkat ini."
              action={
                <button
                  type="button"
                  onClick={clearCache}
                  className={`text-[12px] font-semibold transition-colors ${cleared ? "text-emerald-700" : "text-ink-soft hover:text-ink"}`}
                >
                  {cleared ? (
                    <span className="inline-flex items-center gap-1">
                      <Check size={13} strokeWidth={2.4} /> Done
                    </span>
                  ) : "Clear"}
                </button>
              }
            />
          </SettingsSection>
        </div>
      )}

      {tab === "github" && (
        <div id="settings-panel-github" className="animate-fade-up space-y-5">
          <SettingsSection title="GitHub projects">
            <div className="p-4">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[15px] bg-[#f2f3f5] text-ink">
                  <Github size={20} />
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="text-[13px] font-semibold text-ink">
                    {githubConnected
                      ? `Connected as @${githubLogin}`
                      : githubNeedsReconnect
                        ? "Reconnect GitHub"
                        : "Connect GitHub"}
                  </h3>
                  <p className="mt-1 text-[11.5px] leading-relaxed text-ink-mute">
                    Token digunakan untuk membaca repositori yang dapat diakses
                    akun GitHub ini. Token dienkripsi saat disimpan dan
                    tidak ditampilkan kembali ke browser.
                  </p>
                </div>
              </div>

              {!githubEncryptionConfigured &&
                githubEncryptionStatus !== "checking" && (
                <p role="alert" className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[11px] leading-relaxed text-amber-900">
                  {githubEncryptionStatus === "invalid"
                    ? "Server GitHub belum dikonfigurasi dengan benar. Atur GITHUB_TOKEN_ENCRYPTION_KEY sebagai Base64 dari 32 byte acak pada environment deployment, lalu deploy ulang."
                    : githubEncryptionStatus === "unavailable"
                      ? "Status konfigurasi enkripsi server tidak dapat diperiksa. Coba muat ulang halaman; token tetap dinonaktifkan demi keamanan."
                      : "Ini bukan masalah fatal pada aplikasi atau token Classic; hanya integrasi GitHub yang dinonaktifkan. Di Vercel Project Settings → Environment Variables, tambahkan GITHUB_TOKEN_ENCRYPTION_KEY dengan nilai hasil `openssl rand -base64 32` untuk Production dan Preview, lalu redeploy. Simpan key yang sama secara permanen di semua instance; menggantinya dapat membuat token tersimpan tidak bisa dibaca."}
                </p>
              )}
              {githubError && (
                <p role="alert" className="mt-4 rounded-xl border border-red-100 bg-red-50 px-3 py-2.5 text-[11px] leading-relaxed text-danger">
                  {githubError}
                </p>
              )}
              {githubNeedsReconnect && !githubError && (
                <p role="alert" className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[11px] leading-relaxed text-amber-950">
                  Token tersimpan tidak dapat dibuka dengan kunci enkripsi server saat ini. Masukkan ulang token GitHub untuk memperbaiki koneksi; token lama tidak ditampilkan.
                </p>
              )}
              {githubNotice && (
                <p role="status" className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2.5 text-[11px] text-emerald-800">
                  {githubNotice}
                </p>
              )}

              {githubConnected && (
                <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-[11px] text-ink-mute">
                    {githubLoading
                      ? "Checking connection…"
                      : `Connected as @${githubLogin ?? "GitHub user"}.`}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={githubBusy}
                      onClick={() => setGithubReplaceOpen((open) => !open)}
                      className="rounded-full border border-line bg-white px-4 py-2.5 text-[11.5px] font-semibold text-ink-soft disabled:opacity-50"
                    >
                      {githubReplaceOpen ? "Cancel replacement" : "Replace token"}
                    </button>
                    <button
                      type="button"
                      disabled={githubBusy}
                      onClick={() => void disconnectGitHub()}
                      className="rounded-full border border-red-100 bg-red-50 px-4 py-2.5 text-[11.5px] font-semibold text-danger disabled:opacity-50"
                    >
                      {githubBusy ? "Removing…" : "Disconnect"}
                    </button>
                  </div>
                </div>
              )}
              {githubConnected && githubScopes !== null && (
                <p className="mt-2 break-words text-[10px] leading-relaxed text-ink-mute">
                  Classic token scopes reported by GitHub:{" "}
                  {githubScopes || "none"}.
                </p>
              )}

              {(!githubConnected || githubReplaceOpen) && (
                <form
                  className="mt-4"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void connectGitHub();
                  }}
                >
                  <label htmlFor="github-token" className="mb-1.5 block text-[11px] font-semibold text-ink-soft">
                    {githubConnected ? "Replacement personal access token" : "Personal access token"}
                  </label>
                  <input
                    id="github-token"
                    type="password"
                    value={githubToken}
                    onChange={(event) => setGithubToken(event.target.value)}
                    autoComplete="new-password"
                    spellCheck={false}
                    maxLength={512}
                    placeholder="github_pat_… or ghp_…"
                    disabled={!githubEncryptionConfigured || githubBusy}
                    className="w-full rounded-2xl border border-line bg-[#fafafa] px-4 py-3 text-[12px] text-ink outline-none placeholder:text-ink-mute focus:border-[#a5a5a5] disabled:opacity-50"
                  />
                  <p className="mt-2 text-[10.5px] leading-relaxed text-ink-mute">
                    Read-only access is recommended: repository metadata and
                    contents, Actions, deployments, and repository traffic if
                    available. Prefer a fine-grained token limited to selected
                    repositories. For a classic token, the <code>repo</code>{" "}
                    scope is required for private repositories; <code>public_repo</code>{" "}
                    only exposes public repositories. Organization repositories
                    may also require SSO authorization for the token.
                  </p>
                  <button
                    type="submit"
                    disabled={!githubEncryptionConfigured || githubBusy || !githubToken.trim()}
                    className="mt-4 w-full rounded-2xl bg-ink px-4 py-3 text-[12px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45 sm:w-auto"
                  >
                    {githubBusy ? "Verifying token…" : githubConnected ? "Replace token" : "Connect GitHub"}
                  </button>
                </form>
              )}
            </div>
          </SettingsSection>
          <SettingsSection title="AI assistants">
            <div className="p-4">
              <p className="text-[11.5px] leading-relaxed text-ink-mute">
                Pilih provider, masukkan API key, lalu muat daftar model provider untuk memilih model dari dropdown. Sistem mencoba provider aktif berurutan dan berpindah ke provider berikutnya jika salah satu gagal.
              </p>
              {aiError && (
                <p role="alert" className="mt-3 rounded-xl border border-red-100 bg-red-50 px-3 py-2.5 text-[11px] text-danger">
                  {aiError}
                </p>
              )}
              {aiNotice && (
                <p role="status" className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2.5 text-[11px] text-emerald-800">
                  {aiNotice}
                </p>
              )}

              <div className="mt-4 grid min-w-0 gap-3 sm:grid-cols-2">
                <label className="block text-[11px] font-semibold text-ink-soft">
                  Provider
                  <span className="relative mt-1.5 block">
                    <select
                      value={aiForm.provider}
                      onChange={(event) => {
                        setAiModels([]);
                        setAiForm((current) => ({
                          ...current,
                          provider: event.target.value,
                          model: "",
                          apiKey: "",
                        }));
                      }}
                      className="h-12 w-full min-w-0 appearance-none truncate rounded-2xl border border-line bg-white px-4 pr-11 text-[12px] font-medium text-ink shadow-sm outline-none transition focus:border-violet-300 focus:ring-4 focus:ring-violet-100"
                    >
                      {aiProviderOptions.map((provider) => (
                        <option key={provider.value} value={provider.value}>
                          {provider.label}
                        </option>
                      ))}
                    </select>
                    <ChevronDown
                      size={16}
                      aria-hidden="true"
                      className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-ink-mute"
                    />
                  </span>
                </label>
                <div className="block min-w-0 text-[11px] font-semibold text-ink-soft">
                  <label htmlFor="ai-model">Model</label>
                  <div className="mt-1.5 flex min-w-0 gap-2">
                    <span className="relative min-w-0 flex-1">
                      <select
                        id="ai-model"
                        value={aiForm.model}
                        onChange={(event) =>
                          setAiForm((current) => ({ ...current, model: event.target.value }))
                        }
                        disabled={aiModelsLoading || aiModels.length === 0}
                        className="h-12 w-full min-w-0 appearance-none truncate rounded-2xl border border-line bg-white px-4 pr-11 text-[12px] font-medium text-ink shadow-sm outline-none transition focus:border-violet-300 focus:ring-4 focus:ring-violet-100 disabled:cursor-not-allowed disabled:bg-[#f5f5f7] disabled:text-ink-mute"
                      >
                        <option value="">
                          {aiModelsLoading
                            ? "Loading models…"
                            : aiModels.length
                              ? "Select a model"
                              : "Load models first"}
                        </option>
                        {aiModels.map((model) => (
                          <option key={model.id} value={model.id}>
                            {model.name === model.id
                              ? model.id
                              : `${model.name} · ${model.id}`}
                          </option>
                        ))}
                      </select>
                      <ChevronDown
                        size={16}
                        aria-hidden="true"
                        className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-ink-mute"
                      />
                    </span>
                    <button
                      type="button"
                      onClick={() => void loadAiModels()}
                      disabled={aiModelsLoading || aiTesting || aiBusy}
                      className="shrink-0 rounded-2xl border border-line bg-white px-3 text-[10.5px] font-semibold text-ink-soft shadow-sm transition hover:border-violet-200 hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {aiModelsLoading ? "Loading…" : aiModels.length ? "Refresh" : "Load"}
                    </button>
                  </div>
                  <p className="mt-1.5 min-h-4 text-[10px] font-normal text-ink-mute">
                    {aiModels.length
                      ? `${aiModels.length} models available`
                      : "Load the models available to this provider"}
                  </p>
                </div>
              </div>

              {aiForm.provider === "local" && (
                <>
                  <label className="mt-3 block text-[11px] font-semibold text-ink-soft">
                    Local OpenAI-compatible base URL
                    <input
                      value={aiForm.endpointUrl}
                      onChange={(event) => {
                        setAiModels([]);
                        setAiForm((current) => ({
                          ...current,
                          endpointUrl: event.target.value,
                          model: "",
                        }));
                      }}
                      placeholder="http://localhost:11434/v1"
                      inputMode="url"
                      autoComplete="url"
                      className="mt-1.5 w-full rounded-2xl border border-line bg-[#fafafa] px-3 py-2.5 text-[12px] text-ink outline-none placeholder:text-ink-mute focus:border-[#a5a5a5]"
                    />
                  </label>
                  <p className="mt-1.5 text-[10.5px] leading-relaxed text-amber-800">
                    Local requests run from the CheyaVerse server and are restricted to localhost/loopback for safety. A deployed server cannot reach localhost on your phone or computer; use this with a self-hosted CheyaVerse server running beside your local model (for example Ollama).
                  </p>
                </>
              )}

              <label className="mt-3 block text-[11px] font-semibold text-ink-soft">
                API key{aiForm.provider === "local" ? " (optional)" : ""}
                <input
                  type="password"
                  value={aiForm.apiKey}
                  onChange={(event) => {
                    setAiModels([]);
                    setAiForm((current) => ({
                    ...current,
                    apiKey: event.target.value,
                    model: "",
                    }));
                  }}
                  placeholder={aiForm.provider === "local" ? "Optional endpoint key" : "Provider API key"}
                  className="mt-1.5 w-full rounded-2xl border border-line bg-[#fafafa] px-3 py-2.5 text-[12px] text-ink outline-none placeholder:text-ink-mute focus:border-[#a5a5a5]"
                />
              </label>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void testAiProviderConnection()}
                  disabled={aiTesting || aiBusy || !aiForm.provider || !aiForm.model || !aiForm.apiKey.trim()}
                  className="rounded-full border border-line bg-white px-4 py-2.5 text-[11.5px] font-semibold text-ink-soft disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {aiTesting ? "Testing…" : "Test connection"}
                </button>
                <button
                  type="button"
                  onClick={() => void saveAiProviderConnection()}
                  disabled={aiBusy || aiTesting || !aiForm.provider || !aiForm.model || !aiForm.apiKey.trim()}
                  className="rounded-full bg-ink px-4 py-2.5 text-[11.5px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {aiBusy ? "Saving…" : "Save provider"}
                </button>
              </div>

              {aiProviders.length > 0 && (
                <div className="mt-5 space-y-2">
                  <p className="text-[10.5px] font-semibold uppercase tracking-[.08em] text-ink-mute">
                    Saved providers
                  </p>
                  {aiProviders.map((provider, index) => (
                    <div
                      key={provider.id}
                      className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-[#fafafa] px-3 py-2.5"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 text-[12px] font-semibold text-ink">
                          <span className="capitalize">{provider.provider}</span>
                          <span className="rounded-full border border-slate-200 bg-white px-1.5 py-0.5 text-[9px] font-semibold text-ink-mute">
                            API key {index === 0 ? "· newest" : `· ${index + 1}`}
                          </span>
                          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[.08em] text-emerald-700">
                            {provider.active ? "Active" : "Paused"}
                          </span>
                        </div>
                        <p className="mt-0.5 text-[10.5px] text-ink-mute">{provider.model}</p>
                        {provider.lastError && (
                          <p className="mt-1 text-[9.5px] text-danger">Last error: {provider.lastError}</p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => void deleteAiProviderConfig(provider.id)}
                        className="shrink-0 rounded-full border border-red-100 bg-red-50 px-3 py-1.5 text-[10.5px] font-semibold text-danger"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </SettingsSection>

          {isConfiguredAdmin && (
            <SettingsSection title="Telegram AI memory">
              <div className="p-4">
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[15px] bg-violet-50 text-violet-700">
                    <Database size={19} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-[13px] font-semibold text-ink">
                      Import older Telegram history
                    </h3>
                    <p className="mt-1 text-[11px] leading-relaxed text-ink-mute">
                      Telegram Bot API tidak dapat mengambil pesan sebelum bot mulai menerimanya. Impor JSON dari Telegram Desktop agar teks pesan lama bisa dicari dan dipakai sebagai konteks AI.
                    </p>
                  </div>
                </div>

                {telegramHistoryError && (
                  <p role="alert" className="mt-3 rounded-xl border border-red-100 bg-red-50 px-3 py-2.5 text-[11px] text-danger">
                    {telegramHistoryError}
                  </p>
                )}
                {telegramHistoryNotice && (
                  <p role="status" className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2.5 text-[11px] text-emerald-800">
                    {telegramHistoryNotice}
                  </p>
                )}

                <label className="mt-4 block text-[11px] font-semibold text-ink-soft">
                  Destination Telegram group/channel
                  <select
                    value={telegramHistoryGroupId}
                    onChange={(event) => setTelegramHistoryGroupId(event.target.value)}
                    disabled={telegramHistoryLoading || telegramHistoryBusy || telegramHistoryGroups.length === 0}
                    className="mt-1.5 h-11 w-full rounded-2xl border border-line bg-white px-3 text-[12px] text-ink outline-none focus:border-violet-300 disabled:opacity-60"
                  >
                    <option value="">
                      {telegramHistoryLoading
                        ? "Loading your enabled groups…"
                        : telegramHistoryGroups.length
                          ? "Select a group"
                          : "No enabled groups are configured"}
                    </option>
                    {telegramHistoryGroups.map((group) => (
                      <option key={group.groupId} value={String(group.groupId)}>
                        {group.groupTitle || `Telegram group ${group.groupId}`}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="mt-3 block text-[11px] font-semibold text-ink-soft">
                  Telegram Desktop JSON export
                  <input
                    type="file"
                    accept=".json,application/json"
                    disabled={telegramHistoryBusy || !telegramHistoryGroupId}
                    onChange={(event) => {
                      const file = event.currentTarget.files?.[0];
                      event.currentTarget.value = "";
                      if (file) void importTelegramHistoryFile(file);
                    }}
                    className="mt-1.5 block w-full cursor-pointer rounded-2xl border border-dashed border-line bg-[#fafafa] px-3 py-3 text-[11px] text-ink-soft file:mr-3 file:rounded-full file:border-0 file:bg-ink file:px-3 file:py-2 file:text-[10px] file:font-semibold file:text-white disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </label>
                <p className="mt-2 text-[10px] leading-relaxed text-ink-mute">
                  Pilih export chat/channel Telegram Desktop berformat JSON (maks. 50 MiB). Pemilahan pesan dilakukan di browser; hanya teks dan penanda jenis media yang dikirim untuk disimpan. File media tidak diunggah. Pesan yang pengirimnya tidak dapat dicocokkan dengan akun admin atau bot akan dilewati.
                </p>
                {telegramBotUid === null && (
                  <p className="mt-2 text-[10px] leading-relaxed text-amber-800">
                    Identitas bot belum tersedia dari konfigurasi server; pesan admin masih bisa diimpor, tetapi balasan bot tidak akan ikut terpilih.
                  </p>
                )}
                {telegramHistoryProgress && (
                  <p role="status" className="mt-3 text-[11px] font-medium text-violet-700">
                    {telegramHistoryProgress}
                  </p>
                )}
              </div>
            </SettingsSection>
          )}

          <p className="px-3 text-[10.5px] leading-relaxed text-ink-mute">
            Revoke the token on GitHub at any time. Disconnecting here deletes
            the encrypted token from this CheyaVerse account.
          </p>
        </div>
      )}

      {tab === "about" && (
        <div
          id="settings-panel-about"
          className="animate-fade-up space-y-5"
        >
          <SettingsSection title="About CheyaVerse">
            <div className="px-4 py-5 sm:px-5">
              <h2 className="max-w-[28rem] text-[17px] font-semibold leading-snug tracking-tight text-ink">
                A personal space connected to Telegram
              </h2>
              <p className="mt-3 max-w-[34rem] text-[13px] leading-[1.7] text-ink-soft">
                CheyaVerse links your Telegram account to a private dashboard for your media, conversations, and connected GitHub projects.
              </p>
            </div>
          </SettingsSection>
          <SettingsSection title="What you can do">
            <Row
              icon={<Smartphone size={17} />}
              title="Use your Telegram account"
              subtitle="Sign in with your Telegram identity"
            />
            <Row
              icon={<Globe size={17} />}
              title="Manage personal media"
              subtitle="View and organize your uploaded media"
            />
            <Row
              icon={<Github size={17} />}
              title="Explore GitHub projects"
              subtitle="Connect GitHub to view your repositories"
              last
            />
          </SettingsSection>
        </div>
      )}

      {revokingDevice && (
        <Dialog
          title="Revoke this device session?"
          description={`Perangkat ${revokingDevice.brand ?? ""} ${revokingDevice.model ?? ""} akan kehilangan akses ke akun ini.`}
          confirmLabel={revokeBusy ? "Revoking…" : "Continue"}
          busy={revokeBusy}
          error={revokeError}
          onCancel={() => setRevokingDevice(null)}
          onConfirm={() => void revokeDevice()}
        />
      )}

      {logoutOthersOpen && (
        <Dialog
          title="Sign out of other sessions?"
          description="Sesi ini akan tetap aktif. Semua sesi lain harus masuk kembali untuk mengakses akun."
          confirmLabel={logoutOthersBusy ? "Signing out…" : "Continue"}
          busy={logoutOthersBusy}
          error={logoutOthersError}
          onCancel={() => setLogoutOthersOpen(false)}
          onConfirm={() => void logoutOtherSessions()}
        />
      )}

      {deleteOpen && (
        <div className="fixed inset-0 z-[140] flex items-end justify-center bg-black/45 p-3 backdrop-blur-[3px] sm:items-center sm:p-5">
          <section
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-account-title"
            data-hide-bot-launcher="true"
            data-report-anchor="above-dialog"
            data-report-resume-align="true"
            className="w-full max-w-[420px] animate-fade-up rounded-[28px] border border-white/70 bg-white p-5 shadow-[0_24px_80px_-24px_rgba(0,0,0,.35)] sm:p-6"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="delete-account-title" className="text-[18px] font-bold tracking-tight text-ink">
                  Delete account permanently?
                </h2>
                <p className="mt-2 text-[12px] leading-relaxed text-ink-soft">
                  Profil, perangkat, notifikasi, media, dan data akun web akan dihapus. Pesan dalam percakapan akun lain tetap tersedia bagi pemiliknya. Tindakan ini tidak dapat dibatalkan.
                </p>
              </div>
              <button
                type="button"
                aria-label="Close confirmation"
                disabled={deleteBusy}
                onClick={() => setDeleteOpen(false)}
                className="rounded-full p-1.5 text-ink-mute hover:bg-[#f4f4f5]"
              >
                <X size={17} />
              </button>
            </div>
            <label htmlFor="delete-account-confirmation" className="mt-5 block text-[11px] font-semibold text-ink-soft">
              Ketik <span className="font-mono text-danger">{DELETE_CONFIRMATION}</span> untuk mengonfirmasi penghapusan akun.
            </label>
            <input
              id="delete-account-confirmation"
              value={deleteText}
              onChange={(event) => setDeleteText(event.target.value)}
              autoComplete="off"
              spellCheck={false}
              className="mt-2 w-full rounded-2xl border border-line bg-[#fafafa] px-4 py-3 text-[13px] text-ink outline-none focus:border-danger"
            />
            {notice && (
              <p role="alert" className="mt-3 rounded-xl bg-red-50 px-3 py-2.5 text-[11px] text-danger">
                {notice}
              </p>
            )}
            <div className="mt-5 grid grid-cols-2 gap-2.5">
              <button
                type="button"
                disabled={deleteBusy}
                onClick={() => setDeleteOpen(false)}
                className="rounded-2xl border border-line bg-white px-4 py-3 text-[12px] font-semibold text-ink-soft hover:bg-[#f8f8f8] disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleteBusy || deleteText !== DELETE_CONFIRMATION}
                onClick={() => void deleteAccount()}
                className="rounded-2xl bg-danger px-4 py-3 text-[12px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
              >
                {deleteBusy ? "Deleting…" : "Delete account"}
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}

function SettingsSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="mb-2 px-3 text-[11.5px] font-semibold uppercase tracking-[.08em] text-ink-mute">
        {title}
      </h2>
      <div className="overflow-hidden rounded-[22px] border border-line bg-white shadow-[0_8px_32px_-28px_rgba(15,23,42,.38)]">
        {children}
      </div>
    </section>
  );
}

function Row({
  icon,
  title,
  subtitle,
  value,
  action,
  last,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  value?: string;
  action?: React.ReactNode;
  last?: boolean;
}) {
  return (
    <div
      className={`relative flex min-h-[56px] items-center gap-3.5 px-4 py-[14px] ${
        last
          ? ""
          : "before:absolute before:bottom-0 before:left-[46px] before:right-0 before:h-px before:bg-divider"
      }`}
    >
      <span className="flex h-5 w-5 shrink-0 items-center justify-center text-ink-soft">
        {icon}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="min-w-0 text-[14px] leading-snug tracking-[-.005em] text-ink">
          {title}
        </span>
        {subtitle && (
          <span className="whitespace-normal break-words text-[11.5px] leading-relaxed text-ink-mute">
            {subtitle}
          </span>
        )}
      </span>
      {action ? (
        <span className="shrink-0">{action}</span>
      ) : value !== undefined ? (
        <span className="shrink-0 text-[12px] text-ink-soft">{value}</span>
      ) : null}
    </div>
  );
}

function Dialog({
  title,
  description,
  confirmLabel,
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  busy: boolean;
  error: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[140] flex items-end justify-center bg-black/45 p-3 backdrop-blur-[3px] sm:items-center sm:p-5">
      <section
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="revoke-session-title"
        className="w-full max-w-[380px] animate-fade-up rounded-[28px] border border-white/70 bg-white p-5 shadow-[0_24px_80px_-24px_rgba(0,0,0,.35)] sm:p-6"
      >
        <h2 id="revoke-session-title" className="text-[18px] font-bold tracking-tight text-ink">
          {title}
        </h2>
        <p className="mt-2 text-[12px] leading-relaxed text-ink-soft">{description}</p>
        {error && (
          <p role="alert" className="mt-3 rounded-xl bg-red-50 px-3 py-2.5 text-[11px] text-danger">
            {error}
          </p>
        )}
        <div className="mt-6 grid grid-cols-2 gap-2.5">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="rounded-2xl border border-line px-4 py-3 text-[12px] font-semibold text-ink-soft hover:bg-[#f8f8f8] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className="rounded-2xl bg-danger px-4 py-3 text-[12px] font-semibold text-white hover:opacity-90 disabled:opacity-60"
          >
            {confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
