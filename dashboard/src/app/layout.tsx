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
  userScalable: true,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <head>
        <link rel="preload" href="/assets/centang.png" as="image" />
        <link rel="preload" href="/sounds/sent.mp3" as="audio" type="audio/mpeg" />
        <link rel="preload" href="/sounds/received.mp3" as="audio" type="audio/mpeg" />
        <link rel="preload" href="/sounds/notification.mp3" as="audio" type="audio/mpeg" />
      </head>
      <body className="font-sans bg-white text-ink">
        {children}
        <NavigationBlur />
      </body>
    </html>
  );
}
