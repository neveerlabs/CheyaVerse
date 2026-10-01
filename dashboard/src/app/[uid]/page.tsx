import { notFound } from "next/navigation";
import { GitHubHomeDashboard } from "./GitHubHomeDashboard";

export const dynamic = "force-dynamic";

export default function HomePage({ params }: { params: { uid: string } }) {
  const uid = Number(params.uid);
  if (!Number.isSafeInteger(uid) || uid <= 0) notFound();

  return <GitHubHomeDashboard uid={params.uid} />;
}
