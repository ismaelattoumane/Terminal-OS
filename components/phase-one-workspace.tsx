"use client";

import { FormEvent, startTransition, useEffect, useState } from "react";
import { Check, Plus, Trash2 } from "lucide-react";

type Subject = { id: string; name: string; shortName: string; color: string; coefficient: number };
type Chapter = { id: string; name: string; mastery: number; subject: { name: string }; subjectId: string };
type Course = { id: string; title: string; content: string | null; subject: { name: string }; chapter: { name: string } | null };
type Evaluation = { id: string; title: string; date: string; status: string; subject: { name: string }; revisions: Array<{ id: string }> };

export function PhaseOneWorkspace({ section }: { section: string }) {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [message, setMessage] = useState("");

  async function load() {
    try {
      const responses = await Promise.all([fetch("/api/subjects"), fetch("/api/chapters"), fetch("/api/courses"), fetch("/api/evaluations")]);
      const data = await Promise.all(responses.map((response) => response.ok ? response.json() : []));
      setSubjects(data[0]); setChapters(data[1]); setCourses(data[2]); setEvaluations(data[3]);
    } catch { setMessage("Connecte-toi pour gérer tes données."); }
  }
  useEffect(() => {
    let cancelled = false;
    Promise.all([fetch("/api/subjects"), fetch("/api/chapters"), fetch("/api/courses"), fetch("/api/evaluations")])
      .then((responses) => Promise.all(responses.map((response) => response.ok ? response.json() : [])))
      .then((data) => { if (!cancelled) startTransition(() => { setSubjects(data[0]); setChapters(data[1]); setCourses(data[2]); setEvaluations(data[3]); }); })
      .catch(() => { if (!cancelled) setMessage("Connecte-toi pour gérer tes données."); });
    return () => { cancelled = true; };
  }, []);

  async function create(path: string, payload: object) {
    const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    if (!response.ok) { setMessage("Impossible d'enregistrer. Vérifie ta connexion."); return; }
    setMessage("Enregistré."); await load();
  }
  async function remove(path: string) { const response = await fetch(path, { method: "DELETE" }); if (response.ok) { setMessage("Supprimé."); await load(); } else setMessage("Suppression impossible."); }
  async function update(path: string, payload: object) { const response = await fetch(path, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }); if (response.ok) { setMessage("Mis à jour."); await load(); } else setMessage("Mise à jour impossible."); }

  if (section === "Cours") return <CourseManager subjects={subjects} chapters={chapters} courses={courses} create={create} remove={remove} message={message} />;
  if (section === "Évaluations") return <EvaluationManager subjects={subjects} chapters={chapters} evaluations={evaluations} create={create} remove={remove} update={update} message={message} />;
  if (section === "Révisions") return <RevisionManager message={message} />;
  return <SubjectManager subjects={subjects} chapters={chapters} create={create} remove={remove} message={message} />;
}

function SubjectManager({ subjects, chapters, create, remove, message }: { subjects: Subject[]; chapters: Chapter[]; create: (path: string, payload: object) => Promise<void>; remove: (path: string) => Promise<void>; message: string }) {
  const [name, setName] = useState(""); const [shortName, setShortName] = useState(""); const [chapterName, setChapterName] = useState(""); const [subjectId, setSubjectId] = useState("");
  return <Workspace title="Matières & chapitres" intro="Organise ton programme et suis la maîtrise de chaque chapitre." message={message}>
    <div className="manager-grid"><form className="data-form" onSubmit={(event) => { event.preventDefault(); create("/api/subjects", { name, shortName: shortName || name.slice(0, 5).toUpperCase() }).then(() => { setName(""); setShortName(""); }); }}><FormTitle title="Nouvelle matière" /><label>Nom<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Mathématiques" required /></label><label>Code court<input value={shortName} onChange={(event) => setShortName(event.target.value)} placeholder="MATHS" maxLength={12} /></label><button className="primary-button" type="submit"><Plus size={16} /> Ajouter la matière</button></form><form className="data-form" onSubmit={(event) => { event.preventDefault(); create("/api/chapters", { name: chapterName, subjectId, mastery: 0 }).then(() => setChapterName("")); }}><FormTitle title="Nouveau chapitre" /><label>Matière<select value={subjectId} onChange={(event) => setSubjectId(event.target.value)} required><option value="">Choisir une matière</option>{subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select></label><label>Nom du chapitre<input value={chapterName} onChange={(event) => setChapterName(event.target.value)} placeholder="Suites numériques" required /></label><button className="secondary-button" type="submit"><Plus size={16} /> Ajouter le chapitre</button></form></div>
    <DataList title="Matières" empty="Aucune matière enregistrée." items={subjects.map((subject) => ({ id: subject.id, title: subject.name, meta: `${subject.shortName} · coefficient ${subject.coefficient}`, action: () => remove(`/api/subjects/${subject.id}`) }))} /><DataList title="Chapitres" empty="Aucun chapitre enregistré." items={chapters.map((chapter) => ({ id: chapter.id, title: chapter.name, meta: `${chapter.subject.name} · ${chapter.mastery}% maîtrisé`, action: () => remove(`/api/chapters/${chapter.id}`) }))} />
  </Workspace>;
}

function CourseManager({ subjects, chapters, courses, create, remove, message }: { subjects: Subject[]; chapters: Chapter[]; courses: Course[]; create: (path: string, payload: object) => Promise<void>; remove: (path: string) => Promise<void>; message: string }) {
  const [title, setTitle] = useState(""); const [content, setContent] = useState(""); const [subjectId, setSubjectId] = useState(""); const [chapterId, setChapterId] = useState("");
  return <Workspace title="Cours" intro="Écris et retrouve tes cours. Les imports PDF et images arriveront en phase 4." message={message}><form className="data-form wide-form" onSubmit={(event) => { event.preventDefault(); create("/api/courses", { title, content, subjectId, chapterId: chapterId || undefined }).then(() => { setTitle(""); setContent(""); }); }}><FormTitle title="Nouveau cours" /><div className="form-row"><label>Titre<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Suites numériques" required /></label><label>Matière<select value={subjectId} onChange={(event) => setSubjectId(event.target.value)} required><option value="">Choisir</option>{subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select></label><label>Chapitre<select value={chapterId} onChange={(event) => setChapterId(event.target.value)}><option value="">Aucun</option>{chapters.filter((chapter) => !subjectId || chapter.subjectId === subjectId).map((chapter) => <option key={chapter.id} value={chapter.id}>{chapter.name}</option>)}</select></label></div><label>Contenu<textarea value={content} onChange={(event) => setContent(event.target.value)} placeholder="Notes de cours..." rows={7} /></label><button className="primary-button" type="submit"><Plus size={16} /> Enregistrer le cours</button></form><DataList title="Cours récents" empty="Aucun cours enregistré." items={courses.map((course) => ({ id: course.id, title: course.title, meta: `${course.subject.name}${course.chapter ? ` · ${course.chapter.name}` : ""}`, action: () => remove(`/api/courses/${course.id}`) }))} /></Workspace>;
}

function EvaluationManager({ subjects, chapters, evaluations, create, remove, update, message }: { subjects: Subject[]; chapters: Chapter[]; evaluations: Evaluation[]; create: (path: string, payload: object) => Promise<void>; remove: (path: string) => Promise<void>; update: (path: string, payload: object) => Promise<void>; message: string }) {
  const [title, setTitle] = useState(""); const [date, setDate] = useState(""); const [subjectId, setSubjectId] = useState(""); const [chapterIds, setChapterIds] = useState<string[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null); const [editingTitle, setEditingTitle] = useState(""); const [editingDate, setEditingDate] = useState("");
  function submit(event: FormEvent) { event.preventDefault(); create("/api/evaluations", { title, date, subjectId, chapterIds }).then(() => { setTitle(""); setDate(""); setChapterIds([]); }); }
  function beginEdit(evaluation: Evaluation) { setEditingId(evaluation.id); setEditingTitle(evaluation.title); setEditingDate(evaluation.date.slice(0, 10)); }
  function saveEdit(event: FormEvent) { event.preventDefault(); if (!editingId) return; update(`/api/evaluations/${editingId}`, { title: editingTitle, date: editingDate }).then(() => setEditingId(null)); }
  return <Workspace title="Évaluations" intro="Crée un contrôle et Terminal OS prépare automatiquement tes révisions." message={message}><form className="data-form wide-form" onSubmit={submit}><FormTitle title="Nouveau contrôle" /><div className="form-row"><label>Titre<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Contrôle Maths - Suites" required /></label><label>Date<input type="date" value={date} onChange={(event) => setDate(event.target.value)} required /></label><label>Matière<select value={subjectId} onChange={(event) => setSubjectId(event.target.value)} required><option value="">Choisir</option>{subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select></label></div><fieldset><legend>Chapitres concernés</legend><div className="check-grid">{chapters.filter((chapter) => !subjectId || chapter.subjectId === subjectId).map((chapter) => <label className="check-label" key={chapter.id}><input type="checkbox" checked={chapterIds.includes(chapter.id)} onChange={(event) => setChapterIds((current) => event.target.checked ? [...current, chapter.id] : current.filter((id) => id !== chapter.id))} /> {chapter.name}</label>)}</div></fieldset><button className="primary-button" type="submit"><Check size={16} /> Créer et planifier</button></form>{editingId && <form className="data-form wide-form edit-form" onSubmit={saveEdit}><FormTitle title="Modifier le contrôle" /><div className="form-row"><label>Titre<input value={editingTitle} onChange={(event) => setEditingTitle(event.target.value)} required /></label><label>Date<input type="date" value={editingDate} onChange={(event) => setEditingDate(event.target.value)} required /></label><button className="primary-button" type="submit">Enregistrer</button></div></form>}<DataList title="Contrôles planifiés" empty="Aucun contrôle enregistré." items={evaluations.map((evaluation) => ({ id: evaluation.id, title: evaluation.title, meta: `${evaluation.subject.name} · ${new Date(evaluation.date).toLocaleDateString("fr-FR")} · ${evaluation.revisions.length} révisions · ${evaluation.status}`, action: () => remove(`/api/evaluations/${evaluation.id}`), secondaryAction: evaluation.status === "planned" ? () => update(`/api/evaluations/${evaluation.id}`, { status: "completed" }) : undefined, secondaryLabel: "Terminer", editAction: () => beginEdit(evaluation), cancelAction: evaluation.status === "planned" ? () => update(`/api/evaluations/${evaluation.id}`, { status: "cancelled" }) : undefined }))} /></Workspace>;
}

function RevisionManager({ message }: { message: string }) {
  const [revisions, setRevisions] = useState<Array<{ id: string; title: string; date: string; status: string }>>([]);
  const [feedback, setFeedback] = useState(message);
  async function load() { const response = await fetch("/api/revisions"); if (response.ok) setRevisions(await response.json()); }
  useEffect(() => {
    let cancelled = false;
    fetch("/api/revisions").then((response) => response.ok ? response.json() : []).then((data) => { if (!cancelled) startTransition(() => setRevisions(data)); }).catch(() => { if (!cancelled) setFeedback("Connecte-toi pour voir tes révisions."); });
    return () => { cancelled = true; };
  }, []);
  async function updateStatus(id: string, status: "completed" | "skipped") { const response = await fetch(`/api/revisions/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) }); if (response.ok) { setFeedback(status === "completed" ? "Révision terminée." : "Révision ignorée."); await load(); } else setFeedback("Mise à jour impossible."); }
  return <Workspace title="Révisions" intro="Ton plan de révision, généré à partir de tes contrôles." message={feedback}><section className="data-list"><div className="list-heading"><h2>Sessions planifiées</h2><span>{revisions.length}</span></div>{revisions.length ? revisions.map((revision) => <div className="data-item" key={revision.id}><div><strong>{revision.title}</strong><span>{new Date(revision.date).toLocaleDateString("fr-FR")} · {revision.status}</span></div><div className="item-actions"><button className="complete-button" onClick={() => updateStatus(revision.id, "completed")} aria-label={`Terminer ${revision.title}`}><Check size={15} /></button><button className="skip-button" onClick={() => updateStatus(revision.id, "skipped")} aria-label={`Ignorer ${revision.title}`}>Ignorer</button></div></div>) : <p className="empty-state">Aucune session pour le moment.</p>}</section></Workspace>;
}
function Workspace({ title, intro, message, children }: { title: string; intro: string; message: string; children: React.ReactNode }) { return <div className="workspace-page"><div className="workspace-heading"><div><p className="eyebrow">PHASE 1 · ESPACE DE TRAVAIL</p><h1>{title}</h1><p className="muted">{intro}</p></div>{message && <span className="workspace-message">{message}</span>}</div>{children}</div>; }
function FormTitle({ title }: { title: string }) { return <h2 className="form-title">{title}</h2>; }
function DataList({ title, empty, items }: { title: string; empty: string; items: Array<{ id: string; title: string; meta: string; action: () => void; secondaryAction?: () => void; secondaryLabel?: string; cancelAction?: () => void; editAction?: () => void }> }) { return <section className="data-list"><div className="list-heading"><h2>{title}</h2><span>{items.length}</span></div>{items.length ? items.map((item) => <div className="data-item" key={item.id}><div><strong>{item.title}</strong><span>{item.meta}</span></div><div className="item-actions">{item.editAction && <button className="skip-button" onClick={item.editAction}>Modifier</button>}{item.secondaryAction && <button className="complete-button" onClick={item.secondaryAction}>{item.secondaryLabel}</button>}{item.cancelAction && <button className="skip-button" onClick={item.cancelAction}>Annuler</button>}<button className="delete-button" onClick={item.action} aria-label={`Supprimer ${item.title}`}><Trash2 size={15} /></button></div></div>) : <p className="empty-state">{empty}</p>}</section>; }
