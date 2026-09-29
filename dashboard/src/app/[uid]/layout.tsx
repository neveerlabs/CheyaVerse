import { cache } from "react";
import { TabBar } from "@/components/TabBar";
import { RealtimeSync } from "@/components/RealtimeSync";
import { SessionInit } from "@/components/SessionInit";
import { DeviceNotifications } from "@/components/DeviceNotifications";
import { PushRegister } from "@/components/PushRegister";
import { ChatPresence } from "@/components/ChatPresence";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import {
  getAccountSessionVersion,
  isDeviceBlacklisted,
  getTelegramUser,
} from "@/lib/storage";
import { readSessionToken, SESSION_COOKIE_NAME } from "@/lib/session-token";

export const dynamic = "force-dynamic";

const getUserCached = cache(getTelegramUser);
const isBlacklistedCached = cache(isDeviceBlacklisted);

export default async function UserLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { uid: string };
}) {
  const uid = Number(params.uid);
  const valid = Number.isInteger(uid) && uid > 0;
  const session = readSessionToken(cookies().get(SESSION_COOKIE_NAME)?.value);
  if (!session) redirect("/login");
  if (session.sessionVersion !== (await getAccountSessionVersion(session.uid))) {
    redirect("/login");
  }
  if (session.uid !== uid) redirect(`/${session.uid}`);

  const [user, blocked] = await Promise.all([
    getUserCached(uid),
    session.deviceId
      ? isBlacklistedCached(session.deviceId, uid)
      : Promise.resolve(false),
  ]);

  if (!user) notFound();
  if (blocked) redirect("/blocked");

  return (
    <>
      {valid && <SessionInit uid={params.uid} />}
      {valid && <PushRegister uid={params.uid} />}
      {valid && <DeviceNotifications uid={params.uid} />}
      {valid && <ChatPresence />}
      <RealtimeSync uid={params.uid} />
      <main className="mx-auto max-w-[600px] px-5 pb-[calc(74px+env(safe-area-inset-bottom))]">
        {children}
      </main>
      <TabBar uid={params.uid} />
    </>
  );
}