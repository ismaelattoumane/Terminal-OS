"use client";

import { startTransition, useEffect, useState } from "react";
import { signIn, signOut, useSession } from "next-auth/react";
import { AlarmClock, ArrowUpRight, BookOpen, CalendarDays, Check, ChevronRight, CirclePlus, ClipboardCheck, LayoutDashboard, LineChart, Menu, MoreHorizontal, PanelLeft, Settings, Sparkles, Target, Workflow, X } from "lucide-react";
import { PhaseOneWorkspace } from "@/components/phase-one-workspace";
import { CalendarWorkspace } from "@/components/calendar-workspace";
import { LearningWorkspace } from "@/components/learning-workspace";
import { StatisticsWorkspace } from "@/components/statistics-workspace";
import { AutomationWorkspace } from "@/components/automation-workspace";
import { onReconnect, queuedFetch } from "@/lib/offline-queue";

const navItems = [
  { label: "Dashboard", icon: LayoutDashboard }, { label: "Cours", icon: BookOpen }, { label: "Évaluations", icon: ClipboardCheck },
  { label: "Révisions", icon: AlarmClock }, { label: "Calendrier", icon: CalendarDays }, { label: "Fiches", icon: Sparkles },
  { label: "Flashcards", icon: Target }, { label: "Quiz", icon: Check }, { label: "Statistiques", icon: LineChart },
  { label: "Automatisations", icon: Workflow },
];
const sessions = [
  { time: "17:30", title: "Suites numériques", meta: "Maths · Exercices", tone: "orange", duration: "40 min" },
  { time: "19:00", title: "La conscience", meta: "Philosophie · Mémorisation", tone: "blue", duration: "25 min" },
  { time: "20:15", title: "Bases de données", meta: "NSI · Flashcards", tone: "green", duration: "20 min" },
];
const subjects = [
  { name: "Mathématiques", short: "MATHS", mastery: 72, color: "#ff7a45" }, { name: "NSI", short: "NSI", mastery: 84, color: "#4ba3ff" },
  { name: "Philosophie", short: "PHILO", mastery: 58, color: "#b78cff" }, { name: "Anglais", short: "ANG", mastery: 91, color: "#42c98a" },
];
type DashboardData = { today: { revisions: Array<{ id: string; title: string; startTime: string | null; duration: number; subject: { name: string }; type: string }>; homework: Array<{ id: string; title: string; dueDate: string; status: string; subject: { name: string } }>; evaluations: Array<{ id: string; title: string; date: string; subject: { name: string } }> }; week: { sessions: number; plannedMinutes: number }; progression: { mastery: number; averageGrade: number | null }; workload: string; subjects: Array<{ name: string; shortName: string; color: string; chapters: Array<{ name: string; mastery: number }> }>; focus: { name: string; mastery: number; subject: { name: string; coefficient: number } } | null; alerts: { overdueHomework: number; weakChapters: number } };
type DeadlineItem = { id: string; title: string; meta: string; days: string; tone: string };
const previewDeadlines: DeadlineItem[] = [
  { id: "preview-eval-1", title: "Contrôle de Maths", meta: "Suites · 16 septembre", days: "J-12", tone: "orange" },
  { id: "preview-eval-2", title: "Devoir de philosophie", meta: "Dissertation · 19 septembre", days: "J-15", tone: "purple" },
  { id: "preview-eval-3", title: "Oral d'anglais", meta: "Expression · 24 septembre", days: "J-20", tone: "green" },
];

export default function Home() {
  const [active, setActive] = useState("Dashboard");
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [showMobileNav, setShowMobileNav] = useState(false);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [today] = useState(() => new Date());
  const { data: session, status: authStatus } = useSession();
  async function loadDashboard() { setDashboardLoading(true); try { const response = await fetch("/api/dashboard"); setDashboard(response.ok ? await response.json() : null); } finally { setDashboardLoading(false); } }
  useEffect(() => { let cancelled = false; fetch("/api/dashboard").then((response) => response.ok ? response.json() : null).then((data: DashboardData | null) => { if (!cancelled) startTransition(() => { setDashboard(data); setDashboardLoading(false); }); }).catch(() => { if (!cancelled) setDashboardLoading(false); }); return () => { cancelled = true; }; }, [authStatus]);
  useEffect(() => onReconnect(() => { if (authStatus === "authenticated") loadDashboard(); }), [authStatus]);
  const displaySessions = dashboard?.today.revisions.map((session) => ({ id: session.id, time: session.startTime ?? "À planifier", title: session.title, meta: `${session.subject.name} · ${session.type}`, tone: "orange", duration: `${session.duration} min` })) ?? (authStatus === "authenticated" ? [] : sessions.map((session, index) => ({ ...session, id: `preview-${index}` })));
  const displaySubjects = dashboard?.subjects.map((subject) => ({ name: subject.name, short: subject.shortName, mastery: subject.chapters.length ? Math.round(subject.chapters.reduce((total, chapter) => total + chapter.mastery, 0) / subject.chapters.length) : 0, color: subject.color })) ?? (authStatus === "authenticated" ? [] : subjects);
  const workloadLabel = dashboard ? ({ low: "Faible", normal: "Normale", high: "Élevée", critical: "Critique" }[dashboard.workload] ?? "Normale") : authStatus === "authenticated" ? "Aucune donnée" : "Normale";
  const nextEvaluation = dashboard?.today.evaluations[0];
  const daysToEvaluation = nextEvaluation ? Math.max(0, Math.ceil((new Date(nextEvaluation.date).getTime() - today.getTime()) / 86_400_000)) : null;
  const firstName = session?.user?.name?.split(" ")[0] ?? "Ismaël";
  const dateLabel = today.toLocaleDateString("fr-FR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" }).toUpperCase();
  const dateStrip = Array.from({ length: 5 }, (_, index) => { const date = new Date(today); date.setDate(date.getDate() + index); return { key: date.toISOString().slice(0, 10), day: date.toLocaleDateString("fr-FR", { weekday: "short" }).replace(".", "").slice(0, 3).toUpperCase(), date: String(date.getDate()).padStart(2, "0") }; });
  const focus = dashboard?.focus;
  const focusName = focus?.name ?? (authStatus === "authenticated" ? null : "Suites numériques");
  const focusMastery = focus?.mastery ?? 72;
  const focusMeta = focus ? `${focus.subject.name} · Coefficient ${focus.subject.coefficient}` : "Mathématiques · Coefficient 5";
  function daysUntil(value: string) { return Math.max(0, Math.ceil((new Date(value).getTime() - today.getTime()) / 86_400_000)); }
  const deadlineRows: Array<DeadlineItem & { time: number }> = dashboard ? [
    ...dashboard.today.evaluations.map((evaluation) => ({ id: `eval-${evaluation.id}`, time: new Date(evaluation.date).getTime(), title: evaluation.title, meta: `${evaluation.subject.name} · ${new Date(evaluation.date).toLocaleDateString("fr-FR")}`, days: `J-${daysUntil(evaluation.date)}`, tone: "orange" })),
    ...dashboard.today.homework.map((homework) => ({ id: `hw-${homework.id}`, time: new Date(homework.dueDate).getTime(), title: homework.title, meta: `${homework.subject.name} · Devoir à rendre`, days: new Date(homework.dueDate).getTime() < today.getTime() ? "En retard" : `J-${daysUntil(homework.dueDate)}`, tone: "blue" })),
  ].sort((a, b) => a.time - b.time) : previewDeadlines.map((item, index) => ({ ...item, time: index }));
  async function completeRevision(id: string) { if (!(await queuedFetch(`/api/revisions/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "completed" }) })).ok) return; await loadDashboard(); }
  return <main className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark">T</div><div><strong>TERMINAL</strong><span>OS / 2026</span></div></div>
      <div className="workspace"><span className="status-dot" /> Espace personnel <ChevronRight size={14} /></div>
      <nav className="nav-list" aria-label="Navigation principale"><span className="nav-caption">PILOTAGE</span>{navItems.slice(0, 5).map((item) => <NavItem key={item.label} {...item} active={active === item.label} onClick={() => setActive(item.label)} />)}<span className="nav-caption nav-caption-spaced">RESSOURCES</span>{navItems.slice(5).map((item) => <NavItem key={item.label} {...item} active={active === item.label} onClick={() => setActive(item.label)} />)}</nav>
      <div className="sidebar-bottom"><NavItem label="Paramètres" icon={Settings} active={active === "Paramètres"} onClick={() => setActive("Paramètres")} /><div className="profile"><div className="avatar">{session?.user?.name?.slice(0, 2).toUpperCase() ?? "IA"}</div><div><strong>{session?.user?.name ?? "Ismaël A."}</strong><span>Terminale · 2026</span></div><MoreHorizontal size={18} /></div></div>
    </aside>
    <section className="content-area">
      <header className="topbar"><button className="icon-button mobile-only" aria-label="Ouvrir le menu" onClick={() => setShowMobileNav(true)}><Menu size={20} /></button><div className="breadcrumb"><span>TERMINAL OS</span><ChevronRight size={14} /><strong>{active.toUpperCase()}</strong></div><div className="top-actions"><span className="sync-label"><span className="status-dot" /> {authStatus === "authenticated" ? "Compte synchronisé" : "Mode aperçu"}</span><button className="icon-button"><PanelLeft size={18} /></button>{session ? <button className="avatar avatar-top" onClick={() => signOut({ callbackUrl: "/" })} aria-label="Se déconnecter">{session.user?.name?.slice(0, 2).toUpperCase() ?? "IA"}</button> : <button className="secondary-button top-login" onClick={() => signIn("google")}>Connexion</button>}</div></header>
      {active === "Dashboard" ? <div className="page-content"><div className="page-heading"><div><p className="eyebrow">{dateLabel}</p><h1>Bonjour {firstName}<span className="accent">.</span></h1><p className="muted">Voici ce qui mérite ton attention aujourd&apos;hui.</p></div><button className="primary-button" onClick={() => setShowQuickAdd(true)}><CirclePlus size={18} /> Ajouter</button></div>
        <section className="metrics-grid"><Metric label="Charge de travail" value={dashboardLoading ? "…" : workloadLabel} detail={dashboard ? `${dashboard.week.sessions} sessions · ${dashboard.week.plannedMinutes} min` : authStatus === "authenticated" ? "Aucune session" : "3 sessions · 1h 25"} icon={<AlarmClock size={18} />} tone="orange" /><Metric label="Progression générale" value={dashboard ? `${dashboard.progression.mastery}%` : authStatus === "authenticated" ? "—" : "76%"} detail={dashboard?.progression.averageGrade ? `Moyenne ${dashboard.progression.averageGrade}/20` : "À calculer"} icon={<ArrowUpRight size={18} />} tone="green" /><Metric label="Prochain contrôle" value={daysToEvaluation === null ? "—" : `J-${daysToEvaluation}`} detail={nextEvaluation ? `${nextEvaluation.subject.name} · ${nextEvaluation.title}` : "Aucun contrôle prévu"} icon={<ClipboardCheck size={18} />} tone="blue" /></section>
        <div className="dashboard-grid"><section className="panel agenda-panel"><PanelHeader title="À faire aujourd&apos;hui" link="Voir le calendrier" onLinkClick={() => setActive("Calendrier")} /><div className="date-strip">{dateStrip.map((chip, index) => <div className={`date-chip ${index === 0 ? "active" : ""}`} key={chip.key}><span>{chip.day}</span><strong>{chip.date}</strong></div>)}</div><div className="session-list">{displaySessions.length ? displaySessions.map((session) => <div className="session-row" key={session.id}><span className="session-time">{session.time}</span><span className={`session-marker ${session.tone}`} /><div className="session-info"><strong>{session.title}</strong><span>{session.meta}</span></div><span className="session-duration">{session.duration}</span><button className="check-button" onClick={() => completeRevision(session.id)} aria-label={`Marquer ${session.title} comme terminé`}><Check size={15} /></button></div>) : <p className="empty-state">Aucune révision prévue aujourd&apos;hui.</p>}</div><button className="text-button" onClick={() => setShowQuickAdd(true)}>+ Ajouter une session</button></section>
          <section className="panel focus-panel"><PanelHeader title="Focus du moment" />{focusName ? (<><div className="focus-visual"><div className="ring"><span>{focusMastery}<small>%</small></span></div><div><p className="eyebrow">CHAPITRE À RENFORCER</p><h3>{focusName}</h3><p className="muted">{focusMeta}</p></div></div><div className="focus-note"><Sparkles size={16} /><span>Deux petites sessions cette semaine devraient suffire à stabiliser ta maîtrise.</span></div><button className="secondary-button" onClick={() => setActive("Révisions")}>Lancer une session <ArrowUpRight size={16} /></button></>) : <p className="empty-state">Ajoute des chapitres à tes matières pour cibler tes révisions.</p>}</section></div>
        <div className="lower-grid"><section className="panel"><PanelHeader title="Mes matières" link="Gérer les matières" onLinkClick={() => setActive("Cours")} /><div className="subject-list">{displaySubjects.map((subject) => <div className="subject-row" key={subject.name}><span className="subject-icon" style={{ backgroundColor: subject.color }}>{subject.short.slice(0, 2)}</span><div className="subject-name"><strong>{subject.name}</strong><span>{subject.mastery < 60 ? "À renforcer" : subject.mastery < 80 ? "En cours" : "Maîtrisé"}</span></div><div className="progress-track"><span style={{ width: `${subject.mastery}%`, backgroundColor: subject.color }} /></div><strong className="subject-score">{subject.mastery}%</strong><ChevronRight size={16} className="row-chevron" /></div>)}</div></section><section className="panel deadlines"><PanelHeader title="Prochaines échéances" link="Tout voir" onLinkClick={() => setActive("Évaluations")} />{deadlineRows.length ? deadlineRows.map((item) => <Deadline key={item.id} title={item.title} meta={item.meta} days={item.days} tone={item.tone} />) : <p className="empty-state">Aucune échéance dans les 30 prochains jours.</p>}</section></div>
      </div> : active === "Calendrier" ? <CalendarWorkspace /> : active === "Fiches" ? <LearningWorkspace mode="sheets" /> : active === "Flashcards" ? <LearningWorkspace mode="flashcards" /> : active === "Quiz" ? <LearningWorkspace mode="quiz" /> : active === "Statistiques" ? <StatisticsWorkspace /> : active === "Automatisations" ? <AutomationWorkspace /> : <PhaseOneWorkspace section={active} />}
    </section>
    <nav className="bottom-nav">{navItems.slice(0, 5).map((item) => <button key={item.label} className={active === item.label ? "active" : ""} onClick={() => setActive(item.label)}><item.icon size={19} /><span>{item.label === "Évaluations" ? "Évals" : item.label}</span></button>)}</nav>
    {showQuickAdd && <div className="modal-backdrop" onClick={() => setShowQuickAdd(false)}><div className="quick-modal" onClick={(event) => event.stopPropagation()}><div className="modal-heading"><div><p className="eyebrow">ACTION RAPIDE</p><h2>Que veux-tu ajouter ?</h2></div><button className="icon-button" onClick={() => setShowQuickAdd(false)} aria-label="Fermer"><X size={18} /></button></div><div className="quick-actions">{["Un cours", "Un contrôle", "Un devoir", "Une note", "Une révision"].map((label, index) => <button key={label} onClick={() => { setShowQuickAdd(false); setActive(label === "Un contrôle" ? "Évaluations" : label === "Un cours" ? "Cours" : label === "Une révision" ? "Révisions" : label === "Une note" ? "Cours" : "Révisions"); }}><span className={`quick-icon q-${index}`}><CirclePlus size={17} /></span><strong>{label}</strong><ChevronRight size={16} /></button>)}</div></div></div>}
    {showMobileNav && <div className="modal-backdrop" onClick={() => setShowMobileNav(false)}><div className="quick-modal" onClick={(event) => event.stopPropagation()}><div className="modal-heading"><div><p className="eyebrow">NAVIGATION</p><h2>Toutes les sections</h2></div><button className="icon-button" onClick={() => setShowMobileNav(false)} aria-label="Fermer"><X size={18} /></button></div><div className="quick-actions">{navItems.map((item, index) => <button key={item.label} onClick={() => { setActive(item.label); setShowMobileNav(false); }}><span className={`quick-icon q-${index % 5}`}><item.icon size={17} /></span><strong>{item.label}</strong><ChevronRight size={16} /></button>)}</div></div></div>}
  </main>;
}

function NavItem({ label, icon: Icon, active, onClick }: { label: string; icon: typeof LayoutDashboard; active: boolean; onClick: () => void }) { return <button className={`nav-item ${active ? "active" : ""}`} onClick={onClick}><Icon size={18} /><span>{label}</span>{active && <span className="nav-active-dot" />}</button>; }
function Metric({ label, value, detail, icon, tone }: { label: string; value: string; detail: string; icon: React.ReactNode; tone: string }) { return <div className="metric"><div className={`metric-icon ${tone}`}>{icon}</div><div><p>{label}</p><strong>{value}</strong><span>{detail}</span></div></div>; }
function PanelHeader({ title, link, onLinkClick }: { title: string; link?: string; onLinkClick?: () => void }) { return <div className="panel-header"><h2>{title}</h2>{link && <button className="panel-link" onClick={onLinkClick}>{link}<ArrowUpRight size={14} /></button>}</div>; }
function Deadline({ title, meta, days, tone }: { title: string; meta: string; days: string; tone: string }) { return <div className="deadline-row"><span className={`deadline-line ${tone}`} /><div><strong>{title}</strong><span>{meta}</span></div><b>{days}</b></div>; }
