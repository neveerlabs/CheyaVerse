import { TabBar } from "@/components/TabBar";
import { RealtimeSync } from "@/components/RealtimeSync";

export default function UserLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { uid: string };
}) {
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