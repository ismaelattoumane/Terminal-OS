"use client";

import { startTransition, useEffect, useState } from "react";

type Statistics = {
  summary: { averageGrade: number | null; averageMastery: number; weakChapters: number; totalSessions: number; completedSessions: number; quizCount: number; flashcardCount: number; sheetCount: number; gradeCount: number };
  gradesTrend: Array<{ date: string; subject: string; grade: number; maxGrade: number }>;
  masteryBySubject: Array<{ id: string; name: string; color: string; mastery: number; chapterCount: number; averageGrade: number | null }>;
  quizTrend: Array<{ date: string; chapter: string; subject: string | null; score: number }>;
  sessionsPerWeek: Array<{ weekStart: string; count: number; plannedMinutes: number; completedMinutes: number }>;
};

export function StatisticsWorkspace() {
  const [stats, setStats] = useState<Statistics | null>(null);
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/statistics")
      .then(async (response) => { if (response.ok) return response.json(); return null; })
      .then((data: Statistics | null) => { if (!cancelled) startTransition(() => setStats(data)); })
      .catch(() => { if (!cancelled) setFeedback("Statistiques indisponibles."); });
    return () => { cancelled = true; };
  }, []);

  const maxMastery = Math.max(100, ...(stats?.masteryBySubject.map((subject) => subject.mastery) ?? []));
  const maxSessionCount = Math.max(1, ...(stats?.sessionsPerWeek.map((week) => week.count) ?? [1]));

  return (
    <div className="">
      <div className="page-heading">
        <div>
          <p className="eyebrow">STATISTIQUES</p>
          <h1>Statistiques</h1>
          <p className="muted">Moyennes, maîtrise par matière, tendances de charge et d&apos;auto-évaluation.</p>
        </div>
        {feedback && <span className="workspace-message">{feedback}</span>}
      </div>
      {!stats ? <p className="empty-state">Chargement…</p> : <>
        <div className="stats-row">
          <Metric label="Moyenne générale" value={stats.summary.averageGrade == null ? "—" : `${stats.summary.averageGrade}/20`} detail={`${stats.summary.gradeCount} note(s)`} />
          <Metric label="Maîtrise moyenne" value={`${stats.summary.averageMastery}%`} detail={`${stats.summary.weakChapters} chapitre(s) faible(s)`} />
          <Metric label="Sessions de révision" value={String(stats.summary.totalSessions)} detail={`${stats.summary.completedSessions} terminée(s)`} />
          <Metric label="Auto-évaluation" value={String(stats.summary.quizCount)} detail={`${stats.summary.flashcardCount} flashcards · ${stats.summary.sheetCount} fiches`} />
        </div>
        <div className="chart-grid">
          <section className="data-list">
            <div className="list-heading"><h2>Maîtrise par matière</h2><span>{stats.masteryBySubject.length}</span></div>
            {stats.masteryBySubject.length ? stats.masteryBySubject.map((subject) => (
              <div className="bar-item" key={subject.id}>
                <div className="bar-label"><strong>{subject.name}</strong><span>{subject.mastery}%{subject.averageGrade != null ? ` · ${subject.averageGrade}/20` : ""}</span></div>
                <div className="bar-track"><span className="bar-fill" style={{ width: `${Math.round(subject.mastery / maxMastery * 100)}%`, backgroundColor: subject.color }} /></div>
              </div>
            )) : <p className="empty-state">Aucune matière pour le moment.</p>}
          </section>
          <section className="data-list">
            <div className="list-heading"><h2>Sessions par semaine (8 sem.)</h2><span>{stats.sessionsPerWeek.reduce((sum, week) => sum + week.count, 0)}</span></div>
            {stats.sessionsPerWeek.map((week) => (
              <div className="bar-item" key={week.weekStart}>
                <div className="bar-label"><strong>{new Date(`${week.weekStart}T12:00:00`).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}</strong><span>{week.count} session(s) · {Math.round(week.completedMinutes / 60 * 10) / 10} h</span></div>
                <div className="bar-track"><span className="bar-fill" style={{ width: `${Math.round(week.count / maxSessionCount * 100)}%`, backgroundColor: "#37aa7a" }} /></div>
              </div>
            ))}
          </section>
        </div>
        <div className="chart-grid">
          <section className="data-list">
            <div className="list-heading"><h2>Dernières notes</h2><span>{stats.gradesTrend.length}</span></div>
            {stats.gradesTrend.length ? stats.gradesTrend.map((grade, index) => (
              <div className="calendar-event" key={index}><span className="event-color" /><div><strong>{grade.subject}</strong><span>{new Date(grade.date).toLocaleDateString("fr-FR")}</span></div><b>{grade.grade}/{grade.maxGrade}</b></div>
            )) : <p className="empty-state">Aucune note enregistrée.</p>}
          </section>
          <section className="data-list">
            <div className="list-heading"><h2>Tentatives de quiz</h2><span>{stats.quizTrend.length}</span></div>
            {stats.quizTrend.length ? stats.quizTrend.map((attempt, index) => (
              <div className="calendar-event" key={index}><span className="event-color" /><div><strong>{attempt.chapter}</strong><span>{attempt.subject ?? ""} · {new Date(attempt.date).toLocaleDateString("fr-FR")}</span></div><b>{Math.round(attempt.score * 100)}%</b></div>
            )) : <p className="empty-state">Fais un quiz d&apos;auto-évaluation pour enrichir ces tendances.</p>}
          </section>
        </div>
      </>}
    </div>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="metric"><div><p>{label}</p><strong>{value}</strong><span>{detail}</span></div></div>;
}