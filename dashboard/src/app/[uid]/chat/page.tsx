import { notFound } from "next/navigation";
import Link from "next/link";
import {
  countUnreadNotifications,
  listMessages,
} from "@/lib/storage";
import { Search } from "lucide-react";
import { VerifiedName } from "@/components/VerifiedName";

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

  const [unread, messages] = await Promise.all([
    countUnreadNotifications(uid),
    listMessages(uid, 500),
  ]);

  const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;

  const hasUnread = unread > 0;
  const lastIso = lastMessage?.created_at ?? "";
  const lastPreview = lastMessage ? previewText(lastMessage.content) : "";
  const hasMessage = Boolean(lastMessage);

  const displayName = "CheyaVerse";

  return (
    <>
      <header className="-mx-2 pt-[calc(12px+env(safe-area-inset-top))] pb-4 animate-fade-up">
        <div className="flex items-center gap-3 px-4 h-12 rounded-full bg-[#f5f5f5] focus-within:bg-[#efefef] transition-colors">
          <Search size={18} className="text-ink-mute flex-shrink-0" strokeWidth={2} />
          <input
            type="text"
            inputMode="text"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            enterKeyHint="search"
            placeholder="Cari chat"
            className="flex-1 min-w-0 bg-transparent text-ink text-[14px] outline-none
                       placeholder:text-ink-mute font-[inherit] tracking-[-.005em]"
          />
        </div>
      </header>

      <section className="animate-fade-up">
        <Link
          href={`/${uid}/chat/system`}
          className="flex items-center gap-3 -ml-2 pr-1 py-3 transition-opacity active:opacity-60"
        >
          <div className="relative w-12 h-12 flex-shrink-0">
            <div className="w-12 h-12 rounded-full overflow-hidden bg-[#f0f0f0] border border-line">
              <img
                src="/icon.png"
                alt=""
                draggable={false}
                className="w-full h-full object-cover"
              />
            </div>
            {hasUnread && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[20px] h-[20px] px-1 rounded-full bg-danger text-white text-[10.5px] font-bold flex items-center justify-center tabular-nums shadow-[0_0_0_2px_#fff]">
                {unread > 99 ? "99+" : unread}
              </span>
            )}
          </div>

          <div className="flex-1 min-w-0 flex flex-col gap-1">
            <VerifiedName
              name={displayName}
              size="lg"
              nameClassName={hasUnread ? "font-bold" : "font-semibold"}
            />
            {hasMessage && (
              <span
                className={`text-[12.5px] truncate ${
                  hasUnread ? "text-ink-soft font-medium" : "text-ink-mute"
                }`}
              >
                {lastPreview}
              </span>
            )}
          </div>

          <div className="flex-shrink-0 flex flex-col items-end justify-center gap-1 min-h-[36px]">
            {lastIso && (
              <span
                className={`text-[11px] tabular-nums ${
                  hasUnread ? "text-ink-soft font-semibold" : "text-ink-mute"
                }`}
              >
                {formatTimeShort(lastIso)}
              </span>
            )}
            {hasUnread && hasMessage && (
              <span className="w-1.5 h-1.5 rounded-full bg-danger" />
            )}
          </div>
        </Link>
      </section>
    </>
  );
}
