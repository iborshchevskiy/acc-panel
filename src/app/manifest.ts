import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "AccPanel",
    short_name: "AccPanel",
    description: "Crypto exchange office accounting — wallets, FIFO, clients, capital.",
    start_url: "/app/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#07090c",
    theme_color: "#07090c",
    categories: ["finance", "business", "productivity"],
    icons: [
      {
        src: "/icon",
        type: "image/png",
        sizes: "192x192",
        purpose: "any",
      },
      {
        src: "/icon",
        type: "image/png",
        sizes: "192x192",
        purpose: "maskable",
      },
      {
        src: "/apple-icon",
        type: "image/png",
        sizes: "180x180",
        purpose: "any",
      },
    ],
  };
}
