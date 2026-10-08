import type { Metadata, Viewport } from "next";
import "./globals.css";
import { NavigationBlur } from "@/components/NavigationBlur";
import { FeedbackReporter } from "@/components/FeedbackReporter";

export const metadata: Metadata = {
  title: "CheyaVerse",
  description: "Personal bot webapp — CheyaVerse",
  manifest: "/manifest.webmanifest",
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
        <link rel="apple-touch-icon" href="/apple.png" />
        <link rel="preload" href="/sounds/sent.mp3" as="audio" type="audio/mpeg" />
        <link rel="preload" href="/sounds/received.mp3" as="audio" type="audio/mpeg" />
      </head>
      <body className="font-sans bg-white text-ink">
        {children}
        <FeedbackReporter />
        <NavigationBlur />
      </body>
    </html>
  );
}
