import type { Metadata } from "next";
import type { Viewport } from "next";
import type { ReactNode } from "react";
import { headers } from "next/headers";
import "./globals.css";
import { Analytics } from "@vercel/analytics/next";
import { PwaRegister } from "@/components/pwa-register";
import { AuthProvider } from "@/components/auth-provider";
import { NonceProvider } from "@/components/nonce-provider";

export const metadata: Metadata = {
  title: "Terminal OS | Pilotage de la Terminale",
  description: "Ton système personnel de gestion de la Terminale.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#1d2833",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html lang="fr">
      <body><NonceProvider nonce={nonce}><AuthProvider><PwaRegister /><Analytics />{children}</AuthProvider></NonceProvider></body>
    </html>
  );
}
