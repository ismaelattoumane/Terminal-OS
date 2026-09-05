import type { Metadata } from "next";
import "./globals.css";
import { PwaRegister } from "@/components/pwa-register";
import { AuthProvider } from "@/components/auth-provider";

export const metadata: Metadata = {
  title: "Terminal OS | Pilotage de la Terminale",
  description: "Ton système personnel de gestion de Terminale.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr">
      <body><AuthProvider><PwaRegister />{children}</AuthProvider></body>
    </html>
  );
}
