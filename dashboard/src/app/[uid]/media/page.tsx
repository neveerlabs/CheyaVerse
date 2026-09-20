import { notFound } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { listRecentMedia, createSignedUrl } from "@/lib/storage";
import { getViewPreferenceServer } from "@/lib/view-preference";
import { MediaClient } from "./MediaClient";

export const dynamic = "force-dynamic";

export default async function MediaPage({ params }: { params: { uid: string } }) {
  const uid = Number(params.uid);
  if (!Number.isInteger(uid) || uid <= 0) notFound();

  const initialView = getViewPreferenceServer();

  let raw: Awaited<ReturnType<typeof listRecentMedia>> = [];
  try { raw = await listRecentMedia(uid, 50); } catch {}

  const items = await Promise.all(
    raw.map(async (m) => {
      const url = await createSignedUrl(m.storage_path, 3600);
      return {
        id: m.id,
        filename: m.filename || m.id,
        content_type: m.content_type || "",
        expires_at: m.expires_at,
        thumbnailUrl: url,
      };
    }),
  );

  return (
    <>
      <AppHeader title="Media" subtitle={`${items.length} file terbaru`} />
      <MediaClient uid={params.uid} items={items} initialView={initialView} />
    </>
  );
}