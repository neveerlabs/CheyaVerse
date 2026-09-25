import { notFound } from "next/navigation";
import { fetchMedia } from "@/lib/storage";
import ViewerClient from "./ViewerClient";

export const dynamic = "force-dynamic";
const MEDIA_ID_RE = /^\d{7}$/;

export default async function ViewerPage({
  params,
}: {
  params: { uid: string; id: string };
}) {
  const uid = Number(params.uid);
  if (!Number.isInteger(uid) || uid <= 0) notFound();
  if (!MEDIA_ID_RE.test(params.id)) notFound();

  const meta = await fetchMedia(params.id).catch(() => null);
  if (!meta?.storage_path) notFound();

  return (
    <ViewerClient
      uid={params.uid}
      mediaId={params.id}
      signedUrl={`/api/media/${params.id}/content`}
      filename={meta.filename || params.id}
      contentType={meta.content_type || ""}
    />
  );
}