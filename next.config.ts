import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PDF : unpdf embarque un build "serverless" de pdf.js dont le worker est
  // inliné (exécution sur le thread principal). Contrairement à pdf-parse →
  // pdfjs-dist (qui chargeait pdf.worker.mjs via un import dynamique non
  // traçable par nft → absent du Lambda Vercel → « Setting up fake worker
  // failed »), unpdf n'a besoin d'aucun fichier worker sur le filesystem.
  // On le garde externe pour que la résolution se fasse depuis node_modules
  // au runtime (traçage nft complet des imports statiques du package).
  // @napi-rs/canvas : requis par tesseract.js pour l'OCR image.
  serverExternalPackages: ["unpdf", "@napi-rs/canvas"],
  // Le file-tracing de Next/Vercel ne détecte pas le require dynamique de
  // "@napi-rs/canvas" fait par tesseract.js : on force son inclusion (binaire
  // natif inclus) dans les routes serveur qui font de l'OCR image, sans quoi
  // le Lambda Vercel ne peut pas décoder les images.
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
