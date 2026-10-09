import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "CheyaVerse",
    short_name: "CheyaVerse",
    description: "CheyaVerse personal web app",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    icons: [
      {
        src: "/push-192.png?v=20261009",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/push.png?v=20261009",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
