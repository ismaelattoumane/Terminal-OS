"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { CalendarDays, HardDrive, RefreshCw, ShieldCheck, User } from "lucide-react";

type GoogleStatus = { connected: boolean; configured: boolean; redirectUri: string; callbackMatchesNextAuth: boolean; timezone: string; hint: string };
type StorageStatus = { configured: boolean; reachable: boolean; bucket: string | null; region: string | null; error: string | null; lastChecked: string };

export function SettingsWorkspace() {
  const { data: session } = useSession();
  const [google, setGoogle] = useState<GoogleStatus | null>(null);
  const [storage, setStorage] = useState<StorageStatus | null>(null);
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetch("/api/calendar/status"), fetch("/api/storage/health")])
      .then(async ([googleResponse, storageResponse]) => {
        const googleData = googleResponse.ok ? await googleResponse.json() : null;
        const storageData = storageResponse.ok ? await storageResponse.json() : null;
        if (!cancelled) startSettingState(googleData, storageData);
      })
      .catch(() => { if (!cancelled) setFeedback("Paramètres indisponibles. Reconnecte-toi."); });
    function startSettingState(googleData: GoogleStatus | null, storageData: StorageStatus | null) {
      setGoogle(googleData);
      setStorage(storageData);
    }
    return () => { cancelled = true; };
  }, []);

  return (
    <div>
      <div className="page-heading">
        <div>
          <p className="eyebrow">COMPTE &amp; INTÉGRATIONS</p>
          <h1>Paramètres</h1>
          <p className="muted">Ton compte, la connexion Google Calendar et le stockage des fichiers.</p>
        </div>
        {feedback && <span className="state-message state-error">{feedback}</span>}
      </div>

      <section className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-header"><h2><User size={15} style={{ verticalAlign: "-2px", marginRight: 6 }} />Compte</h2></div>
        <div className="panel-body">
          <div className="reminder-row"><span className="rem-icon"><User size={15} color="var(--muted)" /></span><div><strong>{session?.user?.name ?? "—"}</strong><span>{session?.user?.email ?? ""}</span></div></div>
          <div className="reminder-row"><span className="rem-icon"><ShieldCheck size={15} color="var(--green)" /></span><div><strong>Connexion Google</strong><span>{google?.configured ? "OAuth configuré côté serveur" : "Non configuré (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET requis)"}</span></div></div>
        </div>
      </section>

      <section className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-header"><h2><CalendarDays size={15} style={{ verticalAlign: "-2px", marginRight: 6 }} />Google Calendar</h2><span className={`status-badge ${google?.connected ? "completed" : google?.configured ? "in_progress" : "skipped"}`}>{google?.connected ? "Connecté" : google?.configured ? "Non connecté" : "Non configuré"}</span></div>
        <div className="panel-body">
          <div className="reminder-row"><span className="rem-icon"><CalendarDays size={15} color="var(--blue)" /></span><div><strong>État de la synchronisation</strong><span>{google?.hint ?? "Charge l'état de la connexion…"}</span></div></div>
          {google && <div className="reminder-row"><span className="rem-icon"><RefreshCw size={15} color="var(--muted)" /></span><div><strong>Fuseau des événements</strong><span>{google.timezone} · redirection OAuth : {google.redirectUri}{google.callbackMatchesNextAuth ? "" : " (⚠ différent du callback NextAuth)"}</span></div></div>}
          <p className="chart-muted" style={{ marginTop: 8 }}>Pour connecter ou déconnecter le calendrier, utilise le bouton dans l&apos;écran Planning.</p>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header"><h2><HardDrive size={15} style={{ verticalAlign: "-2px", marginRight: 6 }} />Stockage des fichiers</h2><span className={`status-badge ${storage?.configured ? (storage.reachable ? "completed" : "high") : "skipped"}`}>{storage?.configured ? (storage.reachable ? "Opérationnel" : "Inaccessible") : "Non configuré"}</span></div>
        <div className="panel-body">
          <div className="reminder-row"><span className="rem-icon"><HardDrive size={15} color="var(--muted)" /></span><div><strong>Bucket S3</strong><span>{storage?.configured ? `${storage.bucket ?? "—"} (région ${storage.region ?? "—"})` : "Aucun stockage configuré — les imports ne conservent pas le fichier original."}</span></div></div>
          {storage?.error && <div className="state-message state-error" style={{ marginTop: 10 }}>{storage.error}</div>}
          <p className="chart-muted" style={{ marginTop: 8 }}>Configure S3_ENDPOINT, S3_ACCESS_KEY, S3_SECRET_KEY et S3_BUCKET pour activer la conservation des documents importés.</p>
        </div>
      </section>
    </div>
  );
}