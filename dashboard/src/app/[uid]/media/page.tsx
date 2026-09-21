import { notFound } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { listRecentMedia } from "@/lib/storage";
import { getViewPreferenceServer } from "@/lib/view-preference";
import { MediaClient } from "./MediaClient";

export const dynamic = "force-dynamic";

export default async function MediaPage({ params }: { params: { uid: string } }) {
  const uid = Number(params.uid);
  if (!Number.isInteger(uid) || uid <= 0) notFound();

  const initialView = getViewPreferenceServer();

  let raw: Awaited<ReturnType<typeof listRecentMedia>> = [];
  try {
    raw = await listRecentMedia(uid, 50);
  } catch {}

  const items = raw.map((m) => ({
    id: m.id,
    filename: m.filename || m.id,
    content_type: m.content_type || "",
    expires_at: m.expires_at,
    thumbnailUrl: `/api/media/${m.id}/content`,
  }));

  return (
    <>
      <AppHeader title="Media" subtitle={`${items.length} file terbaru`} />
      <MediaClient uid={params.uid} items={items} initialView={initialView} />
    </>
  );
}
