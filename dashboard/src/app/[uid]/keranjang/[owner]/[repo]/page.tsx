import { notFound } from "next/navigation";
import { GitHubProjectDashboard } from "./GitHubProjectDashboard";

export const dynamic = "force-dynamic";

function isValidSegment(value: string): boolean {
  return /^[A-Za-z0-9_.-]{1,100}$/.test(value) && value !== "." && value !== "..";
}

export default function GitHubProjectPage({
  params,
}: {
  params: { uid: string; owner: string; repo: string };
}) {
  const uid = Number(params.uid);
  if (
    !Number.isSafeInteger(uid) ||
    uid <= 0 ||
    !isValidSegment(params.owner) ||
    !isValidSegment(params.repo)
  ) {
    notFound();
  }

  return (
    <GitHubProjectDashboard
      uid={params.uid}
      owner={params.owner}
      repo={params.repo}
    />
  );
}
