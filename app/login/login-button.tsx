"use client";

import { signIn } from "next-auth/react";
import { ArrowRight } from "lucide-react";

// Bouton client séparé : signIn de next-auth/react utilise des API client
// (CSRF, navigation) et ne peut pas s'exécuter dans un composant serveur.
export function LoginButton() {
  return (
    <button className="primary-button login-button" onClick={() => signIn("google", { callbackUrl: "/" })}>
      Continuer avec Google <ArrowRight size={17} />
    </button>
  );
}
