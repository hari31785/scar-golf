import type { MetadataRoute } from "next";

/**
 * Native Next.js web app manifest (served at /manifest.webmanifest).
 * Colors match the existing deep-green SCAR header (`bg-emerald-950`,
 * hex #022c22) and white app background — no new design system.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SCAR Golf",
    short_name: "SCAR",
    description:
      "Private scoring, pairings, leaderboard, and handicap app for the SCAR golf championship.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#022c22",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
