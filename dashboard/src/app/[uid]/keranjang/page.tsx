import { notFound, redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function LegacyProjectsPage({
  params,
}: {
  params: { uid: string };
}) {
  const uid = Number(params.uid);
  if (!Number.isInteger(uid) || uid <= 0) notFound();
  redirect(`/${uid}/project`);
}