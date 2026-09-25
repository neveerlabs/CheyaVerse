export default function PublicPageLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto max-w-[600px] px-5 pb-10">
      {children}
    </main>
  );
}