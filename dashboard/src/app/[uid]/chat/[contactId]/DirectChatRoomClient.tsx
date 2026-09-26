"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, Send, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRealtime } from "@/lib/use-realtime";
import type { DirectMessage, TelegramUser } from "@/lib/storage";

type ChatContact = Pick<
  TelegramUser,
  "uid" | "username" | "first_name" | "last_name" | "photo_url"
>;

function userName(user: ChatContact): string {
  const fullName = [user.first_name, user.last_name].filter(Boolean).join(" ").trim();
  return fullName || (user.username ? `@${user.username}` : `Telegram ${user.uid}`);
}

function messageTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}

export function DirectChatRoomClient({
  uid,
  contact,
  initialMessages,
}: {
  uid: string;
  contact: ChatContact;
  initialMessages: DirectMessage[];
}) {
  const router = useRouter();
  const [messages, setMessages] = useState(initialMessages);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const myUid = Number(uid);
  const name = userName(contact);

  useEffect(() => setMessages(initialMessages), [initialMessages]);

  useRealtime(uid, (event) => {
    if (event.type === "direct-message:new") {
      const incoming = event.message as DirectMessage | undefined;
      if (
        !incoming ||
        !(
          (incoming.sender_uid === myUid && incoming.recipient_uid === contact.uid) ||
          (incoming.sender_uid === contact.uid && incoming.recipient_uid === myUid)
        )
      ) {
        return;
      }
      setMessages((current) =>
        current.some((message) => message.id === incoming.id)
          ? current.map((message) =>
              message.id === incoming.id ? { ...message, ...incoming } : message,
            )
          : [...current, incoming].sort((a, b) =>
              a.created_at.localeCompare(b.created_at),
            ),
      );
      if (incoming.recipient_uid === myUid) {
        void fetch(`/api/chats/${contact.uid}`, { cache: "no-store" })
          .then((response) => {
            if (!response.ok) throw new Error(`Read receipt failed: ${response.status}`);
            router.refresh();
          })
          .catch((error) => {
            console.error("[direct-chat] failed to mark incoming messages as read:", error);
          });
      }
      return;
    }
    if (event.type === "direct-message:read" && event.uid === contact.uid) {
      router.refresh();
    }
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);

  async function sendMessage() {
    const content = text.trim();
    if (!content || sending) return;
    setSending(true);
    setText("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    try {
      const response = await fetch(`/api/chats/${contact.uid}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const result = await response.json();
      if (!response.ok || result?.ok !== true) {
        setText(content);
        throw new Error("Pesan gagal dikirim. Silakan coba lagi.");
      }
      const saved = result.message as DirectMessage;
      setMessages((current) =>
        current.some((message) => message.id === saved.id)
          ? current
          : [...current, saved].sort((a, b) =>
              a.created_at.localeCompare(b.created_at),
            ),
      );
    } catch (error) {
      setText(content);
      console.error("[direct-chat] send failed:", error);
      window.alert(
        error instanceof Error ? error.message : "Pesan gagal dikirim.",
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <header className="fixed left-0 right-0 top-0 z-40 border-b border-line bg-white/95 pt-[calc(8px+env(safe-area-inset-top))] pb-2 backdrop-blur">
        <div className="mx-auto flex h-12 max-w-[600px] items-center gap-2 px-5">
          <Link
            href={`/${uid}/chat`}
            aria-label="Kembali ke chat"
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-ink-soft"
          >
            <ChevronLeft size={21} />
          </Link>
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border border-line bg-[#f5f5f5]">
            {contact.photo_url ? (
              <img
                src={contact.photo_url}
                alt=""
                className="h-full w-full object-cover"
                draggable={false}
              />
            ) : (
              <UserRound size={18} className="text-ink-mute" />
            )}
          </div>
          <div className="min-w-0">
            <div className="truncate text-[14px] font-semibold text-ink">{name}</div>
            {contact.username && (
              <div className="truncate text-[11px] text-ink-mute">
                @{contact.username}
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto flex min-h-screen max-w-[600px] flex-col px-5 pb-[calc(76px+env(safe-area-inset-bottom))] pt-[calc(76px+env(safe-area-inset-top))]">
        {messages.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center py-20 text-center">
            <p className="mb-1 text-[14px] font-medium text-ink">Belum ada pesan</p>
            <p className="text-[12.5px] text-ink-mute">
              Mulai percakapan dengan {name}.
            </p>
          </div>
        ) : (
          <div className="flex flex-1 flex-col gap-2">
            {messages.map((message) => {
              const mine = message.sender_uid === myUid;
              return (
                <div
                  key={message.id}
                  className={`flex ${mine ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[84%] rounded-2xl px-3 py-2 ${
                      mine
                        ? "rounded-tr-md bg-ink text-white"
                        : "rounded-tl-md bg-[#f2f2f2] text-ink"
                    }`}
                  >
                    <p className="whitespace-pre-wrap break-words text-[13.5px] leading-[1.45]">
                      {message.content}
                    </p>
                    <div
                      className={`mt-1 text-right text-[10px] ${
                        mine ? "text-white/65" : "text-ink-mute"
                      }`}
                    >
                      {messageTime(message.created_at)}
                      {mine && message.read_at ? " · Dibaca" : ""}
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>
        )}
      </main>

      <form
        className="fixed bottom-0 left-0 right-0 z-30 border-t border-line bg-white px-3 pb-[calc(8px+env(safe-area-inset-bottom))] pt-2"
        onSubmit={(event) => {
          event.preventDefault();
          void sendMessage();
        }}
      >
        <div className="mx-auto flex max-w-[600px] items-end gap-2">
          <textarea
            ref={textareaRef}
            rows={1}
            value={text}
            onChange={(event) => setText(event.target.value)}
            onInput={(event) => {
              event.currentTarget.style.height = "auto";
              event.currentTarget.style.height = `${Math.min(event.currentTarget.scrollHeight, 120)}px`;
            }}
            placeholder="Pesan"
            className="max-h-[120px] min-h-10 flex-1 resize-none rounded-2xl border border-line bg-white px-3 py-2 text-[14px] leading-5 outline-none"
          />
          <button
            type="submit"
            disabled={!text.trim() || sending}
            aria-label="Kirim pesan"
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-ink text-white disabled:opacity-40"
          >
            <Send size={17} />
          </button>
        </div>
      </form>
    </>
  );
}
