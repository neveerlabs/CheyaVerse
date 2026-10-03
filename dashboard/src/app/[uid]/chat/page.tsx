import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default function ChatListPage({
  params,
}: {
  params: { uid: string };
}) {
  const uid = Number(params.uid);
  if (!Number.isInteger(uid) || uid <= 0) notFound();

  return <div aria-hidden="true" className="min-h-[50vh]" />;
}