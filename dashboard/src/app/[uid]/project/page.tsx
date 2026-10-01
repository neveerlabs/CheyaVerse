import { notFound } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { GitHubProjectsClient } from "../keranjang/GitHubProjectsClient";

export const dynamic = "force-dynamic";

export default function ProjectsPage({
  params,
}: {
  params: { uid: string };
}) {
  const uid = Number(params.uid);
  if (!Number.isInteger(uid) || uid <= 0) notFound();

  return (
    <>
      <AppHeader title="Projects" subtitle="GitHub repositories and project activity" />
      <GitHubProjectsClient uid={params.uid} />
    </>
  );
}
