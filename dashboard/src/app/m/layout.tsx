export default function PublicViewerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto max-w-[600px] px-5 pb-[calc(74px+env(safe-area-inset-bottom))]">
      {children}
    </main>
  );
}