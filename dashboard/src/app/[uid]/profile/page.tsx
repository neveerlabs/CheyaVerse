import { notFound } from "next/navigation";
import { getTelegramChatInfo } from "@/lib/telegram";
import { getStats, listRecentMedia } from "@/lib/storage";
import { ProfileClient } from "./ProfileClient";

export const dynamic = "force-dynamic";

export default async function ProfilePage({
  params,
}: {
  params: { uid: string };
}) {
  const uid = Number(params.uid);
  if (!Number.isInteger(uid) || uid <= 0) notFound();

  const info = await getTelegramChatInfo(uid).catch(() => null);
  let stats = { total: 0, active: 0, expired: 0 };
  try {
    stats = await getStats(uid);
  } catch {}

  let raw: Awaited<ReturnType<typeof listRecentMedia>> = [];
  try {
    raw = await listRecentMedia(uid, 9);
  } catch {}

  const media = raw.map((m) => ({
    id: m.id,
    filename: m.filename || m.id,
    content_type: m.content_type || "",
    expires_at: m.expires_at,
    thumbnailUrl: `/api/media/${m.id}/content`,
  }));

  return (
    <ProfileClient
      uid={params.uid}
      info={info}
      stats={stats}
      media={media}
    />
  );
}