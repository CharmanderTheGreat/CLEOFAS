import type { MetadataRoute } from "next";

// Web app manifest: lets people install Cleofas to their home screen (needs HTTPS, so on Vercel).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Cleofas",
    short_name: "Cleofas",
    description: "A safe place to rant. You choose who can see and reply.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#0e1612",
    theme_color: "#3f7a5a",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
