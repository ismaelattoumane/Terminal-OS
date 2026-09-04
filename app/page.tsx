"use client";

import { useEffect, useState } from "react";
import { AlarmClock, ArrowUpRight, BookOpen, CalendarDays, Check, ChevronRight, CirclePlus, ClipboardCheck, GraduationCap, LayoutDashboard, Menu, MoreHorizontal, PanelLeft, Settings, Sparkles, Target, X } from "lucide-react";
import { PhaseOneWorkspace } from "@/components/phase-one-workspace";
import { CalendarWorkspace } from "@/components/calendar-workspace";

const navItems = [
  { label: "Dashboard", icon: LayoutDashboard }, { label: "Cours", icon: BookOpen }, { label: "Évaluations", icon: ClipboardCheck },
  { label: "Révisions", icon: AlarmClock }, { label: "Calendrier", icon: CalendarDays }, { label: "Notes", icon: GraduationCap },
  { label: "Fiches", icon: Sparkles }, { label: "Flashcards", icon: Target },
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
type DashboardData = { today: { revisions: Array<{ title: string; startTime: string | null; duration: number; subject: { name: string }; type: string }>; homework: unknown[]; evaluations: unknown[] }; week: { sessions: number; plannedMinutes: number }; progression: { mastery: number; averageGrade: number | null }; workload: string; subjects: Array<{ name: string; shortName: string; color: string; chapters: Array<{ mastery: number }> }>; alerts: { overdueHomework: number; weakChapters: number } };

export default function Home() {
  const [active, setActive] = useState("Dashboard");
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  useEffect(() => { fetch("/api/dashboard").then((response) => response.ok ? response.json() : null).then((data: DashboardData | null) => { if (data) setDashboard(data); }).catch(() => undefined); }, []);
  const displaySessions = dashboard?.today.revisions.length ? dashboard.today.revisions.map((session) => ({ time: session.startTime ?? "À planifier", title: session.title, meta: `${session.subject.name} · ${session.type}`, tone: "orange", duration: `${session.duration} min` })) : sessions;
  const displaySubjects = dashboard?.subjects.length ? dashboard.subjects.map((subject) => ({ name: subject.name, short: subject.shortName, mastery: subject.chapters.length ? Math.round(subject.chapters.reduce((total, chapter) => total + chapter.mastery, 0) / subject.chapters.length) : 0, color: subject.color })) : subjects;
  const workloadLabel = dashboard ? ({ low: "Faible", normal: "Normale", high: "Élevée", critical: "Critique" }[dashboard.workload] ?? "Normale") : "Normale";
  return <main className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark">T</div><div><strong>TERMINAL</strong><span>OS / 2026</span></div></div>
      <div className="workspace"><span className="status-dot" /> Espace personnel <ChevronRight size={14} /></div>
      <nav className="nav-list" aria-label="Navigation principale"><span className="nav-caption">PILOTAGE</span>{navItems.slice(0, 5).map((item) => <NavItem key={item.label} {...item} active={active === item.label} onClick={() => setActive(item.label)} />)}<span className="nav-caption nav-caption-spaced">RESSOURCES</span>{navItems.slice(5).map((item) => <NavItem key={item.label} {...item} active={active === item.label} onClick={() => setActive(item.label)} />)}</nav>
      <div className="sidebar-bottom"><NavItem label="Paramètres" icon={Settings} active={active === "Paramètres"} onClick={() => setActive("Paramètres")} /><div className="profile"><div className="avatar">IA</div><div><strong>Ismaël A.</strong><span>Terminale · 2026</span></div><MoreHorizontal size={18} /></div></div>
    </aside>
    <section className="content-area">
      <header className="topbar"><button className="icon-button mobile-only" aria-label="Ouvrir le menu"><Menu size={20} /></button><div className="breadcrumb"><span>TERMINAL OS</span><ChevronRight size={14} /><strong>{active.toUpperCase()}</strong></div><div className="top-actions"><span className="sync-label"><span className="status-dot" /> Synchronisé il y a 2 min</span><button className="icon-button"><PanelLeft size={18} /></button><button className="avatar avatar-top">IA</button></div></header>
      {active === "Dashboard" ? <div className="page-content"><div className="page-heading"><div><p className="eyebrow">VENDREDI 04 SEPTEMBRE 2026</p><h1>Bonjour Ismaël<span className="accent">.</span></h1><p className="muted">Voici ce qui mérite ton attention aujourd&apos;hui.</p></div><button className="primary-button" onClick={() => setShowQuickAdd(true)}><CirclePlus size={18} /> Ajouter</button></div>
        <section className="metrics-grid"><Metric label="Charge de travail" value={workloadLabel} detail={dashboard ? `${dashboard.week.sessions} sessions · ${dashboard.week.plannedMinutes} min` : "3 sessions · 1h 25"} icon={<AlarmClock size={18} />} tone="orange" /><Metric label="Progression générale" value={`${dashboard?.progression.mastery ?? 76}%`} detail={dashboard?.progression.averageGrade ? `Moyenne ${dashboard.progression.averageGrade}/20` : "+4% cette semaine"} icon={<ArrowUpRight size={18} />} tone="green" /><Metric label="Prochain contrôle" value="J-12" detail="Maths · Suites" icon={<ClipboardCheck size={18} />} tone="blue" /></section>
        <div className="dashboard-grid"><section className="panel agenda-panel"><PanelHeader title="À faire aujourd&apos;hui" link="Voir le calendrier" /><div className="date-strip">{["VEN|04", "SAM|05", "DIM|06", "LUN|07", "MAR|08"].map((item, index) => { const [day, date] = item.split("|"); return <div className={`date-chip ${index === 0 ? "active" : ""}`} key={item}><span>{day}</span><strong>{date}</strong></div>; })}</div><div className="session-list">{displaySessions.map((session) => <div className="session-row" key={session.title}><span className="session-time">{session.time}</span><span className={`session-marker ${session.tone}`} /><div className="session-info"><strong>{session.title}</strong><span>{session.meta}</span></div><span className="session-duration">{session.duration}</span><button className="check-button" aria-label={`Marquer ${session.title} comme terminé`}><Check size={15} /></button></div>)}</div><button className="text-button">+ Ajouter une session</button></section>
          <section className="panel focus-panel"><PanelHeader title="Focus du moment" /><div className="focus-visual"><div className="ring"><span>72<small>%</small></span></div><div><p className="eyebrow">CHAPITRE À RENFORCER</p><h3>Suites numériques</h3><p className="muted">Mathématiques · Coefficient 5</p></div></div><div className="focus-note"><Sparkles size={16} /><span>Deux petites sessions cette semaine devraient suffire à stabiliser ta maîtrise.</span></div><button className="secondary-button">Lancer une session <ArrowUpRight size={16} /></button></section></div>
        <div className="lower-grid"><section className="panel"><PanelHeader title="Mes matières" link="Gérer les matières" /><div className="subject-list">{displaySubjects.map((subject) => <div className="subject-row" key={subject.name}><span className="subject-icon" style={{ backgroundColor: subject.color }}>{subject.short.slice(0, 2)}</span><div className="subject-name"><strong>{subject.name}</strong><span>{subject.mastery < 60 ? "À renforcer" : subject.mastery < 80 ? "En cours" : "Maîtrisé"}</span></div><div className="progress-track"><span style={{ width: `${subject.mastery}%`, backgroundColor: subject.color }} /></div><strong className="subject-score">{subject.mastery}%</strong><ChevronRight size={16} className="row-chevron" /></div>)}</div></section><section className="panel deadlines"><PanelHeader title="Prochaines échéances" link="Tout voir" /><Deadline title="Contrôle de Maths" meta="Suites · 16 septembre" days="J-12" tone="orange" /><Deadline title="Devoir de philosophie" meta="Dissertation · 19 septembre" days="J-15" tone="purple" /><Deadline title="Oral d&apos;anglais" meta="Expression · 24 septembre" days="J-20" tone="green" /></section></div>
      </div> : active === "Calendrier" ? <CalendarWorkspace /> : <PhaseOneWorkspace section={active} />}
    </section>
    <nav className="bottom-nav">{navItems.slice(0, 5).map((item) => <button key={item.label} className={active === item.label ? "active" : ""} onClick={() => setActive(item.label)}><item.icon size={19} /><span>{item.label === "Évaluations" ? "Évals" : item.label}</span></button>)}</nav>
    {showQuickAdd && <div className="modal-backdrop" onClick={() => setShowQuickAdd(false)}><div className="quick-modal" onClick={(event) => event.stopPropagation()}><div className="modal-heading"><div><p className="eyebrow">ACTION RAPIDE</p><h2>Que veux-tu ajouter ?</h2></div><button className="icon-button" onClick={() => setShowQuickAdd(false)} aria-label="Fermer"><X size={18} /></button></div><div className="quick-actions">{["Un cours", "Un contrôle", "Un devoir", "Une note", "Une révision"].map((label, index) => <button key={label} onClick={() => setShowQuickAdd(false)}><span className={`quick-icon q-${index}`}><CirclePlus size={17} /></span><strong>{label}</strong><ChevronRight size={16} /></button>)}</div></div></div>}
  </main>;
}

function NavItem({ label, icon: Icon, active, onClick }: { label: string; icon: typeof LayoutDashboard; active: boolean; onClick: () => void }) { return <button className={`nav-item ${active ? "active" : ""}`} onClick={onClick}><Icon size={18} /><span>{label}</span>{active && <span className="nav-active-dot" />}</button>; }
function Metric({ label, value, detail, icon, tone }: { label: string; value: string; detail: string; icon: React.ReactNode; tone: string }) { return <div className="metric"><div className={`metric-icon ${tone}`}>{icon}</div><div><p>{label}</p><strong>{value}</strong><span>{detail}</span></div></div>; }
function PanelHeader({ title, link }: { title: string; link?: string }) { return <div className="panel-header"><h2>{title}</h2>{link && <button className="panel-link">{link}<ArrowUpRight size={14} /></button>}</div>; }
function Deadline({ title, meta, days, tone }: { title: string; meta: string; days: string; tone: string }) { return <div className="deadline-row"><span className={`deadline-line ${tone}`} /><div><strong>{title}</strong><span>{meta}</span></div><b>{days}</b></div>; }
