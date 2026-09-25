// src/app/[uid]/chat/[contactId]/page.tsx
import { notFound } from "next/navigation";
import {
  listNotifications,
  listMessages,
  getTelegramUser,
} from "@/lib/storage";
import { ChatRoomClient } from "./ChatRoomClient";

export const dynamic = "force-dynamic";

export default async function ChatRoomPage({
  params,
}: {
  params: { uid: string; contactId: string };
}) {
  const uid = Number(params.uid);
  if (!Number.isInteger(uid) || uid <= 0) notFound();
  if (params.contactId !== "system") notFound();

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