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
  const raw = await listRecentMedia(uid, 50);

  const items = raw.map((m) => ({
    id: m.id,
    filename: m.filename || m.id,
    content_type: m.content_type || "",
    expires_at: m.expires_at,
    thumbnailUrl: `/api/media/${m.id}/content`,
  }));

  return (
    <>
      <AppHeader title="Media" subtitle={`${items.length} latest files`} />
      <MediaClient uid={params.uid} items={items} initialView={initialView} />
    </>
  );
}