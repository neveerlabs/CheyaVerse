import { notFound } from "next/navigation";
import { getTelegramChatInfo } from "@/lib/telegram";
import {
  getStats,
  listRecentMedia,
  getCover,
  getTelegramUser,
} from "@/lib/storage";
import { ProfileClient } from "./ProfileClient";

export const dynamic = "force-dynamic";

export default async function ProfilePage({
  params,
}: {
  params: { uid: string };
}) {
  const uid = Number(params.uid);
  if (!Number.isInteger(uid) || uid <= 0) notFound();

  const [account, cover] = await Promise.all([
    getTelegramUser(uid),
    getCover(uid).catch(() => null),
  ]);
  const info = account
    ? {
        id: account.uid,
        first_name: account.first_name ?? undefined,
        last_name: account.last_name ?? undefined,
        username: account.username ?? undefined,
        photo_url: account.photo_url ?? undefined,
      }
    : await getTelegramChatInfo(uid).catch(() => null);

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
      cover={cover}
    />
  );
}