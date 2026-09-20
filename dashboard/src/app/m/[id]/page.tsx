import { notFound } from "next/navigation";
import { fetchMedia, createSignedUrl } from "@/lib/storage";
import { config } from "@/lib/config";
import ViewerClient from "@/app/[uid]/m/[id]/ViewerClient";

export const dynamic = "force-dynamic";
const MEDIA_ID_RE = /^\d{7}$/;

export async function generateMetadata({
  params,
}: {
  params: { id: string };
}) {
  if (!MEDIA_ID_RE.test(params.id)) return { title: "CheyaVerse Media" };
  const meta = await fetchMedia(params.id).catch(() => null);
  const fn = meta?.filename ?? "CheyaVerse Media";
  return { title: `${fn} · CheyaVerse` };
}

export default async function PublicViewerPage({
  params,
}: {
  params: { id: string };
}) {
  if (!MEDIA_ID_RE.test(params.id)) notFound();

  const meta = await fetchMedia(params.id).catch(() => null);
  if (!meta?.storage_path) notFound();

  const signedUrl = await createSignedUrl(meta.storage_path, config.signedUrlTtl);
  if (!signedUrl) notFound();

  return (
    <ViewerClient
      mediaId={params.id}
      signedUrl={signedUrl}
      filename={meta.filename || params.id}
      contentType={meta.content_type || ""}
    />
  );
}