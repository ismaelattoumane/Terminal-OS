"use client";

import { FormEvent, startTransition, useEffect, useRef, useState } from "react";
import { Check, Plus, Trash2 } from "lucide-react";
import { onReconnect, queuedFetch } from "@/lib/offline-queue";
import { fetchJsonWithLimit } from "@/lib/api-client";

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
      const [subjects, chapters, courses, evaluations] = await Promise.all([
        fetchJsonWithLimit<Subject>("/api/subjects"),
        fetchJsonWithLimit<Chapter>("/api/chapters"),
        fetchJsonWithLimit<Course>("/api/courses"),
        fetchJsonWithLimit<Evaluation>("/api/evaluations"),
      ]);
      setSubjects(subjects.items); setChapters(chapters.items); setCourses(courses.items); setEvaluations(evaluations.items);
      const truncated = [subjects, chapters, courses, evaluations].some((result) => result.truncated);
      if (truncated) setMessage("Certaines listes sont tronquées aux 200 premiers éléments. Utilise les filtres ou augmente la limite.");
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
  useEffect(() => onReconnect(load), []);

  async function create(path: string, payload: object) {
    const response = await queuedFetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    if (response.status === 202) { setMessage("Hors ligne : enregistré, synchronisé dès la reconnexion."); return; }
    if (!response.ok) { setMessage("Impossible d'enregistrer. Vérifie ta connexion."); return; }
    setMessage("Enregistré."); await load();
  }
  async function remove(path: string) { const response = await queuedFetch(path, { method: "DELETE" }); if (response.status === 202) { setMessage("Hors ligne : suppression synchronisée dès la reconnexion."); return; } if (response.ok) { setMessage("Supprimé."); await load(); } else setMessage("Suppression impossible."); }
  async function update(path: string, payload: object) { const response = await queuedFetch(path, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }); if (response.status === 202) { setMessage("Hors ligne : mise à jour synchronisée dès la reconnexion."); return; } if (response.ok) { setMessage("Mis à jour."); await load(); } else setMessage("Mise à jour impossible."); }

  if (section === "Cours") return <CourseManager subjects={subjects} chapters={chapters} courses={courses} create={create} remove={remove} message={message} />;
  if (section === "Évaluations") return <EvaluationManager subjects={subjects} chapters={chapters} evaluations={evaluations} create={create} remove={remove} update={update} message={message} />;
  if (section === "Révisions") return <RevisionManager message={message} subjects={subjects} chapters={chapters} />;
  if (section === "Devoirs & notes") return <HomeworkGradeManager subjects={subjects} create={create} remove={remove} update={update} message={message} />;
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
  const [title, setTitle] = useState(""); const [content, setContent] = useState(""); const [subjectId, setSubjectId] = useState(""); const [chapterId, setChapterId] = useState(""); const [file, setFile] = useState<File | null>(null); const [uploadMessage, setUploadMessage] = useState(""); const [uploading, setUploading] = useState(false); const fileInputRef = useRef<HTMLInputElement | null>(null);
  // B16 : état busy contre la double soumission + reset de l'input fichier après succès.
  async function upload(event: FormEvent) { event.preventDefault(); if (!file || uploading) return; setUploading(true); try { const form = new FormData(); form.append("file", file); form.append("subjectId", subjectId); if (chapterId) form.append("chapterId", chapterId); if (title) form.append("title", title); const response = await fetch("/api/courses/upload", { method: "POST", body: form }); setUploadMessage(response.ok ? "Cours importé et texte extrait." : ((await response.json().catch(() => ({})) as { error?: string }).error ?? "Import impossible.")); if (response.ok) { setFile(null); setTitle(""); if (fileInputRef.current) fileInputRef.current.value = ""; } } finally { setUploading(false); } }
  const chapterOptions = chapters.filter((chapter) => !subjectId || chapter.subjectId === subjectId);
  return <Workspace title="Cours" intro="Écris, importe et retrouve tes cours. Les fichiers sont extraits automatiquement quand leur format le permet." message={message || uploadMessage}><form className="data-form wide-form" onSubmit={(event) => { event.preventDefault(); create("/api/courses", { title, content, subjectId, chapterId: chapterId || undefined }).then(() => { setTitle(""); setContent(""); }); }}><FormTitle title="Nouveau cours" /><div className="form-row"><label>Titre<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Suites numériques" required /></label><label>Matière<select value={subjectId} onChange={(event) => setSubjectId(event.target.value)} required><option value="">Choisir</option>{subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select></label><label>Chapitre<select value={chapterId} onChange={(event) => setChapterId(event.target.value)}><option value="">Aucun</option>{chapterOptions.map((chapter) => <option key={chapter.id} value={chapter.id}>{chapter.name}</option>)}</select></label></div><label>Contenu<textarea value={content} onChange={(event) => setContent(event.target.value)} placeholder="Notes de cours..." rows={7} /></label><button className="primary-button" type="submit"><Plus size={16} /> Enregistrer le cours</button></form><form className="data-form wide-form" onSubmit={upload}><FormTitle title="Importer un document" /><div className="form-row"><label>Fichier<input type="file" accept=".txt,.md,.pdf,.docx,.png,.jpg,.jpeg" ref={fileInputRef} onChange={(event) => setFile(event.target.files?.[0] ?? null)} required /></label><label>Matière<select value={subjectId} onChange={(event) => setSubjectId(event.target.value)} required><option value="">Choisir</option>{subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select></label><label>Chapitre<select value={chapterId} onChange={(event) => setChapterId(event.target.value)}><option value="">Aucun</option>{chapterOptions.map((chapter) => <option key={chapter.id} value={chapter.id}>{chapter.name}</option>)}</select></label></div><button className="secondary-button" type="submit" disabled={uploading}>{uploading ? "Import en cours…" : <><Plus size={16} /> Importer le cours</>}</button></form><DataList title="Cours récents" empty="Aucun cours enregistré." items={courses.map((course) => ({ id: course.id, title: course.title, meta: `${course.subject.name}${course.chapter ? ` · ${course.chapter.name}` : ""}`, action: () => remove(`/api/courses/${course.id}`) }))} /></Workspace>;
}

function EvaluationManager({ subjects, chapters, evaluations, create, remove, update, message }: { subjects: Subject[]; chapters: Chapter[]; evaluations: Evaluation[]; create: (path: string, payload: object) => Promise<void>; remove: (path: string) => Promise<void>; update: (path: string, payload: object) => Promise<void>; message: string }) {
  const [title, setTitle] = useState(""); const [date, setDate] = useState(""); const [subjectId, setSubjectId] = useState(""); const [chapterIds, setChapterIds] = useState<string[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null); const [editingTitle, setEditingTitle] = useState(""); const [editingDate, setEditingDate] = useState("");
  function submit(event: FormEvent) { event.preventDefault(); create("/api/evaluations", { title, date, subjectId, chapterIds }).then(() => { setTitle(""); setDate(""); setChapterIds([]); }); }
  function beginEdit(evaluation: Evaluation) { setEditingId(evaluation.id); setEditingTitle(evaluation.title); setEditingDate(evaluation.date.slice(0, 10)); }
  function saveEdit(event: FormEvent) { event.preventDefault(); if (!editingId) return; update(`/api/evaluations/${editingId}`, { title: editingTitle, date: editingDate }).then(() => setEditingId(null)); }
  return <Workspace title="Évaluations" intro="Crée un contrôle et Terminal OS prépare automatiquement tes révisions." message={message}><form className="data-form wide-form" onSubmit={submit}><FormTitle title="Nouveau contrôle" /><div className="form-row"><label>Titre<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Contrôle Maths - Suites" required /></label><label>Date<input type="date" value={date} onChange={(event) => setDate(event.target.value)} required /></label><label>Matière<select value={subjectId} onChange={(event) => setSubjectId(event.target.value)} required><option value="">Choisir</option>{subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select></label></div><fieldset><legend>Chapitres concernés</legend><div className="check-grid">{chapters.filter((chapter) => !subjectId || chapter.subjectId === subjectId).map((chapter) => <label className="check-label" key={chapter.id}><input type="checkbox" checked={chapterIds.includes(chapter.id)} onChange={(event) => setChapterIds((current) => event.target.checked ? [...current, chapter.id] : current.filter((id) => id !== chapter.id))} /> {chapter.name}</label>)}</div></fieldset><button className="primary-button" type="submit"><Check size={16} /> Créer et planifier</button></form>{editingId && <form className="data-form wide-form edit-form" onSubmit={saveEdit}><FormTitle title="Modifier le contrôle" /><div className="form-row"><label>Titre<input value={editingTitle} onChange={(event) => setEditingTitle(event.target.value)} required /></label><label>Date<input type="date" value={editingDate} onChange={(event) => setEditingDate(event.target.value)} required /></label><button className="primary-button" type="submit">Enregistrer</button></div></form>}<DataList title="Contrôles planifiés" empty="Aucun contrôle enregistré." items={evaluations.map((evaluation) => ({ id: evaluation.id, title: evaluation.title, meta: `${evaluation.subject.name} · ${new Date(evaluation.date).toLocaleDateString("fr-FR")} · ${evaluation.revisions.length} révisions · ${evaluation.status}`, action: () => remove(`/api/evaluations/${evaluation.id}`), secondaryAction: evaluation.status === "planned" ? () => update(`/api/evaluations/${evaluation.id}`, { status: "completed" }) : undefined, secondaryLabel: "Terminer", editAction: () => beginEdit(evaluation), cancelAction: evaluation.status === "planned" ? () => update(`/api/evaluations/${evaluation.id}`, { status: "cancelled" }) : undefined }))} /></Workspace>;
}

function RevisionManager({ message, subjects, chapters }: { message: string; subjects: Subject[]; chapters: Chapter[] }) {
  const [revisions, setRevisions] = useState<Array<{ id: string; title: string; date: string; status: string; startTime: string | null; duration: number; subject: { name: string } }>>([]);
  const [feedback, setFeedback] = useState(message);
  const [subjectId, setSubjectId] = useState(""); const [chapterId, setChapterId] = useState(""); const [title, setTitle] = useState(""); const [date, setDate] = useState(""); const [startTime, setStartTime] = useState("18:00"); const [duration, setDuration] = useState(30);
  async function load() { const response = await fetch("/api/revisions"); if (response.ok) setRevisions(await response.json()); }
  useEffect(() => {
    let cancelled = false;
    fetch("/api/revisions").then((response) => response.ok ? response.json() : []).then((data) => { if (!cancelled) startTransition(() => setRevisions(data)); }).catch(() => { if (!cancelled) setFeedback("Connecte-toi pour voir tes révisions."); });
    return () => { cancelled = true; };
  }, []);
  async function updateStatus(id: string, status: "completed" | "skipped") { const response = await queuedFetch(`/api/revisions/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) }); if (response.status === 202) { setFeedback("Hors ligne : statut synchronisé dès la reconnexion."); return; } if (response.ok) { setFeedback(status === "completed" ? "Révision terminée." : "Révision ignorée."); await load(); } else setFeedback("Mise à jour impossible."); }
  // B10 : création manuelle d'une session via POST /api/revisions.
  async function createRevision(event: FormEvent) {
    event.preventDefault();
    const response = await queuedFetch("/api/revisions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subjectId, chapterId: chapterId || undefined, title, date, startTime, duration }) });
    if (response.status === 202) { setFeedback("Hors ligne : session enregistrée, synchronisée dès la reconnexion."); return; }
    if (!response.ok) { setFeedback("Création impossible. Vérifie les champs et ta connexion."); return; }
    setFeedback("Session de révision créée."); setTitle(""); setDate("");
    await load();
  }
  const chapterOptions = chapters.filter((chapter) => !subjectId || chapter.subjectId === subjectId);
  return <Workspace title="Révisions" intro="Ton plan de révision, généré à partir de tes contrôles." message={feedback}>
    <form className="data-form wide-form" onSubmit={createRevision}>
      <h2 className="form-title">Ajouter une session manuelle</h2>
      <div className="form-row">
        <label>Matière<select value={subjectId} onChange={(event) => { setSubjectId(event.target.value); setChapterId(""); }} required><option value="">Choisir</option>{subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select></label>
        <label>Chapitre<select value={chapterId} onChange={(event) => setChapterId(event.target.value)}><option value="">Aucun</option>{chapterOptions.map((chapter) => <option key={chapter.id} value={chapter.id}>{chapter.name}</option>)}</select></label>
        <label>Intitulé<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Revoir les dérivées" required /></label>
      </div>
      <div className="form-row">
        <label>Date<input type="date" value={date} onChange={(event) => setDate(event.target.value)} required /></label>
        <label>Heure<input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} required /></label>
        <label>Durée (min)<input type="number" min={5} max={180} step={5} value={duration} onChange={(event) => setDuration(Number(event.target.value))} required /></label>
      </div>
      <button className="primary-button" type="submit"><Plus size={16} /> Ajouter la session</button>
    </form>
    <section className="data-list"><div className="list-heading"><h2>Sessions planifiées</h2><span>{revisions.length}</span></div>{revisions.length ? revisions.map((revision) => <div className="data-item" key={revision.id}><div><strong>{revision.title}</strong><span>{revision.subject.name} · {new Date(revision.date).toLocaleDateString("fr-FR")}{revision.startTime ? ` · ${revision.startTime}` : ""} · {revision.duration} min · {revision.status}</span></div><div className="item-actions"><button className="complete-button" onClick={() => updateStatus(revision.id, "completed")} aria-label={`Terminer ${revision.title}`}><Check size={15} /></button><button className="skip-button" onClick={() => updateStatus(revision.id, "skipped")} aria-label={`Ignorer ${revision.title}`}>Ignorer</button></div></div>) : <p className="empty-state">Aucune session pour le moment.</p>}</section>
  </Workspace>;
}
function Workspace({ title, intro, message, children }: { title: string; intro: string; message: string; children: React.ReactNode }) { return <div className="workspace-page"><div className="workspace-heading"><div><p className="eyebrow">PHASE 1 · ESPACE DE TRAVAIL</p><h1>{title}</h1><p className="muted">{intro}</p></div>{message && <span className="workspace-message">{message}</span>}</div>{children}</div>; }
function FormTitle({ title }: { title: string }) { return <h2 className="form-title">{title}</h2>; }

type HomeworkItem = { id: string; title: string; dueDate: string; status: string; estimatedDuration: number; priority: string; subject: { name: string } };
type GradeItem = { id: string; grade: number; maxGrade: number; coefficient: number; date: string; comment: string | null; subject: { name: string } };

function HomeworkGradeManager({ subjects, create, remove, update, message }: { subjects: Subject[]; create: (path: string, payload: object) => Promise<void>; remove: (path: string) => Promise<void>; update: (path: string, payload: object) => Promise<void>; message: string }) {
  const [homework, setHomework] = useState<HomeworkItem[]>([]);
  const [grades, setGrades] = useState<GradeItem[]>([]);
  const [feedback, setFeedback] = useState(message);
  const [title, setTitle] = useState(""); const [subjectId, setSubjectId] = useState(""); const [dueDate, setDueDate] = useState(""); const [duration, setDuration] = useState(30); const [priority, setPriority] = useState("normal");
  const [gradeValue, setGradeValue] = useState(""); const [gradeSubjectId, setGradeSubjectId] = useState(""); const [maxGrade, setMaxGrade] = useState(20); const [coefficient, setCoefficient] = useState(1); const [gradeDate, setGradeDate] = useState(""); const [comment, setComment] = useState("");
  async function load() {
    const [homeworkResponse, gradeResponse] = await Promise.all([fetch("/api/homework"), fetch("/api/grades")]);
    if (homeworkResponse.ok) setHomework(await homeworkResponse.json());
    if (gradeResponse.ok) setGrades(await gradeResponse.json());
  }
  useEffect(() => {
    let cancelled = false;
    Promise.all([fetch("/api/homework"), fetch("/api/grades")]).then(async ([homeworkResponse, gradeResponse]) => {
      const homeworkData = homeworkResponse.ok ? await homeworkResponse.json() : [];
      const gradeData = gradeResponse.ok ? await gradeResponse.json() : [];
      if (!cancelled) startTransition(() => { setHomework(homeworkData); setGrades(gradeData); });
    }).catch(() => { if (!cancelled) setFeedback("Connecte-toi pour gérer devoirs et notes."); });
    return () => { cancelled = true; };
  }, []);
  async function submitHomework(event: FormEvent) {
    event.preventDefault();
    await create("/api/homework", { title, subjectId, dueDate, estimatedDuration: duration, priority });
    setTitle(""); setDueDate(""); await load();
  }
  async function submitGrade(event: FormEvent) {
    event.preventDefault();
    await create("/api/grades", { subjectId: gradeSubjectId, grade: Number(gradeValue), maxGrade, coefficient, date: gradeDate || new Date().toISOString(), comment: comment || undefined });
    setGradeValue(""); setComment(""); await load();
  }
  async function completeHomework(id: string) { await update(`/api/homework/${id}`, { status: "completed" }); await load(); }
  const homeworkItems = homework.map((item) => ({
    id: item.id,
    title: item.title,
    meta: `${item.subject.name} · ${new Date(item.dueDate).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })} · ${item.estimatedDuration} min · ${item.status}`,
    secondaryAction: item.status !== "completed" ? () => completeHomework(item.id) : undefined,
    secondaryLabel: "Terminer",
    action: () => remove(`/api/homework/${item.id}`),
  }));
  const gradeItems = grades.map((item) => ({
    id: item.id,
    title: `${item.grade}/${item.maxGrade}`,
    meta: `${item.subject.name} · coef ${item.coefficient} · ${new Date(item.date).toLocaleDateString("fr-FR")}${item.comment ? ` · ${item.comment}` : ""}`,
    action: () => remove(`/api/grades/${item.id}`),
  }));
  return <Workspace title="Devoirs & notes" intro="Note tes devoirs à rendre et tes notes pour alimenter le tableau de bord." message={message || feedback}>
    <div className="manager-grid">
      <form className="data-form" onSubmit={submitHomework}><FormTitle title="Nouveau devoir" />
        <label>Intitulé<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Exercices 12 à 15 p.84" required /></label>
        <label>Matière<select value={subjectId} onChange={(event) => setSubjectId(event.target.value)} required><option value="">Choisir</option>{subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select></label>
        <label>À rendre le<input type="datetime-local" value={dueDate} onChange={(event) => setDueDate(event.target.value)} required /></label>
        <div className="form-row"><label>Durée (min)<input type="number" min={5} max={600} step={5} value={duration} onChange={(event) => setDuration(Number(event.target.value))} /></label><label>Priorité<select value={priority} onChange={(event) => setPriority(event.target.value)} aria-label="Priorité"><option value="low">Basse</option><option value="normal">Normale</option><option value="high">Haute</option><option value="critical">Critique</option></select></label></div>
        <button className="primary-button" type="submit"><Plus size={16} /> Ajouter le devoir</button>
      </form>
      <form className="data-form" onSubmit={submitGrade}><FormTitle title="Nouvelle note" />
        <label>Matière<select value={gradeSubjectId} onChange={(event) => setGradeSubjectId(event.target.value)} required><option value="">Choisir</option>{subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select></label>
        <div className="form-row"><label>Note<input type="number" min={0} step={0.25} value={gradeValue} onChange={(event) => setGradeValue(event.target.value)} placeholder="15.5" required /></label><label>Barème<input type="number" min={1} step={1} value={maxGrade} onChange={(event) => setMaxGrade(Number(event.target.value))} required /></label><label>Coef<input type="number" min={0.5} step={0.5} value={coefficient} onChange={(event) => setCoefficient(Number(event.target.value))} required /></label></div>
        <label>Date<input type="date" value={gradeDate} onChange={(event) => setGradeDate(event.target.value)} /></label>
        <label>Commentaire<input value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Contrôle chapitre 2" /></label>
        <button className="primary-button" type="submit"><Plus size={16} /> Ajouter la note</button>
      </form>
    </div>
    <DataList title="Devoirs à rendre" empty="Aucun devoir enregistré." items={homeworkItems} />
    <DataList title="Notes" empty="Aucune note enregistrée." items={gradeItems} />
  </Workspace>;
}
function DataList({ title, empty, items }: { title: string; empty: string; items: Array<{ id: string; title: string; meta: string; action: () => void; secondaryAction?: () => void; secondaryLabel?: string; cancelAction?: () => void; editAction?: () => void }> }) { return <section className="data-list"><div className="list-heading"><h2>{title}</h2><span>{items.length}</span></div>{items.length ? items.map((item) => <div className="data-item" key={item.id}><div><strong>{item.title}</strong><span>{item.meta}</span></div><div className="item-actions">{item.editAction && <button className="skip-button" onClick={item.editAction}>Modifier</button>}{item.secondaryAction && <button className="complete-button" onClick={item.secondaryAction}>{item.secondaryLabel}</button>}{item.cancelAction && <button className="skip-button" onClick={item.cancelAction}>Annuler</button>}<button className="delete-button" onClick={() => { if (window.confirm(`Supprimer « ${item.title} » ? Cette action est définitive.`)) item.action(); }} aria-label={`Supprimer ${item.title}`}><Trash2 size={15} /></button></div></div>) : <p className="empty-state">{empty}</p>}</section>; }
