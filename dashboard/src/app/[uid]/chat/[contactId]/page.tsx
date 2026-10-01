// src/app/[uid]/chat/[contactId]/page.tsx
import { notFound } from "next/navigation";
import {
  listNotifications,
  listMessages,
  getTelegramUser,
  listDirectMessages,
  markDirectMessagesRead,
} from "@/lib/storage";
import { broadcastToUid } from "@/lib/realtime";
import { config } from "@/lib/config";
import { ChatRoomClient } from "./ChatRoomClient";
import { DirectChatRoomClient } from "./DirectChatRoomClient";

export const dynamic = "force-dynamic";

export default async function ChatRoomPage({
  params,
}: {
  params: { uid: string; contactId: string };
}) {
  const uid = Number(params.uid);
  if (!Number.isInteger(uid) || uid <= 0) notFound();
  if (params.contactId !== "system") {
    const contactUid = Number(params.contactId);
    if (
      !Number.isSafeInteger(contactUid) ||
      contactUid <= 0 ||
      contactUid === uid
    ) {
      notFound();
    }
    const contact = await getTelegramUser(contactUid);
    if (!contact) notFound();
    const [messages, currentUser] = await Promise.all([
      listDirectMessages(uid, contactUid),
      getTelegramUser(uid),
    ]);
    const firstUnreadMessage = messages.find(
      (message) =>
        message.sender_uid === contactUid &&
        message.recipient_uid === uid &&
        message.read_at === null &&
        message.deleted_at === null,
    );
    const firstUnreadId = firstUnreadMessage?.id ?? null;
    const ownName = currentUser
      ? [currentUser.first_name, currentUser.last_name]
          .filter(Boolean)
          .join(" ")
          .trim() ||
        currentUser.username ||
        "Anda"
      : "Anda";
    const readAt = await markDirectMessagesRead(uid, contactUid);
    if (readAt) {
      broadcastToUid(contactUid, {
        type: "direct-message:read",
        uid,
        read_at: readAt,
      });
      broadcastToUid(uid, {
        type: "direct-message:read",
        uid: contactUid,
        read_at: readAt,
      });
    }
    return (
      <DirectChatRoomClient
        uid={params.uid}
        contact={{
          uid: contact.uid,
          username: contact.username,
          first_name: contact.first_name,
          last_name: contact.last_name,
          photo_url: contact.photo_url,
          role: contact.role,
        }}
        ownPhotoUrl={currentUser?.photo_url ?? null}
        ownName={ownName}
        contactIsAdmin={config.adminTelegramIds.has(contact.uid)}
        firstUnreadId={firstUnreadId}
        initialMessages={messages}
      />
    );
  }

  let notifications: Awaited<ReturnType<typeof listNotifications>> = [];
  let messages: Awaited<ReturnType<typeof listMessages>> = [];
  let user: Awaited<ReturnType<typeof getTelegramUser>> = null;
  let initialDataUnavailable = false;
  try {
    const [n, m, u] = await Promise.all([
      listNotifications(uid, 200),
      listMessages(uid, 500),
      getTelegramUser(uid),
    ]);
    notifications = n;
    messages = m;
    user = u;
  } catch (error) {
    initialDataUnavailable = true;
    console.error("[chat/system] initial data load failed:", error);
  }

  return (
    <>
      {initialDataUnavailable && (
        <p
          role="status"
          className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-950"
        >
          Data chat belum dapat dimuat dari server. Pesan yang terlihat mungkin
          belum lengkap; coba muat ulang saat koneksi pulih.
        </p>
      )}
      <ChatRoomClient
        uid={params.uid}
        notifications={notifications}
        initialMessages={messages}
        user={user}
      />
    </>
  );
}