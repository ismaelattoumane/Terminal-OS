import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf-parse -> pdfjs-dist (legacy) charge @napi-rs/canvas via un require
  // dynamique (createRequire) à l'exécution Node. Bundler ces packages casse
  // cette résolution (et les chemins wasm/cmaps) : on les laisse externes, la
  // résolution se fait depuis node_modules au runtime (identique local/Vercel).
  serverExternalPackages: ["pdf-parse", "pdfjs-dist", "@napi-rs/canvas"],
  // Le file-tracing de Next/Vercel ne détecte pas le require dynamique de
  // "@napi-rs/canvas" fait par pdfjs-dist/legacy/build/pdf.mjs : on force son
  // inclusion (binaire natif inclus) dans les deux routes serveur qui
  // extraient du texte de PDF, sans quoi le Lambda Vercel retourne
  // « Cannot find module '@napi-rs/canvas' » à l'upload d'un PDF.
  outputFileTracingIncludes: {
    "/api/courses/upload": [
      "./node_modules/@napi-rs/canvas/**/*",
      // Le binaire natif est chargé par @napi-rs/canvas/index.js via un
      // require dynamique (template string) que nft ne trace pas.
      // Vercel exécute les fonctions sur Linux x64 glibc (Amazon Linux).
      "./node_modules/@napi-rs/canvas-linux-x64-gnu/**/*",
      "./node_modules/@napi-rs/wasm-runtime/**/*",
    ],
    "/api/schedule/import": [
      "./node_modules/@napi-rs/canvas/**/*",
      "./node_modules/@napi-rs/canvas-linux-x64-gnu/**/*",
      "./node_modules/@napi-rs/wasm-runtime/**/*",
    ],
  },
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
