import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return { name: "Terminal OS", short_name: "Terminal OS", description: "Le cockpit personnel de ta Terminale.", start_url: "/", display: "standalone", background_color: "#f4f7f6", theme_color: "#1c282c", lang: "fr", icons: [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }, { src: "/icon-512.png", sizes: "512x512", type: "image/png" }, { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }] };
}
