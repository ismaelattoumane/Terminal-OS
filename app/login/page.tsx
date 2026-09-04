"use client";

import { signIn } from "next-auth/react";
import { ArrowRight, Terminal } from "lucide-react";

export default function LoginPage() {
  return <main className="login-page"><div className="login-card"><div className="brand-mark"><Terminal size={19} /></div><p className="eyebrow">TERMINAL OS / ACCÈS</p><h1>Ton année, en contrôle<span className="accent">.</span></h1><p className="muted">Connecte ton espace personnel pour retrouver tes cours, tes révisions et ta progression sur tous tes appareils.</p><button className="primary-button login-button" onClick={() => signIn("google", { callbackUrl: "/" })}>Continuer avec Google <ArrowRight size={17} /></button><small>Les données restent isolées dans ton compte.</small></div></main>;
}