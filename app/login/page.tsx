import { signIn } from "next-auth/react";
import { ArrowRight, Terminal } from "lucide-react";
import { LoginButton } from "./login-button";

// Rendu côté serveur pour détecter la config Google.
// B21 : si GOOGLE_CLIENT_ID/SECRET sont absents, on informe l'utilisateur au lieu
// d'afficher un bouton "Continuer avec Google" qui échouerait sans explication.
// (Les env non-privées ne sont pas accessibles dans le bundle client, d'où la
// vérification côté serveur et le bouton délégué à un composant client.)
const googleConfigured = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

export default function LoginPage() {
  return (
    <main className="login-page">
      <div className="login-card">
        <div className="brand-mark"><Terminal size={19} /></div>
        <p className="eyebrow">TERMINAL OS / ACCÈS</p>
        <h1>Ton année, en contrôle<span className="accent">.</span></h1>
        <p className="muted">Connecte ton espace personnel pour retrouver tes cours, tes révisions et ta progression sur tous tes appareils.</p>
        {googleConfigured ? <LoginButton /> : (
          <div className="muted" role="status">
            <p><strong>Connexion Google non configurée.</strong></p>
            <p>Renseigne <code>GOOGLE_CLIENT_ID</code> et <code>GOOGLE_CLIENT_SECRET</code> dans les variables d&apos;environment puis relance l&apos;application.</p>
          </div>
        )}
        <small>Les données restent isolées dans ton compte.</small>
      </div>
    </main>
  );
}