"use client";

import { FormEvent, useRef, useState } from "react";
import { Check, FileUp, Trash2 } from "lucide-react";

type ParsedSlot = {
  dayOfWeek: number | null;
  startTime: string | null;
  endTime: string | null;
  subject: string | null;
  room: string | null;
  teacher: string | null;
  sourceLine: number;
  confidence: "high" | "medium" | "low";
  warnings: string[];
};
type ImportPreview = {
  sourceType: string;
  entryCount: number;
  daysDetected: string[];
  subjectsDetected: string[];
  slots: ParsedSlot[];
  stats: Record<string, number>;
};

const daysLabels = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

export function ScheduleImportWorkspace({ onImported }: { onImported: () => void }) {
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [mode, setMode] = useState<"replace" | "merge">("replace");
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setLoading(true); setError(""); setFeedback(""); setPreview(null); setFileName(file.name);
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch("/api/schedule/import", { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Analyse impossible");
      setPreview(data.preview);
      setFeedback(`${data.preview.entryCount} créneau(x) détecté(s) depuis ${data.preview.sourceType.toUpperCase()}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de l'analyse");
      setFileName(null);
    } finally {
      setLoading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function updateSlot(index: number, field: keyof ParsedSlot, value: string) {
    setPreview((current) => {
      if (!current) return current;
      const slots = current.slots.map((slot, i) => (i === index ? { ...slot, [field]: value || null } : slot));
      return { ...current, slots };
    });
  }

  function removeSlot(index: number) {
    setPreview((current) => {
      if (!current) return current;
      return { ...current, slots: current.slots.filter((_, i) => i !== index), entryCount: current.entryCount - 1 };
    });
  }

  async function confirm(event: FormEvent) {
    event.preventDefault();
    if (!preview) return;
    setConfirming(true); setError(""); setFeedback("");
    try {
      const slots = preview.slots
        .filter((s) => s.dayOfWeek !== null && s.startTime && s.endTime && s.subject)
        .map((s) => ({ dayOfWeek: s.dayOfWeek, startTime: s.startTime, endTime: s.endTime, subject: s.subject, room: s.room ?? null, teacher: s.teacher ?? null }));
      const response = await fetch("/api/schedule/import/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slots, mode }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Échec de l'import");
      const imported: Array<{ dayOfWeek: number; startTime: string; endTime: string; subjectId: string | null; detectedSubject: string; room: string | null; teacher: string | null }> = Array.isArray(data.slots) ? data.slots : [];
      const unlinkedNames = Array.from(new Set(imported.filter((row) => !row.subjectId).map((row) => row.detectedSubject))).slice(0, 5);
      setFeedback(`Emploi du temps importé : ${data.created} créé(s), ${data.preserved} conservé(s), ${data.deleted} supprimé(s), ${data.linked ?? 0} relié(s) à une matière${unlinkedNames.length ? ` (matières inconnues : ${unlinkedNames.join(", ")})` : ""}. Total : ${data.total}.`);
      setPreview(null); setFileName(null);
      onImported();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de la confirmation");
    } finally { setConfirming(false); }
  }

  const lowConfidence = preview ? preview.slots.filter((s) => s.confidence === "low" || s.warnings.length > 0).length : 0;

  return (
    <section className="calendar-board">
      <div className="list-heading"><h2>Importer mon emploi du temps</h2><span>PDF · image · CSV · ICS</span></div>
      <form className="import-form" onSubmit={(e) => e.preventDefault()}>
        <label className="file-drop">
          <FileUp size={18} />
          <span>{loading ? "Analyse en cours…" : fileName ? `Fichier : ${fileName}` : "Dépose ton emploi du temps (PDF, image, CSV, ICS)"}</span>
          <input ref={fileRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.csv,.ics,.txt,.md" onChange={handleFile} disabled={loading} hidden />
        </label>
      </form>
      {error && <p className="import-error">{error}</p>}
      {feedback && !error && <p className="import-success">{feedback}</p>}
      {preview && (
        <form onSubmit={confirm} className="import-preview">
          <div className="preview-summary">
            <span>{preview.entryCount} créneau(x)</span>
            <span>Jours : {preview.daysDetected.join(", ") || "—"}</span>
            <span>Matières : {preview.subjectsDetected.slice(0, 6).join(", ")}{preview.subjectsDetected.length > 6 ? "…" : ""}</span>
            {lowConfidence > 0 && <span className="warn">{lowConfidence} créneau(x) à vérifier</span>}
          </div>
          <div className="preview-list">
            {preview.slots.map((slot, index) => (
              <div className={`preview-row confidence-${slot.confidence}`} key={index}>
                <select value={slot.dayOfWeek ?? ""} onChange={(e) => updateSlot(index, "dayOfWeek", e.target.value)}>
                  <option value="">Jour ?</option>
                  {daysLabels.map((d, i) => <option key={d} value={i}>{d}</option>)}
                </select>
                <input type="time" value={slot.startTime ?? ""} onChange={(e) => updateSlot(index, "startTime", e.target.value)} />
                <span>→</span>
                <input type="time" value={slot.endTime ?? ""} onChange={(e) => updateSlot(index, "endTime", e.target.value)} />
                <input className="subject-input" value={slot.subject ?? ""} placeholder="Matière" onChange={(e) => updateSlot(index, "subject", e.target.value)} />
                <input className="room-input" value={slot.room ?? ""} placeholder="Salle" onChange={(e) => updateSlot(index, "room", e.target.value)} />
                <button type="button" className="delete-button" onClick={() => removeSlot(index)} aria-label="Supprimer ce créneau"><Trash2 size={14} /></button>
                {slot.warnings.length > 0 && <span className="row-warnings" title={slot.warnings.join(" ; ")}>⚠ {slot.warnings[0]}</span>}
              </div>
            ))}
          </div>
          <div className="preview-actions">
            <label className="mode-toggle">Mode :
              <select value={mode} onChange={(e) => setMode(e.target.value as "replace" | "merge")}>
                <option value="replace">Remplacer mon emploi du temps</option>
                <option value="merge">Fusionner (ajouter seulement)</option>
              </select>
            </label>
            <button className="primary-button" type="submit" disabled={confirming || preview.slots.length === 0}>
              <Check size={16} /> {confirming ? "Enregistrement…" : "Confirmer l'import"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
