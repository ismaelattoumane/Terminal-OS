"use client";

import { FormEvent, useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";

type CalException = { id: string; date: string; type: string; label: string | null };
const TYPES = [{ value: "holiday", label: "Jour férié" }, { value: "vacation", label: "Vacances" }, { value: "no_class", label: "Pas cours" }, { value: "exceptional", label: "Exceptionnel" }];

export function ExceptionsWorkspace() {
  const [exceptions, setExceptions] = useState<CalException[]>([]);
  const [date, setDate] = useState("");
  const [type, setType] = useState("vacation");
  const [label, setLabel] = useState("");
  const [feedback, setFeedback] = useState("");

  async function load() {
    const r = await fetch("/api/calendar/exceptions");
    if (r.ok) {
      const data = (await r.json()) as CalException[];
      setExceptions(data);
    }
  }
  useEffect(() => {
    let cancelled = false;
    fetch("/api/calendar/exceptions").then(async (r) => {
      if (!cancelled && r.ok) setExceptions(await r.json());
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  async function add(event: FormEvent) {
    event.preventDefault();
    if (!date) return;
    const r = await fetch("/api/calendar/exceptions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ date, type, label: label || undefined }) });
    if (r.ok) { setDate(""); setLabel(""); setFeedback("Journée ajoutée."); void load(); }
    else setFeedback("Erreur lors de l'ajout.");
  }
  async function remove(id: string) {
    await fetch(`/api/calendar/exceptions/${id}`, { method: "DELETE" });
    void load();
  }

  return (
    <section className="calendar-board">
      <div className="list-heading"><h2>Vacances & jours fériés</h2><span>{exceptions.length}</span></div>
      <form className="exception-form" onSubmit={add}>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        <select value={type} onChange={(e) => setType(e.target.value)}>
          {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <input placeholder="Libellé (ex: Toussaint)" value={label} onChange={(e) => setLabel(e.target.value)} />
        <button className="secondary-button" type="submit"><Plus size={16} /> Ajouter</button>
      </form>
      {feedback && <p className="import-success">{feedback}</p>}
      {exceptions.length ? exceptions.map((e) => (
        <div className="calendar-exception" key={e.id}>
          <span className="event-color school" />
          <div><strong>{new Date(e.date).toLocaleDateString("fr-FR", { dateStyle: "medium" })}</strong><span>{TYPES.find((t) => t.value === e.type)?.label}{e.label ? ` · ${e.label}` : ""}</span></div>
          <button className="delete-button" onClick={() => remove(e.id)} aria-label="Supprimer"><Trash2 size={15} /></button>
        </div>
      )) : <p className="empty-state">Aucune journée bloquée. Le planner évite automatiquement vacances et jours fériés.</p>}
    </section>
  );
}
