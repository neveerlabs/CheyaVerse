import { notFound } from "next/navigation";
import Link from "next/link";
import {
  countUnreadNotifications,
  listDirectConversations,
  listMessages,
} from "@/lib/storage";
import { VerifiedName } from "@/components/VerifiedName";
import { ChatSearch } from "./ChatSearch";

export const dynamic = "force-dynamic";

function formatTimeShort(iso: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    const now = new Date();
    const sameDay =
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate();
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    if (sameDay) return `${hh}:${mm}`;
    const dd = String(d.getDate()).padStart(2, "0");
    const mo = String(d.getMonth() + 1).padStart(2, "0");
    const yy = String(d.getFullYear()).slice(2);
    return `${dd}/${mo}/${yy}`;
  } catch {
    return "";
  }
}

function previewText(text: string, max = 70): string {
  const flat = text.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  return flat.slice(0, max).trimEnd() + "…";
}

export default async function ChatListPage({
  params,
}: {
  params: { uid: string };
}) {
  const uid = Number(params.uid);
  if (!Number.isInteger(uid) || uid <= 0) notFound();

  const [unread, messages, conversations] = await Promise.all([
    countUnreadNotifications(uid),
    listMessages(uid, 500),
    listDirectConversations(uid),
  ]);

  const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;

  const hasUnread = unread > 0;
  const lastIso = lastMessage?.created_at ?? "";
  const lastPreview = lastMessage ? previewText(lastMessage.content) : "";
  const hasMessage = Boolean(lastMessage);

  const displayName = "CheyaVerse";
  const sortedConversations = [...conversations].sort(
    (left, right) => {
      const leftTime = Date.parse(left.last_message.created_at);
      const rightTime = Date.parse(right.last_message.created_at);
      return (Number.isFinite(rightTime) ? rightTime : 0) -
        (Number.isFinite(leftTime) ? leftTime : 0);
    },
  );
  const chatEntries = [
    { kind: "system" as const, timestamp: lastIso },
    ...sortedConversations.map((conversation) => ({
      kind: "direct" as const,
      timestamp: conversation.last_message.created_at,
      conversation,
    })),
  ].sort((left, right) => {
    const leftTime = Date.parse(left.timestamp);
    const rightTime = Date.parse(right.timestamp);
    return (Number.isFinite(rightTime) ? rightTime : 0) -
      (Number.isFinite(leftTime) ? leftTime : 0);
  });

  return (
    <>
      <header className="relative z-50 -mx-2 pt-[calc(12px+env(safe-area-inset-top))] pb-4 animate-fade-up">
        <ChatSearch uid={String(uid)} />
      </header>

      <section className="relative z-0 animate-fade-up">
        {chatEntries.map((entry) => {
          if (entry.kind === "system") {
            return (
              <Link
                key="system"
                href={`/${uid}/chat/system`}
                className="flex items-center gap-3 -ml-2 pr-1 py-3 transition-opacity active:opacity-60"
              >
                <div className="relative h-12 w-12 flex-shrink-0">
                  <div className="h-12 w-12 overflow-hidden rounded-full border border-line bg-[#f0f0f0]">
                    <img src="/icon.png" alt="" draggable={false} className="h-full w-full object-cover" />
                  </div>
                  {hasUnread && (
                    <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1 text-[10.5px] font-bold tabular-nums text-white shadow-[0_0_0_2px_#fff]">
                      {unread > 99 ? "99+" : unread}
                    </span>
                  )}
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <VerifiedName
                    name={displayName}
                    size="lg"
                    nameClassName={hasUnread ? "font-bold" : "font-semibold"}
                  />
                  {hasMessage && (
                    <span className={`truncate text-[12.5px] ${hasUnread ? "font-medium text-ink-soft" : "text-ink-mute"}`}>
                      {lastPreview}
                    </span>
                  )}
                </div>
                <div className="flex min-h-[36px] flex-shrink-0 flex-col items-end justify-center gap-1">
                  {lastIso && (
                    <span className={`text-[11px] tabular-nums ${hasUnread ? "font-semibold text-ink-soft" : "text-ink-mute"}`}>
                      {formatTimeShort(lastIso)}
                    </span>
                  )}
                  {hasUnread && hasMessage && <span className="h-1.5 w-1.5 rounded-full bg-danger" />}
                </div>
              </Link>
            );
          }
          const conversation = entry.conversation;
          const contact = conversation.user;
          const name =
            [contact.first_name, contact.last_name].filter(Boolean).join(" ").trim() ||
            (contact.username ? `@${contact.username}` : `Telegram ${contact.uid}`);
          return (
            <Link
              key={contact.uid}
              href={`/${uid}/chat/${contact.uid}`}
              className="flex items-center gap-3 -ml-2 pr-1 py-3 transition-opacity active:opacity-60"
            >
              <div className="h-12 w-12 flex-shrink-0 overflow-hidden rounded-full border border-line bg-[#f0f0f0]">
                <img
                  src={contact.photo_url || `/api/avatar/${contact.uid}`}
                  alt=""
                  draggable={false}
                  className="h-full w-full object-cover"
                />
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <span className={`truncate text-[14px] text-ink ${conversation.unread ? "font-bold" : "font-semibold"}`}>
                  {name}
                </span>
                <span className={`truncate text-[12.5px] ${conversation.unread ? "font-medium text-ink-soft" : "text-ink-mute"}`}>
                  {previewText(
                    conversation.last_message.deleted_at
                      ? "Pesan dihapus"
                      : conversation.last_message.content,
                  )}
                </span>
              </div>
              <div className="flex min-h-[36px] flex-shrink-0 flex-col items-end justify-center gap-1">
                <span className={`text-[11px] tabular-nums ${conversation.unread ? "font-semibold text-ink-soft" : "text-ink-mute"}`}>
                  {formatTimeShort(conversation.last_message.created_at)}
                </span>
                {conversation.unread > 0 && (
                  <span className="min-w-5 h-5 rounded-full bg-danger px-1 text-[10.5px] font-bold text-white flex items-center justify-center">
                    {conversation.unread > 99 ? "99+" : conversation.unread}
                  </span>
                )}
              </div>
            </Link>
          );
        })}
      </section>
    </>
  );
}
