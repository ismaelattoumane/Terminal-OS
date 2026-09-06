import type { Metadata } from "next";
import type { Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { PwaRegister } from "@/components/pwa-register";
import { AuthProvider } from "@/components/auth-provider";

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

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <body><AuthProvider><PwaRegister />{children}</AuthProvider></body>
    </html>
  );
}
