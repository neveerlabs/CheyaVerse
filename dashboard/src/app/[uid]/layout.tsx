import { cache } from "react";
import { TabBar } from "@/components/TabBar";
import { RealtimeSync } from "@/components/RealtimeSync";
import { SessionInit } from "@/components/SessionInit";
import { PushRegister } from "@/components/PushRegister";
import { UserPageMain } from "@/components/UserPageMain";
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
  if (!valid) notFound();
  const session = readSessionToken(cookies().get(SESSION_COOKIE_NAME)?.value);
  if (!session) redirect("/login");
  let currentSessionVersion: number;
  try {
    currentSessionVersion = await getAccountSessionVersion(session.uid);
  } catch (error) {
    console.error("[user-layout] session verification is unavailable:", error);
    return <DataUnavailablePage uid={uid} />;
  }
  if (session.sessionVersion !== currentSessionVersion) {
    redirect("/login");
  }
  if (session.uid !== uid) redirect(`/${session.uid}`);

  let user: Awaited<ReturnType<typeof getTelegramUser>>;
  let blocked: boolean;
  try {
    [user, blocked] = await Promise.all([
      getUserCached(uid),
      session.deviceId
        ? isBlacklistedCached(session.deviceId, uid)
        : Promise.resolve(false),
    ]);
  } catch (error) {
    console.error("[user-layout] account verification is unavailable:", error);
    return <DataUnavailablePage uid={uid} />;
  }

  if (!user) notFound();
  if (blocked) redirect("/blocked");

  return (
    <>
      {valid && <SessionInit uid={params.uid} />}
      {valid && <PushRegister uid={params.uid} />}
      <RealtimeSync uid={params.uid} />
      <UserPageMain>{children}</UserPageMain>
      <TabBar uid={params.uid} />
    </>
  );
}

function DataUnavailablePage({ uid }: { uid: number }) {
  return (
    <main className="mx-auto flex min-h-[70dvh] max-w-[520px] flex-col items-center justify-center px-6 text-center">
      <section
        role="alert"
        className="w-full rounded-3xl border border-amber-200 bg-amber-50 p-6"
      >
        <h1 className="text-lg font-semibold text-ink">
          Koneksi server sedang bermasalah
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          Sesi belum dapat diverifikasi karena database sementara tidak merespons.
          Untuk keamanan, dashboard tidak dibuka sampai verifikasi berhasil.
        </p>
        <a
          href={`/${uid}`}
          className="mt-5 inline-flex min-h-11 items-center justify-center rounded-xl bg-ink px-5 text-sm font-semibold text-white"
        >
          Coba lagi
        </a>
      </section>
    </main>
  );
}