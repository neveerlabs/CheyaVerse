import { headers } from "next/headers";
import { TabBar } from "@/components/TabBar";
import { RealtimeSync } from "@/components/RealtimeSync";
import { ensureWelcomeNotification } from "@/lib/storage";
import { getTelegramChatInfo } from "@/lib/telegram";
import { parseDevice } from "@/lib/device";

export const dynamic = "force-dynamic";

export default async function UserLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { uid: string };
}) {
  const uid = Number(params.uid);
  if (Number.isInteger(uid) && uid > 0) {
    try {
      const h = headers();
      const ua = h.get("user-agent") ?? "";
      const device = parseDevice(ua) || null;

      const info = await getTelegramChatInfo(uid).catch(() => null);
      const username =
        info?.username ||
        [info?.first_name, info?.last_name].filter(Boolean).join(" ") ||
        null;

      await ensureWelcomeNotification(uid, username, device);
    } catch (err) {
      console.error("[layout] welcome flow error:", err);
    }
  }

  return (
    <>
      <RealtimeSync uid={params.uid} />
      <main className="mx-auto max-w-[600px] px-5 pb-[calc(74px+env(safe-area-inset-bottom))]">
        {children}
      </main>
      <TabBar uid={params.uid} />
    </>
  );
}