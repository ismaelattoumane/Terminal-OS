"use client";

import { FormEvent, startTransition, useEffect, useState } from "react";
import { CalendarDays, Plus, RefreshCw, Trash2 } from "lucide-react";
import { signIn } from "next-auth/react";

type CalendarItem = { id: string; title: string; start: string; end: string; type: string };
type Schedule = { id: string; dayOfWeek: number; startTime: string; endTime: string; location: string | null; subject: { name: string } | null };
type GoogleStatus = { connected: boolean; configured: boolean; redirectUri: string; callbackMatchesNextAuth: boolean; timezone: string; hint: string };
type SyncResult = { synced: number; imported: number; eventIds: string[] } | null;

const days = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

export function CalendarWorkspace() {
  const [events, setEvents] = useState<CalendarItem[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("18:00");
  const [endTime, setEndTime] = useState("19:00");
  const [dayOfWeek, setDayOfWeek] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [google, setGoogle] = useState<GoogleStatus | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult>(null);

  async function load() {
    const [eventResponse, scheduleResponse] = await Promise.all([fetch("/api/calendar"), fetch("/api/schedule")]);
    if (eventResponse.ok) setEvents(await eventResponse.json());
    if (scheduleResponse.ok) setSchedules(await scheduleResponse.json());
  }

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetch("/api/calendar"), fetch("/api/schedule"), fetch("/api/calendar/status")]).then(async ([eventResponse, scheduleResponse, statusResponse]) => {
      const eventData = eventResponse.ok ? await eventResponse.json() : [];
      const scheduleData = scheduleResponse.ok ? await scheduleResponse.json() : [];
      const googleData = statusResponse.ok ? await statusResponse.json() : null;
      if (!cancelled) startTransition(() => { setEvents(eventData); setSchedules(scheduleData); setGoogle(googleData); });
    }).catch(() => { if (!cancelled) setFeedback("Connecte-toi pour gérer ton calendrier."); });
    return () => { cancelled = true; };
  }, []);

  async function createEvent(event: FormEvent) {
    event.preventDefault();
    const response = await fetch("/api/calendar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, start: `${date}T${startTime}:00`, end: `${date}T${endTime}:00`, type: "personal" }) });
    if (response.ok) { setTitle(""); setFeedback("Événement ajouté."); await load(); } else setFeedback("Impossible d'ajouter l'événement.");
  }

  async function createSchedule(event: FormEvent) {
    event.preventDefault();
    const response = await fetch("/api/schedule", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dayOfWeek, startTime, endTime }) });
    if (response.ok) { setFeedback("Créneau ajouté."); await load(); } else setFeedback("Impossible d'ajouter le créneau.");
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
            <div className="form-row">
              <label>Début<input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} /></label>
              <label>Fin<input type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} /></label>
            </div>
            <button className="secondary-button" type="submit"><CalendarDays size={16} /> Ajouter un cours</button>
          </form>
        </section>
      </div>
      <section className="calendar-board">
        <div className="list-heading"><h2>Cette semaine</h2><span>{events.length} événement(s)</span></div>
        {events.length ? events.map((event) => <div className="calendar-event" key={event.id}><span className="event-color" /><div><strong>{event.title}</strong><span>{new Date(event.start).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" })} - {new Date(event.end).toLocaleTimeString("fr-FR", { timeStyle: "short" })}</span></div><b>{event.type}</b></div>) : <p className="empty-state">Aucun événement personnel pour le moment.</p>}
      </section>
      <section className="calendar-board">
        <div className="list-heading"><h2>Créneaux de cours protégés</h2><span>{schedules.length}</span></div>
        {schedules.length ? schedules.map((schedule) => <div className="calendar-event" key={schedule.id}><span className="event-color school" /><div><strong>{days[schedule.dayOfWeek]}</strong><span>{schedule.startTime} - {schedule.endTime}{schedule.location ? ` · ${schedule.location}` : ""}</span></div><button className="delete-button" onClick={() => fetch(`/api/schedule/${schedule.id}`, { method: "DELETE" }).then(load)} aria-label="Supprimer le créneau"><Trash2 size={15} /></button></div>) : <p className="empty-state">Ajoute les horaires de tes cours pour que le planner les évite.</p>}
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
