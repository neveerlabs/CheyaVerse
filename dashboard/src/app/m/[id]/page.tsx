import { notFound, redirect } from "next/navigation";
import { cookies } from "next/headers";
import { fetchMedia } from "@/lib/storage";
import { getUserSessionFromToken } from "@/lib/auth-request";
import { SESSION_COOKIE_NAME } from "@/lib/session-token";
import ViewerClient from "@/app/[uid]/m/[id]/ViewerClient";

export const dynamic = "force-dynamic";
const MEDIA_ID_RE = /^\d{7}$/;

export async function generateMetadata({
  params,
}: {
  params: { id: string };
}) {
  if (!MEDIA_ID_RE.test(params.id)) return { title: "CheyaVerse Media" };
  const session = await getUserSessionFromToken(
    cookies().get(SESSION_COOKIE_NAME)?.value,
  );
  if (!session) return { title: "CheyaVerse Media" };
  const meta = await fetchMedia(params.id);
  const fn = meta?.owner_id === session.uid
    ? meta.filename
    : "CheyaVerse Media";
  return { title: `${fn} · CheyaVerse` };
}

export default async function PublicViewerPage({
  params,
}: {
  params: { id: string };
}) {
  if (!MEDIA_ID_RE.test(params.id)) notFound();

  const session = await getUserSessionFromToken(
    cookies().get(SESSION_COOKIE_NAME)?.value,
  );
  if (!session) redirect("/login");

  const meta = await fetchMedia(params.id);
  if (!meta?.storage_path || meta.owner_id !== session.uid) notFound();

  return (
    <ViewerClient
      mediaId={params.id}
      signedUrl={`/api/media/${params.id}/content`}
      filename={meta.filename || params.id}
      contentType={meta.content_type || ""}
      ownerId={meta.owner_id ?? undefined}
    />
  );
}
