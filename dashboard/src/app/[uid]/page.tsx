import { notFound } from "next/navigation";
import { LibraryClient } from "./LibraryClient";
import { getTelegramUser } from "@/lib/storage";

export const dynamic = "force-dynamic";

export default async function HomePage({ params }: { params: { uid: string } }) {
  const uid = Number(params.uid);
  if (!Number.isSafeInteger(uid) || uid <= 0) notFound();
  const user = await getTelegramUser(uid);
  if (!user) notFound();
  const username = user.username?.trim() ?? "";

  return (
    <LibraryClient
      uid={params.uid}
      username={/^[A-Za-z0-9_]{1,32}$/.test(username) ? username : `user-${params.uid}`}
    />
  );
}
