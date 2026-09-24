import { notFound } from "next/navigation";
import { listNotifications } from "@/lib/storage";
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

  let items: Awaited<ReturnType<typeof listNotifications>> = [];
  try {
    items = await listNotifications(uid, 200);
  } catch {}

  return <ChatRoomClient uid={params.uid} items={items} />;
}