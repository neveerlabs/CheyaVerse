import { notFound, redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function AboutPage({
  params,
}: {
  params: { uid: string };
}) {
  const uid = Number(params.uid);
  if (!Number.isInteger(uid) || uid <= 0) notFound();
  redirect(`/${params.uid}/profile/settings?tab=about`);
}
