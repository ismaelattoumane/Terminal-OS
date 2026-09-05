"use client";

import { FormEvent, startTransition, useEffect, useState } from "react";
import { CalendarDays, Plus, RefreshCw, Trash2 } from "lucide-react";
import { signIn } from "next-auth/react";
import { queuedFetch } from "@/lib/offline-queue";

type CalendarItem = { id: string; title: string; start: string; end: string; type: string; source: "internal" | "google" | "notion" };
type Schedule = { id: string; dayOfWeek: number; startTime: string; endTime: string; location: string | null; subject: { name: string } | null };
type SubjectLite = { id: string; name: string };
type GoogleStatus = { connected: boolean; configured: boolean; redirectUri: string; callbackMatchesNextAuth: boolean; timezone: string; hint: string };
type SyncResult = { synced: number; imported: number; eventIds: string[] } | null;

const days = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

// B12 : le lundi de la semaine en cours, passé en paramètre `from` à l'API.
function startOfWeekISO() {
  const date = new Date();
  const offset = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - offset);
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
}

export function CalendarWorkspace() {
  const [events, setEvents] = useState<CalendarItem[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("18:00");
  const [endTime, setEndTime] = useState("19:00");
  const [dayOfWeek, setDayOfWeek] = useState(0);
  const [subjectId, setSubjectId] = useState("");
  const [location, setLocation] = useState("");
  const [subjects, setSubjects] = useState<SubjectLite[]>([]);
  const [feedback, setFeedback] = useState("");
  const [google, setGoogle] = useState<GoogleStatus | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult>(null);

  async function load() {
    const [eventResponse, scheduleResponse, subjectResponse] = await Promise.all([fetch(`/api/calendar?from=${encodeURIComponent(startOfWeekISO())}`), fetch("/api/schedule"), fetch("/api/subjects")]);
    if (eventResponse.ok) setEvents(await eventResponse.json());
    if (scheduleResponse.ok) setSchedules(await scheduleResponse.json());
    if (subjectResponse.ok) setSubjects(await subjectResponse.json());
  }

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetch(`/api/calendar?from=${encodeURIComponent(startOfWeekISO())}`), fetch("/api/schedule"), fetch("/api/calendar/status"), fetch("/api/subjects")]).then(async ([eventResponse, scheduleResponse, statusResponse, subjectResponse]) => {
      const eventData = eventResponse.ok ? await eventResponse.json() : [];
      const scheduleData = scheduleResponse.ok ? await scheduleResponse.json() : [];
      const googleData = statusResponse.ok ? await statusResponse.json() : null;
      const subjectData = subjectResponse.ok ? await subjectResponse.json() : [];
      if (!cancelled) startTransition(() => { setEvents(eventData); setSchedules(scheduleData); setGoogle(googleData); setSubjects(subjectData); });
    }).catch(() => { if (!cancelled) setFeedback("Connecte-toi pour gérer ton calendrier."); });
    return () => { cancelled = true; };
  }, []);

  async function createEvent(event: FormEvent) {
    event.preventDefault();
    // B20 : validation côté client avant d'appeler l'API.
    if (endTime <= startTime) { setFeedback("L'heure de fin doit être après l'heure de début."); return; }
    // B41 : mutation via queuedFetch pour la compatibilité hors-ligne (cohérence PWA).
    const response = await queuedFetch("/api/calendar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, start: `${date}T${startTime}:00`, end: `${date}T${endTime}:00`, type: "personal" }) });
    if (response.status === 202) { setTitle(""); setFeedback("Hors ligne : événement synchronisé dès la reconnexion."); return; }
    if (response.ok) { setTitle(""); setFeedback("Événement ajouté."); await load(); return; }
    const data = await response.json().catch(() => null) as { error?: string; details?: { formErrors?: string[]; fieldErrors?: Record<string, string[]> } } | null;
    const detail = data?.details?.formErrors?.[0] ?? Object.values(data?.details?.fieldErrors ?? {}).flat()[0] ?? data?.error;
    setFeedback(detail ? `Impossible d'ajouter l'événement : ${detail}` : "Impossible d'ajouter l'événement.");
  }

  // B11 : suppression d'un événement personnel.
  async function deleteEvent(id: string) {
    if (!window.confirm("Supprimer cet événement ? Cette action est définitive.")) return;
    const response = await queuedFetch(`/api/calendar/${id}`, { method: "DELETE" });
    if (response.status === 202) { setFeedback("Hors ligne : suppression synchronisée dès la reconnexion."); return; }
    if (response.ok) { setFeedback("Événement supprimé."); await load(); } else setFeedback("Suppression impossible.");
  }

  async function createSchedule(event: FormEvent) {
    event.preventDefault();
    if (endTime <= startTime) { setFeedback("L'heure de fin doit être après l'heure de début."); return; }
    const response = await queuedFetch("/api/schedule", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dayOfWeek, startTime, endTime, subjectId: subjectId || undefined, location: location.trim() || undefined }) });
    if (response.status === 202) { setLocation(""); setFeedback("Hors ligne : créneau synchronisé dès la reconnexion."); return; }
    if (response.ok) { setLocation(""); setFeedback("Créneau ajouté."); await load(); } else setFeedback("Impossible d'ajouter le créneau.");
  }

  async function syncGoogle() {
    setSyncing(true);
    try {
      const response = await fetch("/api/calendar/sync", { method: "POST" });
      if (!response.ok) { setFeedback(response.status === 412 ? "Google Calendar n'est pas encore connecté." : "Synchronisation impossible."); return; }
      const result: SyncResult = await response.json();
      setSyncResult(result);
      setFeedback(`Google Calendar synchronisé : ${result?.synced ?? 0} révisions, ${result?.imported ?? 0} événements importés.`);
      await load();
    } finally { setSyncing(false); }
  }

  return (
    <div className="workspace-page">
      <div className="workspace-heading">
        <div>
          <p className="eyebrow">PHASE 2 · CALENDRIER INTERNE + GOOGLE</p>
          <h1>Calendrier</h1>
          <p className="muted">Planifie tes événements, protège tes créneaux de révision et synchronise Google Calendar.</p>
        </div>
        {feedback && <span className="workspace-message">{feedback}</span>}
      </div>
      <GoogleBanner google={google} syncing={syncing} onSync={syncGoogle} />
      {syncResult && <p className="chart-muted">Dernière sync : {syncResult.synced} révision(s) créée(s) ou mise(s) à jour, {syncResult.imported} événement(s) importé(s).</p>}
      <div className="calendar-grid">
        <section className="data-form">
          <h2 className="form-title">Nouvel événement</h2>
          <form onSubmit={createEvent}>
            <label>Titre<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Rendez-vous" required /></label>
            <label>Date<input type="date" value={date} onChange={(event) => setDate(event.target.value)} required /></label>
            <div className="form-row">
              <label>Début<input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} /></label>
              <label>Fin<input type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} /></label>
            </div>
            <button className="primary-button" type="submit"><Plus size={16} /> Ajouter</button>
          </form>
        </section>
        <section className="data-form">
          <h2 className="form-title">Emploi du temps</h2>
          <form onSubmit={createSchedule}>
            <label>Jour<select value={dayOfWeek} onChange={(event) => setDayOfWeek(Number(event.target.value))}>{days.map((day, index) => <option key={day} value={index}>{day}</option>)}</select></label>
            <label>Matière (optionnel)<select value={subjectId} onChange={(event) => setSubjectId(event.target.value)}><option value="">Aucune</option>{subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select></label>
            <div className="form-row">
              <label>Début<input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} /></label>
              <label>Fin<input type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} /></label>
            </div>
            <label>Salle (optionnel)<input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="B204" /></label>
            <button className="secondary-button" type="submit"><CalendarDays size={16} /> Ajouter un cours</button>
          </form>
        </section>
      </div>
      <section className="calendar-board">
        <div className="list-heading"><h2>Cette semaine</h2><span>{events.length} événement(s)</span></div>
        {events.length ? events.map((event) => <div className="calendar-event" key={event.id}><span className="event-color" /><div><strong>{event.title}</strong><span>{new Date(event.start).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" })} - {new Date(event.end).toLocaleTimeString("fr-FR", { timeStyle: "short" })}{event.source === "google" ? " · Google Calendar" : ""}</span></div><b>{event.type}</b>{event.source !== "google" && <button className="delete-button" onClick={() => deleteEvent(event.id)} aria-label={`Supprimer ${event.title}`}><Trash2 size={15} /></button>}</div>) : <p className="empty-state">Aucun événement personnel pour le moment.</p>}
      </section>
      <section className="calendar-board">
        <div className="list-heading"><h2>Créneaux de cours protégés</h2><span>{schedules.length}</span></div>
        {schedules.length ? schedules.map((schedule) => <div className="calendar-event" key={schedule.id}><span className="event-color school" /><div><strong>{schedule.subject?.name ?? days[schedule.dayOfWeek]}</strong><span>{days[schedule.dayOfWeek]} · {schedule.startTime} - {schedule.endTime}{schedule.location ? ` · ${schedule.location}` : ""}</span></div><button className="delete-button" onClick={() => { if (window.confirm("Supprimer ce créneau ? Cette action est définitive.")) queuedFetch(`/api/schedule/${schedule.id}`, { method: "DELETE" }).then(load); }} aria-label="Supprimer le créneau"><Trash2 size={15} /></button></div>) : <p className="empty-state">Ajoute les horaires de tes cours pour que le planner les évite.</p>}
      </section>
    </div>
  );
}
function GoogleBanner({ google, syncing, onSync }: { google: GoogleStatus | null; syncing: boolean; onSync: () => Promise<void> }) {
  if (!google?.configured) {
    return (
      <section className="google-banner">
        <span className="g-icon"><CalendarDays size={16} /></span>
        <div><strong>Google Calendar non configuré</strong><span>Renseigne GOOGLE_CLIENT_ID et GOOGLE_CLIENT_SECRET pour synchroniser tes révisions.</span></div>
      </section>
    );
  }
  if (!google.connected) {
    return (
      <section className="google-banner">
        <span className="g-icon"><CalendarDays size={16} /></span>
        <div><strong>Connecte ton calendrier Google</strong><span>Consentement « offline », scope calendar.events. La synchronisation se fait côté serveur, sans jeton visible.</span></div>
        <button className="primary-button" type="button" onClick={() => { void signIn("google", { callbackUrl: window.location.pathname }); }}>Connecter <RefreshCw size={14} /></button>
      </section>
    );
  }
  return (
    <section className="google-banner">
      <span className="g-icon"><CalendarDays size={16} /></span>
      <div><strong>Google Calendar connecté</strong><span>Fuseau {google.timezone} · révisions synchronisées et événements importés sans doublons.</span></div>
      <button className="secondary-button" type="button" disabled={syncing} onClick={() => { void onSync(); }}>Synchroniser</button>
    </section>
  );
}
