import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    const headers = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), usb=(), sync-xhr=()" },
      { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    ];
    // B44 : la CSP est maintenant gérée dans proxy.ts avec un nonce par requête
    // (conforme à la doc Next 16). On ne la définit plus statiquement ici pour
    // éviter un doublon d'en-tête qui rendrait la politique trop restrictive.
    if (process.env.NODE_ENV === "production") headers.push({ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" });
    return [{ source: "/(.*)", headers }];
  },
};

export default nextConfig;
