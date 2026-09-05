import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return { name: "Terminal OS", short_name: "Terminal OS", description: "Le cockpit personnel de ta Terminale.", start_url: "/", display: "standalone", background_color: "#f4f7f6", theme_color: "#1c282c", lang: "fr", icons: [{ src: "/icon.svg", sizes: "192x192", type: "image/svg+xml", purpose: "any" }] };
}
