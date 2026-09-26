import { TabBar } from "@/components/TabBar";
import { RealtimeSync } from "@/components/RealtimeSync";
import { SessionInit } from "@/components/SessionInit";
import { DeviceNotifications } from "@/components/DeviceNotifications";
import { PushRegister } from "@/components/PushRegister";

export const dynamic = "force-dynamic";

export default async function UserLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { uid: string };
}) {
  const uid = Number(params.uid);
  const valid = Number.isInteger(uid) && uid > 0;

  return (
    <>
      {valid && <SessionInit uid={params.uid} />}
      {valid && <PushRegister uid={params.uid} />}
      {valid && <DeviceNotifications uid={params.uid} />}
      <RealtimeSync uid={params.uid} />
      <main className="mx-auto max-w-[600px] px-5 pb-[calc(74px+env(safe-area-inset-bottom))]">
        {children}
      </main>
      <TabBar uid={params.uid} />
    </>
  );
}
