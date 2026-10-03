"use client";

import { usePathname } from "next/navigation";

const unchangedPagePaths = [
  "/profile/privacy",
  "/profile/agreement",
  "/profile/support",
];

export function UserPageMain({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const redesigned = !unchangedPagePaths.some((path) =>
    pathname.includes(path),
  );

  return (
    <main
      className={`mx-auto px-5 pb-[calc(74px+env(safe-area-inset-bottom))] ${
        redesigned ? "app-shell max-w-[1180px]" : "max-w-[600px]"
      }`}
    >
      {children}
    </main>
  );
}
