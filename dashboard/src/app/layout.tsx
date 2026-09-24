import type { Metadata, Viewport } from "next";
import "./globals.css";
import { NavigationBlur } from "@/components/NavigationBlur";
import { BlockGuard } from "@/components/BlockGuard";

export const metadata: Metadata = {
  title: "CheyaVerse",
  description: "Personal bot webapp — CheyaVerse",
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body className="font-sans bg-white text-ink">
        {children}
        <NavigationBlur />
        <BlockGuard />
      </body>
    </html>
  );
}
