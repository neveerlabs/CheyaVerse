import { TabBar } from "@/components/TabBar";

export default function UserLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { uid: string };
}) {
  return (
    <>
      <main className="mx-auto max-w-[600px] px-5 pb-[calc(90px+env(safe-area-inset-bottom))]">
        {children}
      </main>
      <TabBar uid={params.uid} />
    </>
  );
}