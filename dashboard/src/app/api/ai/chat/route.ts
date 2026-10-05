import { NextRequest, NextResponse } from "next/server";
import { getUserSession, hasValidSameOrigin } from "@/lib/auth-request";
import { config } from "@/lib/config";
import { generateAiReply } from "@/lib/ai";
import { loadAiGitHubContext } from "@/lib/ai-github-context";
import {
  createMessage,
  getChatMessage,
  getTelegramUser,
  listMessages,
} from "@/lib/storage";
import { broadcastToUid } from "@/lib/realtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!hasValidSameOrigin(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

  const session = await getUserSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const replyToId =
    typeof body?.replyToId === "string" ? body.replyToId.trim() : "";
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(replyToId)) {
    return NextResponse.json({ error: "A valid message to reply to is required." }, { status: 400 });
  }
  const sourceMessage = await getChatMessage(session.uid, replyToId);
  if (
    !sourceMessage ||
    sourceMessage.sender !== "user" ||
    sourceMessage.deleted_at
  ) {
    return NextResponse.json({ error: "The message to reply to was not found." }, { status: 404 });
  }

  let reply: string;
  let provider: string | null = null;
  let model: string | null = null;
  let inputTokens: number | null = null;
  let outputTokens: number | null = null;
  let replyToIdForResponse: string | null = null;
  let isError = false;
  try {
    const [recentMessages, telegramUser] = await Promise.all([
      listMessages(session.uid, 500),
      getTelegramUser(session.uid),
    ]);
    const availableMessages = recentMessages.filter((item) => !item.deleted_at);
    const history = availableMessages
      .slice(-50)
      .map((item) => {
        const speaker = item.sender === "user"
          ? "User"
          : item.sender_role === "ai"
            ? "CheyaVerse"
            : "CheyaVerse system bot";
        const deviceInfo = item.sender === "user"
          ? ` [sender_device_id=${item.sender_device_id ?? "tidak tercatat"}]`
          : "";
        return `[message_id=${item.id}]${deviceInfo} ${speaker}: ${item.content.slice(0, 700)}`;
      })
      .join("\n");
    const telegramName =
      [telegramUser?.first_name, telegramUser?.last_name]
        .filter(Boolean)
        .join(" ")
        .trim() || "Nama Telegram tidak tersedia";
    const userIdentity = [
      `Nama lengkap Telegram: ${telegramName}`,
      `Username Telegram: ${telegramUser?.username ? `@${telegramUser.username}` : "tidak diatur"}`,
      `ID akun Telegram: ${session.uid}`,
      `Device ID sesi saat ini: ${session.deviceId ?? "tidak tersedia"}`,
      `Role akun CheyaVerse tersimpan: ${telegramUser?.role ?? "tidak tersedia"}`,
      `Izin administrator untuk broadcast bot Telegram: ${config.adminTelegramIds.has(session.uid) ? "ya" : "tidak"}`,
    ].join("\n");
    const optionalContext =
      typeof body?.contextText === "string"
        ? body.contextText.trim().slice(0, 4000)
        : "";
    const githubContext = await loadAiGitHubContext(
      session.uid,
      sourceMessage.content,
    ).catch((error) => {
      console.error("[ai/chat] GitHub repository context could not be loaded:", error);
      return "GitHub context could not be loaded for this request. Do not infer repository details.";
    });
    const contextText = [
      `Informasi akun pengguna (privat, hanya untuk percakapan akun ini):\n${userIdentity}`,
      `Riwayat chat untuk konteks dan pilihan balasan:\n${history || "(Belum ada riwayat pesan tersimpan.)"}`,
      githubContext,
      optionalContext,
    ].filter(Boolean).join("\n\n");
    const result = await generateAiReply(
      session.uid,
      sourceMessage.content,
      contextText || undefined,
    );
    reply = result.reply.trim();
    provider = result.provider;
    model = result.model;
    inputTokens = result.inputTokens;
    outputTokens = result.outputTokens;
    if (!reply) {
      throw new Error("Model mengembalikan jawaban kosong.");
    }
    const replyDirective = reply.match(
      /^\[\[CHEYA_REPLY_TO:([A-Za-z0-9_-]{1,80})\]\][ \t]*(?:\r?\n|$)/,
    );
    if (replyDirective) {
      const requestedReplyId = replyDirective[1];
      if (availableMessages.some((item) => item.id === requestedReplyId)) {
        replyToIdForResponse = requestedReplyId;
      }
      reply = reply.slice(replyDirective[0].length).trim();
    }
    if (!reply) {
      throw new Error("Model mengembalikan jawaban kosong.");
    }
  } catch (error) {
    isError = true;
    inputTokens = null;
    outputTokens = null;
    replyToIdForResponse = sourceMessage.id;
    const detail =
      error instanceof Error
        ? error.message
        : "Layanan AI sedang tidak tersedia.";
    reply = `Maaf, Cheya tidak dapat memproses pesan ini. ${detail}`.slice(0, 2000);
  }

  const now = new Date().toISOString();
  const message = await createMessage({
    uid: session.uid,
    sender: "bot",
    sender_role: "ai",
    title: "CheyaVerse",
    content: reply,
    delivered_at: now,
    read_at: now,
    reply_to_id: replyToIdForResponse,
    ai_input_tokens: inputTokens,
    ai_output_tokens: outputTokens,
  });
  if (!message) {
    return NextResponse.json(
      { ok: false, error: "AI reply could not be saved to chat history." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
  try {
    await broadcastToUid(session.uid, { type: "message:new", message });
  } catch (error) {
    console.error("[ai/chat] failed to broadcast saved AI reply:", error);
  }
  return NextResponse.json(
    { ok: true, message, isError, provider, model },
    { headers: { "Cache-Control": "no-store" } },
  );
}
