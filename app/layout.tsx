import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Terminal OS | Pilotage de la Terminale",
  description: "Ton système personnel de gestion de Terminale.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
