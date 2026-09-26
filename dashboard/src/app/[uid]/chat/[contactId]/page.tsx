// src/app/[uid]/chat/[contactId]/page.tsx
import { notFound } from "next/navigation";
import {
  listNotifications,
  listMessages,
  getTelegramUser,
  listDirectMessages,
  markDirectMessagesRead,
} from "@/lib/storage";
import { ChatRoomClient } from "./ChatRoomClient";
import { DirectChatRoomClient } from "./DirectChatRoomClient";
import { broadcastToUid } from "@/lib/realtime";

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
    const messages = await listDirectMessages(uid, contactUid);
    await markDirectMessagesRead(uid, contactUid);
    broadcastToUid(contactUid, { type: "direct-message:read", uid });
    return (
      <DirectChatRoomClient
        uid={params.uid}
        contact={{
          uid: contact.uid,
          username: contact.username,
          first_name: contact.first_name,
          last_name: contact.last_name,
          photo_url: contact.photo_url,
        }}
        initialMessages={messages}
      />
    );
  }

  let notifications: Awaited<ReturnType<typeof listNotifications>> = [];
  let messages: Awaited<ReturnType<typeof listMessages>> = [];
  let user: Awaited<ReturnType<typeof getTelegramUser>> = null;
  try {
    const [n, m, u] = await Promise.all([
      listNotifications(uid, 200),
      listMessages(uid, 500),
      getTelegramUser(uid),
    ]);
    notifications = n;
    messages = m;
    user = u;
  } catch {}

  return (
    <ChatRoomClient
      uid={params.uid}
      notifications={notifications}
      initialMessages={messages}
      user={user}
    />
  );
}