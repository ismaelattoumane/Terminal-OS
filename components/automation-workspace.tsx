"use client";

import { startTransition, useEffect, useState } from "react";
import { Play, RotateCw } from "lucide-react";

type Job = { id: string; type: string; status: "pending" | "running" | "completed" | "failed"; payload: unknown; error: string | null; attempts: number; createdAt: string };
type AuditEntry = { id: string; createdAt: string; action: string; meta: Record<string, unknown> };

const typeLabels: Record<string, string> = {
  create_revision_plan: "Plan de révision",
  sync_google_calendar: "Synchronisation Google",
  process_course: "Traitement de cours",
  generate_study_sheet: "Génération de fiche",
  generate_flashcards: "Génération de flashcards",
  generate_quiz: "Génération de quiz",
  update_mastery: "Mise à jour de maîtrise",
  recalculate_workload: "Recalcul de la charge",
};
const actionLabels: Record<string, string> = {
  "course.upload": "Import de cours",
  "quiz.attempt": "Tentative de quiz",
  "flashcard.review": "Révision d'une flashcard",
  "job.retry": "Relance d'un job",
  "sheet.generate": "Génération d'une fiche",
  "calendar.sync": "Synchronisation Google",
};

export function AutomationWorkspace() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [feedback, setFeedback] = useState("");
  const [running, setRunning] = useState(false);

  async function load() {
    const [jobResponse, auditResponse] = await Promise.all([fetch("/api/automation"), fetch("/api/audit")]);
    if (jobResponse.ok) setJobs(await jobResponse.json());
    if (auditResponse.ok) setAudit(await auditResponse.json());
  }

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetch("/api/automation"), fetch("/api/audit")]).then(async ([jobResponse, auditResponse]) => {
      const jobData = jobResponse.ok ? await jobResponse.json() : [];
      const auditData = auditResponse.ok ? await auditResponse.json() : [];
      if (!cancelled) startTransition(() => { setJobs(jobData); setAudit(auditData); });
    }).catch(() => { if (!cancelled) setFeedback("Automatisations indisponibles."); });
    return () => { cancelled = true; };
  }, []);

  async function retry(id: string) {
    setRunning(true);
    try {
      const response = await fetch(`/api/automation/${id}/retry`, { method: "POST" });
      if (!response.ok) { setFeedback("Relance impossible."); return; }
      setFeedback("Job relancé et traité.");
      await load();
    } finally { setRunning(false); }
  }

  const actionable = jobs.filter((job) => job.status === "failed" || job.status === "pending").length;

  return (
    <div className="">
      <div className="page-heading">
        <div>
          <p className="eyebrow">AUTOMATISATIONS</p>
          <h1>Automatisations</h1>
          <p className="muted">Jobs idempotents, relançables et journalisés. Point d&apos;entrée : /api/automation/worker avec CRON_SECRET.</p>
        </div>
        {feedback && <span className="workspace-message">{feedback}</span>}
      </div>
      <div className="stats-row">
        <div className="metric"><div><p>Jobs en attente</p><strong>{jobs.filter((job) => job.status === "pending").length}</strong><span>à traiter</span></div></div>
        <div className="metric"><div><p>Jobs en échec</p><strong>{jobs.filter((job) => job.status === "failed").length}</strong><span>{actionable} relançable(s)</span></div></div>
        <div className="metric"><div><p>Jobs terminés</p><strong>{jobs.filter((job) => job.status === "completed").length}</strong><span>au total</span></div></div>
        <div className="metric"><div><p>Événements d&apos;audit</p><strong>{audit.length}</strong><span>en base de données</span></div></div>
      </div>
      <section className="data-list">
        <div className="list-heading"><h2>Historique des jobs</h2><span>{jobs.length}</span></div>
        {jobs.length ? jobs.map((job) => (
          <div className="job-row" key={job.id}>
            <span className={`job-status ${job.status}`}>{job.status}</span>
            <div style={{ flex: 1 }}>
              <div className="job-type">{typeLabels[job.type] ?? job.type}</div>
              <span className="job-time">Créé le {new Date(job.createdAt).toLocaleString("fr-FR")} · {job.attempts} tentative(s)</span>
              {job.error && <div className="job-error">{job.error}</div>}
            </div>
            {(job.status === "failed" || job.status === "pending") && <button className="secondary-button" disabled={running} onClick={() => retry(job.id)}>{job.status === "failed" ? <><RotateCw size={14} /> Relancer</> : <><Play size={14} /> Traiter</>}</button>}
          </div>
        )) : <p className="empty-state">Aucun job pour le moment. L&apos;upload d&apos;un cours ou la création d&apos;une évaluation en crée automatiquement.</p>}
      </section>
      <section className="data-list">
        <div className="list-heading"><h2>Journal d&apos;audit</h2><span>{audit.length}</span></div>
        {audit.length ? audit.map((entry) => (
          <div className="calendar-event" key={entry.id}><span className="event-color" /><div><strong>{actionLabels[entry.action] ?? entry.action}</strong><span>{new Date(entry.createdAt).toLocaleString("fr-FR")} {Object.keys(entry.meta).length ? `· ${JSON.stringify(entry.meta).slice(0, 120)}` : ""}</span></div></div>
        )) : <p className="empty-state">Aucun événement d&apos;audit enregistré pour l&apos;instant.</p>}
      </section>
    </div>
  );
}