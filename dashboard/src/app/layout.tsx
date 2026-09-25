// src/app/layout.tsx
import type { Metadata, Viewport } from "next";
import "./globals.css";
import { NavigationBlur } from "@/components/NavigationBlur";

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
  interactiveWidget: "resizes-content",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <head>
        <link rel="preload" href="/assets/centang.png" as="image" />
      </head>
      <body className="font-sans bg-white text-ink">
        {children}
        <NavigationBlur />
      </body>
    </html>
  );
}