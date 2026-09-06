"use client";

import { startTransition, useCallback, useEffect, useState } from "react";
import { signIn, signOut, useSession } from "next-auth/react";
import { AlarmClock, ArrowUpRight, BookOpen, CalendarDays, Check, ChevronRight, ClipboardCheck, LayoutDashboard, LineChart, LogOut, Menu, MoreHorizontal, Plus, Settings, Sparkles, Target, Terminal, Workflow, X } from "lucide-react";
import { PhaseOneWorkspace } from "@/components/phase-one-workspace";
import { CalendarWorkspace } from "@/components/calendar-workspace";
import { LearningWorkspace } from "@/components/learning-workspace";
import { StatisticsWorkspace } from "@/components/statistics-workspace";
import { AutomationWorkspace } from "@/components/automation-workspace";
import { SettingsWorkspace } from "@/components/settings-workspace";
import { onReconnect, queuedFetch } from "@/lib/offline-queue";

/* ── Modèles de données (miroir des API) ───────────────────────────────── */
type Revision = { id: string; title: string; startTime: string | null; duration: number; status: string; type: string; subject: { name: string }; chapter: { name: string } | null };
type Homework = { id: string; title: string; dueDate: string; status: string; subject: { name: string } };
type Evaluation = { id: string; title: string; date: string; status: string; subject: { name: string } };
type DashboardData = {
  today: { revisions: Revision[]; homework: Homework[]; evaluations: Evaluation[] };
  week: { sessions: number; plannedMinutes: number };
  progression: { mastery: number; averageGrade: number | null };
  workload: string;
  subjects: Array<{ id: string; name: string; shortName: string; color: string; coefficient: number; chapters: Array<{ name: string; mastery: number }> }>;
  focus: { name: string; mastery: number; subject: { name: string; coefficient: number } } | null;
  alerts: { overdueHomework: number; weakChapters: number; lateRevisions: number };
};
type Reminder = { id: string; type: string; severity: "high" | "normal"; title: string; detail: string };

/* ── Navigation ─────────────────────────────────────────────────────────── */
const navPrimary = [
  { label: "Accueil", icon: LayoutDashboard },
  { label: "Planning", icon: CalendarDays },
  { label: "Révisions", icon: AlarmClock },
  { label: "Cours", icon: BookOpen },
  { label: "Évaluations", icon: ClipboardCheck },
  { label: "Matières", icon: Settings },
  { label: "Notes", icon: Check },
];
const navSecondary = [
  { label: "Fiches", icon: Sparkles },
  { label: "Flashcards", icon: Target },
  { label: "Quiz", icon: Check },
  { label: "Statistiques", icon: LineChart },
  { label: "Automatisations", icon: Workflow },
  { label: "Paramètres", icon: Settings },
];
const allSections = [...navPrimary, ...navSecondary];

function sectionFor(label: string) {
  switch (label) {
    case "Accueil": return null;
    case "Planning": return <CalendarWorkspace />;
    case "Révisions": case "Cours": case "Évaluations": case "Matières": case "Notes": return <PhaseOneWorkspace section={label} />;
    case "Fiches": return <LearningWorkspace mode="sheets" />;
    case "Flashcards": return <LearningWorkspace mode="flashcards" />;
    case "Quiz": return <LearningWorkspace mode="quiz" />;
    case "Statistiques": return <StatisticsWorkspace />;
    case "Automatisations": return <AutomationWorkspace />;
    case "Paramètres": return <SettingsWorkspace />;
    default: return null;
  }
}

export default function Home() {
  const { data: session, status: authStatus } = useSession();
  const [active, setActive] = useState("Accueil");
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [showNavMenu, setShowNavMenu] = useState(false);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [dashboardError, setDashboardError] = useState("");
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [feedback, setFeedback] = useState("");

  const authenticated = authStatus === "authenticated";
const loadDashboard = useCallback(async () => {
    if (authStatus !== "authenticated") return;
    setDashboardLoading(true);
    setDashboardError("");
    try {
      const [dashboardResponse, reminderResponse] = await Promise.all([fetch("/api/dashboard"), fetch("/api/reminders")]);
      if (dashboardResponse.ok) setDashboard(await dashboardResponse.json() as DashboardData);
      if (reminderResponse.ok) setReminders(await reminderResponse.json() as Reminder[]);
    } catch {
      setDashboardError("Impossible de charger ton tableau de bord. Vérifie ta connexion.");
    } finally {
      setDashboardLoading(false);
    }
  }, [authStatus]);

  useEffect(() => { void loadDashboard(); }, [loadDashboard]);
  useEffect(() => { return onReconnect(loadDashboard); }, [loadDashboard]);
  useEffect(() => { if (feedback) { const timer = setTimeout(() => setFeedback(""), 4000); return () => clearTimeout(timer); } }, [feedback]);

  async function completeRevision(id: string, title: string) {
    const response = await queuedFetch(`/api/revisions/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "completed" }) });
    if (response.status === 202) { setFeedback(`« ${title} » terminée (synchronisée à la reconnexion).`); await loadDashboard(); return; }
    if (response.ok) { setFeedback(`Révision « ${title} » terminée.`); await loadDashboard(); }
    else setFeedback("Impossible de terminer cette révision.");
  }

  function openAdd(label: string) {
    setShowQuickAdd(false);
    setActive(label === "Un contrôle" ? "Évaluations" : label === "Un cours" ? "Cours" : label === "Un devoir" || label === "Une note" ? "Notes" : "Révisions");
  }

  function go(label: string) { setActive(label); setShowNavMenu(false); }

  /* Non connecté : CTA de connexion au lieu de données factices. */
  if (authStatus !== "authenticated" && authStatus !== "loading") {
    return (
      <main className="login-page">
        <div className="login-card">
          <div className="brand-mark"><Terminal size={19} /></div>
          <p className="eyebrow">TERMINAL OS / ACCÈS</p>
          <h1>Ton année, en contrôle<span className="accent">.</span></h1>
          <p className="muted">Connecte-toi pour retrouver tes cours, tes révisions et ta progression sur tous tes appareils.</p>
          <button className="primary-button login-button" onClick={() => signIn("google")}>Continuer avec Google</button>
          <small>Les données restent isolées dans ton compte.</small>
        </div>
      </main>
    );
  }

  const firstName = session?.user?.name?.split(/\s+/)[0] ?? "";
  const initial = (session?.user?.name ?? "?")[0]?.toUpperCase() ?? "?";
  const todayLabel = new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
return (
    <div className="app-shell">
      {/* Sidebar desktop */}
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark"><Terminal size={17} /></span><div><strong>TERMINAL OS</strong><span>COCKPIT TERMINALE</span></div></div>
        <span className="nav-caption">Piloter</span>
        <nav className="nav-list" aria-label="Sections principales">
          {navPrimary.map((item) => <NavItem key={item.label} label={item.label} icon={item.icon} active={active === item.label} onClick={() => go(item.label)} />)}
        </nav>
        <span className="nav-caption" style={{ marginTop: 18 }}>Apprendre &amp; analyser</span>
        <nav className="nav-list" aria-label="Sections secondaires">
          {navSecondary.map((item) => <NavItem key={item.label} label={item.label} icon={item.icon} active={active === item.label} onClick={() => go(item.label)} />)}
        </nav>
        <div className="sidebar-bottom">
          <div className="profile">
            <span className="avatar">{initial}</span>
            <div><strong>{session?.user?.name ?? "Compte"}</strong><span>{session?.user?.email}</span></div>
            <button className="icon-button" onClick={() => signOut()} aria-label="Se déconnecter" title="Se déconnecter"><LogOut size={16} /></button>
          </div>
        </div>
      </aside>

      <section className="content-area">
        <header className="topbar">
          <div className="breadcrumb">
            <button className="icon-button mobile-only" onClick={() => setShowNavMenu(true)} aria-label="Ouvrir le menu des sections"><Menu size={18} /></button>
            <span>Terminal OS</span><span aria-hidden="true">/</span><strong>{active}</strong>
          </div>
          <div className="top-actions">
            <button className="primary-button" onClick={() => setShowQuickAdd(true)}><Plus size={16} /> Ajouter</button>
            <button className="icon-button" onClick={() => go("Paramètres")} aria-label="Paramètres"><Settings size={18} /></button>
            <span className="avatar-top" aria-hidden="true">{initial}</span>
          </div>
        </header>

        {feedback && <div className="state-message state-success" role="status" style={{ margin: "12px 22px 0", maxWidth: 720 }}>{feedback}</div>}

        <main className="page-content">
          {active === "Accueil" ? (
            <>
              <div className="dash-greeting">
                <p className="eyebrow">{todayLabel}</p>
                <h1>{authenticated ? `Bonjour ${firstName || "—"}.` : "Chargement…"}</h1>
                <p className="muted">Voici ce qu&apos;il y a à faire maintenant.</p>
              </div>
              {dashboardError && <div className="state-message state-error" role="alert" style={{ marginBottom: 16 }}>{dashboardError}<button className="ghost-button" onClick={() => void loadDashboard()}>Réessayer</button></div>}
              {dashboardLoading && !dashboard ? (
                <>
                  <div className="metrics-row">
                    <div className="metric-card"><span className="skeleton" style={{ width: "60%", height: "22px" }} /><span className="skeleton" style={{ width: "40%", height: "12px", marginTop: 4 }} /></div>
                    <div className="metric-card"><span className="skeleton" style={{ width: "50%", height: "22px" }} /><span className="skeleton" style={{ width: "30%", height: "12px", marginTop: 4 }} /></div>
                    <div className="metric-card"><span className="skeleton" style={{ width: "70%", height: "22px" }} /><span className="skeleton" style={{ width: "35%", height: "12px", marginTop: 4 }} /></div>
                  </div>
                  <div className="dash-grid">
                    <div className="dash-stack">
                      <div className="panel"><div className="panel-header"><h2>À faire aujourd&apos;hui</h2></div><div className="panel-body"><span className="skeleton" /><span className="skeleton" /><span className="skeleton" /></div></div>
                      <div className="panel"><div className="panel-header"><h2>Prochain contrôle</h2></div><div className="panel-body"><span className="skeleton" /><span className="skeleton" /></div></div>
                    </div>
                    <div className="dash-stack">
                      <div className="panel"><div className="panel-header"><h2>Rappels</h2></div><div className="panel-body"><span className="skeleton" /><span className="skeleton" /></div></div>
                      <div className="panel"><div className="panel-header"><h2>Progression</h2></div><div className="panel-body"><span className="skeleton" /></div></div>
                    </div>
                  </div>
                </>
              ) : dashboard ? (
                <Dashboard key="dash" data={dashboard} reminders={reminders} onComplete={(id, title) => void completeRevision(id, title)} onNavigate={(label) => go(label)} />
              ) : null}
            </>
          ) : sectionFor(active)}
        </main>
      </section>

      {/* Bottom navigation mobile */}
      <nav className="bottom-nav" aria-label="Navigation mobile">
        {navPrimary.slice(0, 4).map((item) => { const Icon = item.icon; return (
          <button key={item.label} className={active === item.label ? "active" : ""} onClick={() => go(item.label)} aria-current={active === item.label ? "page" : undefined}>
            <Icon size={19} /><span>{item.label}</span>
          </button>
        ); })}
        <button className={allSections.some((item) => item.label === active && !navPrimary.slice(0, 4).some((p) => p.label === active)) ? "active" : ""} onClick={() => setShowNavMenu(true)} aria-label="Toutes les sections"><MoreHorizontal size={19} /><span>Plus</span></button>
      </nav>

      {showQuickAdd && <QuickAddModal onClose={() => setShowQuickAdd(false)} onPick={openAdd} />}
      {showNavMenu && <NavMenuModal onClose={() => setShowNavMenu(false)} onPick={go} active={active} />}
    </div>
  );
}
/* ── Carte métrique ─────────────────────────────────────────────────────── */
function MetricCard({ icon: Icon, label, value, bg, color }: { icon: typeof LayoutDashboard; label: string; value: string | number; bg: string; color: string }) {
  return (
    <div className="metric-card">
      <div className="metric-icon" style={{ background: bg, color }}>
        <Icon size={18} />
      </div>
      <div className="metric-value">{value}</div>
      <div className="metric-label">{label}</div>
    </div>
  );
}

/* ── Dashboard ──────────────────────────────────────────────────────────── */
function Dashboard({ data, reminders, onComplete, onNavigate }: {
  data: DashboardData; reminders: Reminder[]; onComplete: (id: string, title: string) => void; onNavigate: (label: string) => void;
}) {
  const today = new Date();
  const nextEvaluation = data.today.evaluations[0];
  const daysUntil = nextEvaluation ? Math.max(0, Math.ceil((new Date(nextEvaluation.date).getTime() - today.getTime()) / 86_400_000)) : null;
  const dayLabel = (value: Date) => {
    const diff = Math.ceil((value.getTime() - today.getTime()) / 86_400_000);
    if (diff < 0) return "En retard";
    if (diff === 0) return "Aujourd'hui";
    if (diff === 1) return "Demain";
    if (diff <= 7) return `J-${diff}`;
    return new Date(value).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
  };
  const deadlineRows = [
    ...data.today.evaluations.map((evaluation) => ({ id: `eval-${evaluation.id}`, title: evaluation.title, meta: `${evaluation.subject.name} · contrôle`, days: dayLabel(new Date(evaluation.date)), tone: "orange" })),
    ...data.today.homework.filter((homework) => homework.status !== "completed").map((homework) => ({ id: `hw-${homework.id}`, title: homework.title, meta: `${homework.subject.name} · devoir`, days: dayLabel(new Date(homework.dueDate)), tone: new Date(homework.dueDate) < today ? "red" : "purple" })),
  ].slice(0, 5);
  const weakChapters = data.subjects.flatMap((subject) => subject.chapters.map((chapter) => ({ ...chapter, subjectName: subject.name }))).sort((a, b) => a.mastery - b.mastery).slice(0, 3);

  return (
    <>
      <div className="metrics-row">
        <MetricCard icon={LineChart} label="Charge" value={data.workload} bg="var(--blue-soft)" color="var(--blue)" />
        <MetricCard icon={Target} label="Progression" value={`${data.progression.mastery}%`} bg="var(--green-soft)" color="var(--green)" />
        <MetricCard icon={CalendarDays} label="Prochain" value={daysUntil !== null ? (daysUntil === 0 ? "Aujourd'hui" : `J-${daysUntil}`) : "—"} bg="var(--accent-soft)" color="var(--accent)" />
      </div>
      <div className="dash-grid">
      <div className="dash-stack">
        {data.alerts.lateRevisions > 0 && (
          <div className="state-message state-warning" role="alert"><strong>{data.alerts.lateRevisions} révision(s) en retard.</strong><button className="ghost-button" onClick={() => onNavigate("Révisions")}>Voir</button></div>
        )}
        {data.alerts.overdueHomework > 0 && (
          <div className="state-message state-error" role="alert"><strong>{data.alerts.overdueHomework} devoir(s) en retard.</strong><button className="ghost-button" onClick={() => onNavigate("Notes")}>Gérer</button></div>
        )}

        <section className="panel">
          <div className="panel-header"><h2>À faire aujourd&apos;hui</h2><button className="panel-link" onClick={() => onNavigate("Révisions")}>Tout voir<ArrowUpRight size={13} /></button></div>
          <div className="panel-body">
            {data.today.revisions.length ? data.today.revisions.map((revision) => (
              <div className="daily-item" key={revision.id}>
                <span className="time">{revision.startTime ?? "—"}</span>
                <div className="body"><strong>{revision.title}</strong><span>{revision.subject.name} · {revision.duration} min{revision.status === "planned" ? "" : ` · ${revision.status}`}</span></div>
                <div className="actions">
                  {revision.status === "planned" && <button className="complete-button" onClick={() => onComplete(revision.id, revision.title)} aria-label={`Terminer ${revision.title}`}><Check size={14} /> Terminer</button>}
                </div>
              </div>
            )) : (
              <div className="state-empty"><strong>Aucune révision aujourd&apos;hui.</strong><span>Ajoute un contrôle pour générer ton planning automatiquement.</span><button className="ghost-button" onClick={() => onNavigate("Évaluations")}>Ajouter un contrôle</button></div>
            )}
          </div>
        </section>

        <section className="panel">
          <div className="panel-header"><h2>{nextEvaluation ? "Prochain contrôle" : "Prochaines échéances"}</h2><button className="panel-link" onClick={() => onNavigate("Évaluations")}>Tout voir<ArrowUpRight size={13} /></button></div>
          {nextEvaluation && daysUntil !== null ? (
            <div className="focus-card" style={{ margin: 16 }}>
              <h2>{nextEvaluation.subject.name} · contrôle</h2>
              <div className="focus-name">{nextEvaluation.title}</div>
              <span>{daysUntil === 0 ? "C'est aujourd'hui !" : `Dans ${daysUntil} jour${daysUntil > 1 ? "s" : ""}`} — termine les révisions planifiées.</span>
            </div>
          ) : null}
          <div className="panel-body">
            {deadlineRows.length ? deadlineRows.map((item) => <div className="deadline-row" key={item.id}><span className={`deadline-line ${item.tone}`} /><div><strong>{item.title}</strong><span>{item.meta}</span></div><b>{item.days}</b></div>) : <div className="state-empty"><strong>Aucune échéance à venir.</strong><span>Ajoute un contrôle ou un devoir pour les voir apparaître ici.</span></div>}
          </div>
        </section>

        {data.focus && (
          <section className="panel">
            <div className="panel-header"><h2>Chapitre prioritaire</h2><button className="panel-link" onClick={() => onNavigate("Matières")}>Matières<ArrowUpRight size={13} /></button></div>
            <div className="panel-body"><div className="reminder-row"><span className="rem-icon"><Sparkles size={15} color="var(--purple)" /></span><div><strong>{data.focus.name}</strong><span>{data.focus.subject.name} · maîtrise {data.focus.mastery}%</span></div></div></div>
          </section>
        )}
      </div>
<div className="dash-stack">
        <section className="panel">
          <div className="panel-header"><h2>Rappels</h2><span>{reminders.length}</span></div>
          <div className="panel-body">
            {reminders.length ? reminders.map((reminder) => (
              <div className="reminder-row" key={reminder.id}><span className={`rem-icon ${reminder.severity === "high" ? "high" : ""}`}><AlarmClock size={15} color={reminder.severity === "high" ? "var(--red)" : "var(--muted)"} /></span><div><strong>{reminder.title}</strong><span>{reminder.detail}</span></div></div>
            )) : <div className="state-empty"><strong>Tout est calme.</strong><span>Les rappels de contrôles, révisions et devoirs apparaîtront ici.</span></div>}
          </div>
        </section>

        <section className="panel">
          <div className="panel-header"><h2>Progression</h2></div>
          <div className="panel-body">
            <div className="bar-item"><div className="bar-label"><strong>Maîtrise moyenne</strong><span>{data.progression.mastery}%</span></div><div className="bar-track"><span className="bar-fill" style={{ width: `${Math.min(100, data.progression.mastery)}%`, backgroundColor: "var(--green)" }} /></div></div>
            {data.progression.averageGrade != null && <div className="bar-item"><div className="bar-label"><strong>Moyenne générale</strong><span>{data.progression.averageGrade}/20</span></div><div className="bar-track"><span className="bar-fill" style={{ width: `${Math.min(100, data.progression.averageGrade * 5)}%`, backgroundColor: "var(--blue)" }} /></div></div>}
            <div className="bar-item"><div className="bar-label"><strong>Sessions planifiées (7 j)</strong><span>{data.week.sessions} · {Math.round(data.week.plannedMinutes / 60 * 10) / 10} h</span></div></div>
            <div className="bar-item"><div className="bar-label"><strong>Chapitres faibles</strong><span>{data.alerts.weakChapters}</span></div></div>
            {weakChapters.length > 0 && <p className="chart-muted" style={{ marginTop: 10 }}>Priorités : {weakChapters.map((chapter) => chapter.name).join(" · ")}</p>}
          </div>
        </section>

        <section className="panel">
          <div className="panel-header"><h2>Matières</h2><button className="panel-link" onClick={() => onNavigate("Matières")}>Gérer<ArrowUpRight size={13} /></button></div>
          <div className="panel-body">
            {data.subjects.length ? data.subjects.map((subject) => (
              <div className="subject-row" key={subject.id}><span className="dot" style={{ backgroundColor: subject.color }} /><span className="name">{subject.name}</span><span className="mastery">{subject.chapters.length ? `${Math.round(subject.chapters.reduce((sum, chapter) => sum + chapter.mastery, 0) / subject.chapters.length)}%` : "—"}</span></div>
            )) : <div className="state-empty"><strong>Aucune matière.</strong><span>Crée ta première matière avec son premier chapitre.</span><button className="ghost-button" onClick={() => onNavigate("Matières")}>Créer une matière</button></div>}
          </div>
        </section>
      </div>
    </div>
    </>
  );
}
function NavItem({ label, icon: Icon, active, onClick }: { label: string; icon: typeof LayoutDashboard; active: boolean; onClick: () => void }) {
  return (
    <button className={`nav-item ${active ? "active" : ""}`} onClick={onClick} aria-current={active ? "page" : undefined}>
      <Icon size={18} aria-hidden="true" /><span>{label}</span>{active && <span className="nav-active-dot" />}
    </button>
  );
}

function QuickAddModal({ onClose, onPick }: { onClose: () => void; onPick: (label: string) => void }) {
  const items = ["Un cours", "Un contrôle", "Un devoir", "Une note", "Une révision"];
  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div className="quick-modal" role="dialog" aria-modal="true" aria-label="Ajouter rapidement" onClick={(event) => event.stopPropagation()}>
        <div className="modal-heading"><div><p className="eyebrow">ACTION RAPIDE</p><h2>Que veux-tu ajouter ?</h2></div><button className="icon-button" onClick={onClose} aria-label="Fermer"><X size={18} /></button></div>
        <div className="quick-actions">
          {items.map((label, index) => <button key={label} onClick={() => onPick(label)}><span className={`quick-icon q-${index % 5}`}><Plus size={16} /></span><strong>{label}</strong><ChevronRight size={16} /></button>)}
        </div>
      </div>
    </div>
  );
}

function NavMenuModal({ onClose, onPick, active }: { onClose: () => void; onPick: (label: string) => void; active: string }) {
  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div className="quick-modal" role="dialog" aria-modal="true" aria-label="Toutes les sections" onClick={(event) => event.stopPropagation()}>
        <div className="modal-heading"><div><p className="eyebrow">NAVIGATION</p><h2>Toutes les sections</h2></div><button className="icon-button" onClick={onClose} aria-label="Fermer"><X size={18} /></button></div>
        <div className="quick-actions">
          {allSections.map((item, index) => { const Icon = item.icon; return (
            <button key={item.label} onClick={() => onPick(item.label)}><span className={`quick-icon q-${index % 5}`}><Icon size={17} /></span><strong>{item.label}</strong>{active === item.label ? <span className="status-badge completed">Actif</span> : <ChevronRight size={16} />}</button>
          ); })}
        </div>
      </div>
    </div>
  );
}