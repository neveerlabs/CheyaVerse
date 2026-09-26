import { BlockClient } from "./BlockClient";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getTelegramUser, isDeviceBlacklisted } from "@/lib/storage";
import { readSessionToken, SESSION_COOKIE_NAME } from "@/lib/session-token";

export const dynamic = "force-dynamic";

export default async function SecurityBlockPage({
  searchParams,
}: {
  searchParams: { uid?: string; did?: string };
}) {
  const uid = Number(searchParams.uid);
  const deviceId = searchParams.did ?? "";
  const session = readSessionToken(cookies().get(SESSION_COOKIE_NAME)?.value);
  if (!session) redirect("/login");
  if (!Number.isSafeInteger(uid) || uid !== session.uid) {
    redirect(`/${session.uid}`);
  }
  if (!(await getTelegramUser(uid))) notFound();
  if (
    session.deviceId &&
    (await isDeviceBlacklisted(session.deviceId, uid))
  ) {
    redirect("/blocked");
  }

  return (
    <BlockClient
      uid={String(uid)}
      deviceId={deviceId}
    />
  );
}