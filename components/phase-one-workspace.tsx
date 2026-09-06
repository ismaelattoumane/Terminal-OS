"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { Check, Download, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { onReconnect, queuedFetch } from "@/lib/offline-queue";
import { fetchJsonWithLimit } from "@/lib/api-client";

/* ── Types (miroir des API) ─────────────────────────────────────────────── */
type Subject = { id: string; name: string; shortName: string; color: string; coefficient: number; teacher?: string | null };
type Chapter = { id: string; name: string; mastery: number; subjectId: string; subject: { name: string } };
type Course = { id: string; title: string; content: string | null; fileUrl: string | null; subjectId: string; chapterId: string | null; subject: { name: string }; chapter: { name: string } | null };
type Evaluation = { id: string; title: string; date: string; status: string; importance: string; difficulty: string; subjectId: string; description: string | null; subject: { name: string }; chapters: Array<{ id: string; name: string }>; revisions: Array<{ id: string; status: string }> };
type Revision = { id: string; title: string; date: string; startTime: string | null; duration: number; status: string; type: string; subjectId: string; chapterId: string | null; subject: { name: string }; chapter: { name: string } | null };
type Homework = { id: string; title: string; dueDate: string; status: string; estimatedDuration: number; priority: string; subjectId: string; subject: { name: string } };
type Grade = { id: string; grade: number; maxGrade: number; coefficient: number; date: string; comment: string | null; subjectId: string; subject: { name: string } };

type Send = (path: string, method: "POST" | "PATCH" | "DELETE", payload?: object, successMessage?: string) => Promise<boolean>;

function toLocalDateInput(iso: string) {
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
function dateLabel(iso: string) { return new Date(iso).toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "short" }); }

const statusLabels: Record<string, string> = { planned: "Planifiée", in_progress: "En cours", completed: "Terminée", skipped: "Ignorée", postponed: "Reportée", todo: "À faire", cancelled: "Annulée" };
const typeLabels: Record<string, string> = { learning: "Apprentissage", memorization: "Mémorisation", practice: "Exercices", flashcards: "Flashcards", quiz: "Quiz", final_review: "Révision finale" };
const importanceLabels: Record<string, string> = { low: "Basse", normal: "Normale", high: "Haute", critical: "Critique" };
/* ── Shell : charge les données et route vers la section ────────────────── */
export function PhaseOneWorkspace({ section }: { section: string }) {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [homework, setHomework] = useState<Homework[]>([]);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [subjectResult, chapterResult, courseResult, evaluationResult, revisionResult, homeworkResult, gradeResult] = await Promise.all([
        fetchJsonWithLimit<Subject>("/api/subjects"),
        fetchJsonWithLimit<Chapter>("/api/chapters"),
        fetchJsonWithLimit<Course>("/api/courses"),
        fetchJsonWithLimit<Evaluation>("/api/evaluations"),
        fetchJsonWithLimit<Revision>("/api/revisions"),
        fetchJsonWithLimit<Homework>("/api/homework"),
        fetchJsonWithLimit<Grade>("/api/grades"),
      ]);
      setSubjects(subjectResult.items); setChapters(chapterResult.items); setCourses(courseResult.items);
      setEvaluations(evaluationResult.items); setRevisions(revisionResult.items);
      setHomework(homeworkResult.items); setGrades(gradeResult.items);
      setError("");
    } catch {
      setError("Impossible de charger tes données. Vérifie ta connexion puis réessaie.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { return onReconnect(load); }, [load]);
  useEffect(() => { if (notice) { const timer = setTimeout(() => setNotice(""), 4000); return () => clearTimeout(timer); } }, [notice]);

  const send = useCallback<Send>(async (path, method, payload, successMessage) => {
    const response = await queuedFetch(path, {
      method,
      headers: payload ? { "Content-Type": "application/json" } : undefined,
      body: payload ? JSON.stringify(payload) : undefined,
    });
    if (response.status === 202) { setNotice("Hors ligne : action enregistrée, synchronisée dès la reconnexion."); await load(); return true; }
    if (!response.ok) {
      let detail = "L'action a échoué.";
      try { const data = await response.json(); detail = data?.error ?? detail; } catch { /* réponse sans JSON */ }
      setError(detail);
      return false;
    }
    setNotice(successMessage ?? "Enregistré.");
    await load();
    return true;
  }, [load]);

  const heading = sectionHeading(section);
  return (
    <div>
      <div className="page-heading">
        <div>
          <p className="eyebrow">{heading.eyebrow}</p>
          <h1>{heading.title}</h1>
          <p className="muted">{heading.hint}</p>
        </div>
      </div>
      {error && <div className="state-message state-error" role="alert" style={{ marginBottom: 14 }}>{error}<button className="ghost-button" onClick={() => setError("")}>Fermer</button></div>}
      {notice && <div className="state-message state-success" role="status" style={{ marginBottom: 14 }}>{notice}</div>}
      {loading && subjects.length === 0 && chapters.length === 0 ? (
        <div className="grid-cards">{[0, 1, 2].map((index) => <div className="form-card" key={index}><span className="skeleton" /><span className="skeleton" /><span className="skeleton" /></div>)}</div>
      ) : section === "Matières" ? <SubjectsSection subjects={subjects} chapters={chapters} send={send} />
        : section === "Cours" ? <CoursesSection subjects={subjects} chapters={chapters} courses={courses} send={send} reload={load} />
        : section === "Évaluations" ? <EvaluationsSection subjects={subjects} chapters={chapters} evaluations={evaluations} send={send} />
        : section === "Révisions" ? <RevisionsSection subjects={subjects} revisions={revisions} send={send} />
        : <NotesSection subjects={subjects} homework={homework} grades={grades} send={send} />}
    </div>
  );
}

function sectionHeading(section: string): { eyebrow: string; title: string; hint: string } {
  switch (section) {
    case "Matières": return { eyebrow: "ORGANISATION", title: "Matières", hint: "Crée tes matières et leurs chapitres : tout le reste s'appuie dessus." };
    case "Cours": return { eyebrow: "CONTENU", title: "Cours", hint: "Ajoute, importe (PDF, DOCX, TXT, images) et relis tes cours." };
    case "Évaluations": return { eyebrow: "PILOTAGE", title: "Évaluations", hint: "Un contrôle ajouté génère automatiquement son planning de révision." };
    case "Révisions": return { eyebrow: "AUJOURD'HUI", title: "Révisions", hint: "Commence, termine, reporte ou déplace tes sessions." };
    default: return { eyebrow: "SUIVI", title: "Devoirs & notes", hint: "Suis tes devoirs à rendre et tes notes par matière." };
  }
}
/* ── Section Matières : CRUD matières + chapitres ───────────────────────── */
function SubjectsSection({ subjects, chapters, send }: { subjects: Subject[]; chapters: Chapter[]; send: Send }) {
  const [name, setName] = useState("");
  const [shortName, setShortName] = useState("");
  const [coefficient, setCoefficient] = useState("1");
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [chapterSubject, setChapterSubject] = useState("");
  const [chapterName, setChapterName] = useState("");

  async function createSubject(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    const ok = await send("/api/subjects", "POST", { name: name.trim(), shortName: (shortName.trim() || name.trim().slice(0, 4)).toUpperCase(), coefficient: Number(coefficient) || 1 }, "Matière créée.");
    if (ok) { setName(""); setShortName(""); setCoefficient("1"); }
  }
  async function createChapter(event: FormEvent) {
    event.preventDefault();
    if (!chapterSubject || !chapterName.trim()) return;
    const ok = await send("/api/chapters", "POST", { subjectId: chapterSubject, name: chapterName.trim() }, "Chapitre créé.");
    if (ok) setChapterName("");
  }

  return (
    <div className="grid-2" style={{ alignItems: "start" }}>
      <div style={{ display: "grid", gap: 16 }}>
        <form className="form-card" onSubmit={createSubject}>
          <h3>Nouvelle matière</h3>
          <div className="field-row">
            <label>Nom<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Mathématiques" required /></label>
            <label>Abréviation<input value={shortName} onChange={(event) => setShortName(event.target.value)} placeholder="MATHS" maxLength={12} /></label>
            <label>Coefficient<input type="number" min={0.5} step={0.5} value={coefficient} onChange={(event) => setCoefficient(event.target.value)} /></label>
          </div>
          <button className="primary-button" type="submit" style={{ marginTop: 12 }}><Plus size={16} /> Créer la matière</button>
        </form>
        <form className="form-card" onSubmit={createChapter}>
          <h3>Nouveau chapitre</h3>
          <div className="field-row">
            <label>Matière<select value={chapterSubject} onChange={(event) => setChapterSubject(event.target.value)} required><option value="">Choisir</option>{subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select></label>
            <label>Chapitre<input value={chapterName} onChange={(event) => setChapterName(event.target.value)} placeholder="Suites numériques" required /></label>
          </div>
          <button className="primary-button" type="submit" style={{ marginTop: 12 }}><Plus size={16} /> Créer le chapitre</button>
        </form>
        {!subjects.length && <div className="state-empty"><strong>Aucune matière.</strong><span>Crée ta première matière ci-dessus : elle apparaîtra dans tous les écrans.</span></div>}
      </div>
      <section className="data-list" aria-label="Liste des matières">
        <div className="list-heading"><h2>Tes matières</h2><span>{subjects.length}</span></div>
        {subjects.map((subject) => <SubjectRow key={subject.id} subject={subject} chapters={chapters.filter((chapter) => chapter.subjectId === subject.id)} send={send} />)}
        {subjects.length === 0 && <p className="empty-state">Les matières créées apparaîtront ici.</p>}
      </section>
    </div>
  );
}
function SubjectRow({ subject, chapters, send }: { subject: Subject; chapters: Chapter[]; send: Send }) {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(subject.name);
  const [editingChapter, setEditingChapter] = useState<string | null>(null);
  const [editChapterName, setEditChapterName] = useState("");
  return (
    <div style={{ padding: "12px 18px", borderTop: "1px solid var(--border)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: subject.color, flexShrink: 0 }} />
        {editing ? (
          <>
            <input value={editName} onChange={(event) => setEditName(event.target.value)} aria-label="Nom de la matière" style={{ maxWidth: 220 }} />
            <button className="complete-button" onClick={() => { void send(`/api/subjects/${subject.id}`, "PATCH", { name: editName.trim() }, "Matière mise à jour.").then((ok) => { if (ok) setEditing(false); }); }} aria-label="Enregistrer le nouveau nom"><Check size={14} /></button>
            <button className="skip-button" onClick={() => setEditing(false)} aria-label="Annuler la modification"><X size={14} /></button>
          </>
        ) : (
          <>
            <div style={{ flex: 1, minWidth: 0 }}><strong>{subject.name}</strong><span>{chapters.length} chapitre(s) · coef {subject.coefficient}</span></div>
            <button className="icon-button" onClick={() => { setEditName(subject.name); setEditing(true); }} aria-label={`Modifier ${subject.name}`}><Pencil size={15} /></button>
            <button className="icon-button danger" onClick={() => { if (window.confirm(`Supprimer « ${subject.name} » et tout son contenu associé (chapitres, cours, contrôles) ? Cette action est définitive.`)) void send(`/api/subjects/${subject.id}`, "DELETE", undefined, "Matière supprimée."); }} aria-label={`Supprimer ${subject.name}`}><Trash2 size={15} /></button>
          </>
        )}
      </div>
      <div style={{ margin: "8px 0 0 20px", display: "grid", gap: 4 }}>
        {chapters.map((chapter) => (
          <div key={chapter.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
            {editingChapter === chapter.id ? (
              <>
                <input value={editChapterName} onChange={(event) => setEditChapterName(event.target.value)} aria-label="Nom du chapitre" style={{ maxWidth: 200, minHeight: 32 }} />
                <button className="complete-button" onClick={() => { void send(`/api/chapters/${chapter.id}`, "PATCH", { name: editChapterName.trim() }, "Chapitre mis à jour.").then((ok) => { if (ok) setEditingChapter(null); }); }} aria-label="Enregistrer"><Check size={13} /></button>
                <button className="skip-button" onClick={() => setEditingChapter(null)} aria-label="Annuler"><X size={13} /></button>
              </>
            ) : (
              <>
                <span style={{ flex: 1, minWidth: 0 }}>{chapter.name} <span className="chart-muted">· maîtrise {chapter.mastery}%</span></span>
                <button className="icon-button" style={{ width: 30, height: 30 }} onClick={() => { setEditChapterName(chapter.name); setEditingChapter(chapter.id); }} aria-label={`Modifier le chapitre ${chapter.name}`}><Pencil size={13} /></button>
                <button className="icon-button danger" style={{ width: 30, height: 30 }} onClick={() => { if (window.confirm(`Supprimer le chapitre « ${chapter.name} » ?`)) void send(`/api/chapters/${chapter.id}`, "DELETE", undefined, "Chapitre supprimé."); }} aria-label={`Supprimer le chapitre ${chapter.name}`}><Trash2 size={13} /></button>
              </>
            )}
          </div>
        ))}
        {!chapters.length && <span className="chart-muted">Aucun chapitre — ajoute-en un pour cibler tes révisions.</span>}
      </div>
    </div>
  );
}
/* ── Section Cours : recherche, filtres, lecture, CRUD, import ──────────── */
function CoursesSection({ subjects, chapters, courses, send, reload }: { subjects: Subject[]; chapters: Chapter[]; courses: Course[]; send: Send; reload: () => Promise<void> }) {
  const [search, setSearch] = useState("");
  const [filterSubject, setFilterSubject] = useState("");
  const [filterChapter, setFilterChapter] = useState("");
  const [title, setTitle] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [chapterId, setChapterId] = useState("");
  const [content, setContent] = useState("");
  const [uploadSubject, setUploadSubject] = useState("");
  const [uploadChapter, setUploadChapter] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState("");
  const [openCourse, setOpenCourse] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  const filtered = courses.filter((course) => {
    if (filterSubject && course.subjectId !== filterSubject) return false;
    if (filterChapter && course.chapterId !== filterChapter) return false;
    if (search.trim()) {
      const needle = search.trim().toLowerCase();
      return course.title.toLowerCase().includes(needle) || (course.content ?? "").toLowerCase().includes(needle);
    }
    return true;
  });
  const chapterOptions = chapters.filter((chapter) => !filterSubject || chapter.subjectId === filterSubject);

  async function createCourse(event: FormEvent) {
    event.preventDefault();
    if (!title.trim() || !subjectId) return;
    const ok = await send("/api/courses", "POST", { title: title.trim(), subjectId, ...(chapterId ? { chapterId } : {}), ...(content.trim() ? { content } : {}) }, "Cours créé.");
    if (ok) { setTitle(""); setContent(""); setChapterId(""); }
  }

  async function uploadCourse(event: FormEvent) {
    event.preventDefault();
    const file = fileInput.current?.files?.[0];
    if (!file || !uploadSubject) { setUploadMessage("Choisis une matière et un fichier."); return; }
    setUploading(true);
    setUploadMessage("");
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("subjectId", uploadSubject);
      if (uploadChapter) body.append("chapterId", uploadChapter);
      const response = await fetch("/api/courses/upload", { method: "POST", body });
      if (response.ok) {
        const data = await response.json() as { extracted: boolean; stored: boolean };
        setUploadMessage(`Import réussi${data.extracted ? " · texte extrait" : " · OCR ou extraction en cours (voir Automatisations)"}${data.stored ? " · fichier conservé" : ""}.`);
        if (fileInput.current) fileInput.current.value = "";
        await reload();
        setUploadChapter("");
      } else {
        const data = await response.json().catch(() => null) as { error?: string } | null;
        setUploadMessage(data?.error ?? "Import impossible.");
      }
    } catch {
      setUploadMessage("Import impossible (hors ligne). Le navigateur ne peut pas différer un fichier : réessaie une fois connecté.");
    } finally {
      setUploading(false);
    }
  }
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div className="grid-2" style={{ alignItems: "start" }}>
        <form className="form-card" onSubmit={createCourse}>
          <h3>Nouveau cours (texte)</h3>
          <div className="field-row">
            <label>Titre<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Chapitre 3 — Dérivées" required /></label>
            <label>Matière<select value={subjectId} onChange={(event) => { setSubjectId(event.target.value); setChapterId(""); }} required><option value="">Choisir</option>{subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select></label>
            <label>Chapitre (optionnel)<select value={chapterId} onChange={(event) => setChapterId(event.target.value)}><option value="">Aucun</option>{chapters.filter((chapter) => chapter.subjectId === subjectId).map((chapter) => <option key={chapter.id} value={chapter.id}>{chapter.name}</option>)}</select></label>
          </div>
          <label style={{ marginTop: 10 }}>Contenu<textarea value={content} onChange={(event) => setContent(event.target.value)} placeholder="Colle ou rédige le contenu du cours…" /></label>
          <button className="primary-button" type="submit" style={{ marginTop: 12 }}><Plus size={16} /> Créer le cours</button>
        </form>
        <form className="form-card" onSubmit={uploadCourse}>
          <h3>Importer un fichier</h3>
          <p className="chart-muted" style={{ marginTop: -6, marginBottom: 10 }}>PDF, DOCX, TXT, PNG ou JPG (15 Mo max). Le texte est extrait et structuré automatiquement.</p>
          <div className="field-row">
            <label>Matière<select value={uploadSubject} onChange={(event) => { setUploadSubject(event.target.value); setUploadChapter(""); }} required><option value="">Choisir</option>{subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select></label>
            <label>Chapitre (optionnel)<select value={uploadChapter} onChange={(event) => setUploadChapter(event.target.value)}><option value="">Aucun</option>{chapters.filter((chapter) => chapter.subjectId === uploadSubject).map((chapter) => <option key={chapter.id} value={chapter.id}>{chapter.name}</option>)}</select></label>
          </div>
          <label style={{ marginTop: 10 }}>Fichier<input ref={fileInput} type="file" accept=".txt,.md,.markdown,.pdf,.docx,.png,.jpg,.jpeg" required /></label>
          <button className="primary-button" type="submit" disabled={uploading} style={{ marginTop: 12 }}><Plus size={16} /> {uploading ? "Import en cours…" : "Importer le fichier"}</button>
          {uploadMessage && <p className="state-message state-success" role="status" style={{ marginTop: 10 }}>{uploadMessage}</p>}
        </form>
      </div>

      <section className="data-list" aria-label="Liste des cours">
        <div className="list-heading"><h2>Tes cours</h2><span>{filtered.length} / {courses.length}</span></div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", padding: "12px 18px", borderBottom: "1px solid var(--border)" }}>
          <label style={{ flex: 1, minWidth: 200 }}>
            <span className="visually-hidden">Rechercher un cours</span>
            <span style={{ position: "relative", display: "block" }}>
              <Search size={15} style={{ position: "absolute", left: 10, top: 13, color: "var(--muted)" }} aria-hidden="true" />
              <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher dans les cours…" style={{ paddingLeft: 32 }} />
            </span>
          </label>
          <label style={{ maxWidth: 190 }}>Matière
            <select value={filterSubject} onChange={(event) => { setFilterSubject(event.target.value); setFilterChapter(""); }}>
              <option value="">Toutes</option>
              {subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
            </select>
          </label>
          <label style={{ maxWidth: 190 }}>Chapitre
            <select value={filterChapter} onChange={(event) => setFilterChapter(event.target.value)}>
              <option value="">Tous</option>
              {chapterOptions.map((chapter) => <option key={chapter.id} value={chapter.id}>{chapter.name}</option>)}
            </select>
          </label>
        </div>
        {!courses.length ? (
          <div className="state-empty"><strong>Aucun cours.</strong><span>Crée un cours ou importe un fichier : il sera lisible ici et servira aux fiches, flashcards et quiz.</span></div>
        ) : filtered.length === 0 ? (
          <div className="state-empty"><strong>Aucun résultat.</strong><span>Aucun cours ne correspond à ta recherche ou à tes filtres.</span></div>
        ) : filtered.map((course) => <CourseRow key={course.id} course={course} open={openCourse === course.id} onToggle={() => setOpenCourse(openCourse === course.id ? null : course.id)} editing={editing === course.id} onStartEdit={() => { setEditing(course.id); setEditTitle(course.title); setEditContent(course.content ?? ""); }} onCancelEdit={() => setEditing(null)} editTitle={editTitle} setEditTitle={setEditTitle} editContent={editContent} setEditContent={setEditContent} send={send} />)}
      </section>
    </div>
  );
}
function CourseRow({ course, open, onToggle, editing, onStartEdit, onCancelEdit, editTitle, setEditTitle, editContent, setEditContent, send }: {
  course: Course; open: boolean; onToggle: () => void; editing: boolean; onStartEdit: () => void; onCancelEdit: () => void;
  editTitle: string; setEditTitle: (value: string) => void; editContent: string; setEditContent: (value: string) => void; send: Send;
}) {
  return (
    <div style={{ borderTop: "1px solid var(--border)" }}>
      <div className="data-item">
        <div>
          <strong>{course.title}</strong>
          <span>{course.subject.name}{course.chapter ? ` · ${course.chapter.name}` : ""}{course.fileUrl ? " · fichier joint" : ""}</span>
        </div>
        <div className="item-actions">
          <button className="skip-button" onClick={onToggle} aria-expanded={open}>{open ? "Fermer" : "Lire"}</button>
          {course.fileUrl && <a className="skip-button" href={`/api/courses/${course.id}/file`} aria-label={`Télécharger le fichier de ${course.title}`}><Download size={13} /> Fichier</a>}
          <button className="icon-button" onClick={onStartEdit} aria-label={`Modifier ${course.title}`}><Pencil size={15} /></button>
          <button className="icon-button danger" onClick={() => { if (window.confirm(`Supprimer le cours « ${course.title} » ?`)) void send(`/api/courses/${course.id}`, "DELETE", undefined, "Cours supprimé."); }} aria-label={`Supprimer ${course.title}`}><Trash2 size={15} /></button>
        </div>
      </div>
      {open && (
        <div style={{ padding: "4px 18px 16px" }}>
          {course.content ? <div className="course-preview">{course.content}</div> : <p className="chart-muted">Aucun texte extrait pour ce cours (import image : l&apos;OCR se termine via Automatisations).</p>}
        </div>
      )}
      {editing && (
        <div style={{ padding: "0 18px 16px", display: "grid", gap: 10 }}>
          <label>Titre<input value={editTitle} onChange={(event) => setEditTitle(event.target.value)} /></label>
          <label>Contenu<textarea value={editContent} onChange={(event) => setEditContent(event.target.value)} style={{ minHeight: 160 }} /></label>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="primary-button" onClick={() => { void send(`/api/courses/${course.id}`, "PATCH", { title: editTitle.trim(), content: editContent }, "Cours mis à jour.").then((ok) => { if (ok) onCancelEdit(); }); }}><Check size={15} /> Enregistrer</button>
            <button className="ghost-button" onClick={onCancelEdit}>Annuler</button>
          </div>
        </div>
      )}
    </div>
  );
}
/* ── Section Évaluations : création → planning auto, édition, statuts ───── */
function EvaluationsSection({ subjects, chapters, evaluations, send }: { subjects: Subject[]; chapters: Chapter[]; evaluations: Evaluation[]; send: Send }) {
  const [title, setTitle] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [date, setDate] = useState("");
  const [chapterIds, setChapterIds] = useState<string[]>([]);
  const [importance, setImportance] = useState("normal");
  const [difficulty, setDifficulty] = useState("normal");
  const [description, setDescription] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDate, setEditDate] = useState("");
  const [lastPlan, setLastPlan] = useState("");

  const subjectChapters = chapters.filter((chapter) => chapter.subjectId === subjectId);

  async function createEvaluation(event: FormEvent) {
    event.preventDefault();
    if (!title.trim() || !subjectId || !date) return;
    const ok = await send("/api/evaluations", "POST", { title: title.trim(), subjectId, date, chapterIds, importance, difficulty, ...(description.trim() ? { description } : {}) }, "Contrôle créé : le planning de révision a été généré.");
    if (ok) {
      setLastPlan(`Contrôle « ${title.trim()} » créé${chapterIds.length ? ` avec ${chapterIds.length} chapitre(s)` : " sans chapitre : aucune révision ciblée ne peut être planifiée"}.`);
      setTitle(""); setDate(""); setChapterIds([]); setDescription("");
    }
  }

  return (
    <div className="grid-2" style={{ alignItems: "start" }}>
      <form className="form-card" onSubmit={createEvaluation}>
        <h3>Nouveau contrôle</h3>
        <div className="field-row">
          <label>Matière<select value={subjectId} onChange={(event) => { setSubjectId(event.target.value); setChapterIds([]); }} required><option value="">Choisir</option>{subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select></label>
          <label>Intitulé<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Contrôle chapitres 3-4" required /></label>
          <label>Date<input type="date" value={date} onChange={(event) => setDate(event.target.value)} required /></label>
        </div>
        <div className="field-row" style={{ marginTop: 10 }}>
          <label>Importance<select value={importance} onChange={(event) => setImportance(event.target.value)} aria-label="Importance">{Object.entries(importanceLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label>Difficulté<select value={difficulty} onChange={(event) => setDifficulty(event.target.value)} aria-label="Difficulté">{Object.entries(difficultyLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        </div>
        {subjectId && (
          <fieldset style={{ border: 0, padding: 0, margin: "12px 0 0" }}>
            <legend className="field">Chapitres concernés</legend>
            <div className="course-options">
              {subjectChapters.map((chapter) => (
                <button type="button" key={chapter.id} className={`course-option ${chapterIds.includes(chapter.id) ? "selected" : ""}`} onClick={() => setChapterIds((current) => current.includes(chapter.id) ? current.filter((id) => id !== chapter.id) : [...current, chapter.id])} aria-pressed={chapterIds.includes(chapter.id)}>
                  <span className="check-grid">{chapterIds.includes(chapter.id) ? <Check size={11} /> : null}</span><span>{chapter.name}</span>
                </button>
              ))}
              {!subjectChapters.length && <span className="chart-muted">Aucun chapitre pour cette matière.</span>}
            </div>
          </fieldset>
        )}
        <label style={{ marginTop: 12 }}>Informations complémentaires (optionnel)<input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Calculatrice autorisée, chapitre 5 exclu…" /></label>
        <button className="primary-button" type="submit" style={{ marginTop: 12 }}><Plus size={16} /> Créer le contrôle</button>
        {lastPlan && <p className="chart-muted" style={{ marginTop: 10 }}>{lastPlan}</p>}
      </form>
      <EvaluationsList evaluations={evaluations} send={send} editing={editing} setEditing={setEditing} editTitle={editTitle} setEditTitle={setEditTitle} editDate={editDate} setEditDate={setEditDate} />
    </div>
  );
}
function EvaluationsList({ evaluations, send, editing, setEditing, editTitle, setEditTitle, editDate, setEditDate }: {
  evaluations: Evaluation[]; send: Send; editing: string | null; setEditing: (value: string | null) => void;
  editTitle: string; setEditTitle: (value: string) => void; editDate: string; setEditDate: (value: string) => void;
}) {
  return (
    <section className="data-list" aria-label="Liste des contrôles">
      <div className="list-heading"><h2>Contrôles</h2><span>{evaluations.filter((evaluation) => evaluation.status === "planned").length} à venir</span></div>
      {!evaluations.length ? (
        <div className="state-empty"><strong>Aucun contrôle.</strong><span>Ajoute ton premier contrôle : Terminal OS planifie automatiquement tes révisions avant la date.</span></div>
      ) : evaluations.map((evaluation) => (
        <div key={evaluation.id} style={{ borderTop: "1px solid var(--border)" }}>
          <div className="data-item">
            <div>
              <strong>{evaluation.title}</strong>
              <span>{evaluation.subject.name} · {dateLabel(evaluation.date)} · importance {importanceLabels[evaluation.importance] ?? evaluation.importance}</span>
              <span>{evaluation.chapters.length ? `Chapitres : ${evaluation.chapters.map((chapter) => chapter.name).join(", ")}` : "Aucun chapitre lié"}</span>
            </div>
            <div className="item-actions">
              <span className={`status-badge ${evaluation.status === "planned" ? "planned" : evaluation.status === "completed" ? "completed" : "skipped"}`}>{statusLabels[evaluation.status] ?? evaluation.status}</span>
              <span className="chart-muted">{evaluation.revisions.length} révision(s)</span>
              {evaluation.status === "planned" && <button className="complete-button" onClick={() => { void send(`/api/evaluations/${evaluation.id}`, "PATCH", { status: "completed" }, "Contrôle terminé : ses révisions sont clôturées."); }} aria-label={`Marquer ${evaluation.title} comme terminé`}><Check size={13} /> Terminer</button>}
              {evaluation.status === "planned" && <button className="skip-button" onClick={() => { if (window.confirm(`Annuler « ${evaluation.title} » ? Ses sessions de révision planifiées seront ignorées.`)) void send(`/api/evaluations/${evaluation.id}`, "PATCH", { status: "cancelled" }, "Contrôle annulé."); }} aria-label={`Annuler ${evaluation.title}`}>Annuler</button>}
              <button className="icon-button" onClick={() => { setEditing(editing === evaluation.id ? null : evaluation.id); setEditTitle(evaluation.title); setEditDate(toLocalDateInput(evaluation.date)); }} aria-label={`Modifier ${evaluation.title}`}><Pencil size={15} /></button>
              <button className="icon-button danger" onClick={() => { if (window.confirm(`Supprimer « ${evaluation.title} » et ses sessions de révision ?`)) void send(`/api/evaluations/${evaluation.id}`, "DELETE", undefined, "Contrôle supprimé."); }} aria-label={`Supprimer ${evaluation.title}`}><Trash2 size={15} /></button>
            </div>
          </div>
          {editing === evaluation.id && (
            <div style={{ padding: "0 18px 14px", display: "grid", gap: 10 }}>
              <div className="field-row">
                <label>Intitulé<input value={editTitle} onChange={(event) => setEditTitle(event.target.value)} /></label>
                <label>Date (la changer régénère le planning)<input type="date" value={editDate} onChange={(event) => setEditDate(event.target.value)} /></label>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="primary-button" onClick={() => { void send(`/api/evaluations/${evaluation.id}`, "PATCH", { title: editTitle.trim(), date: editDate }, "Contrôle mis à jour : planning recalculé.").then((ok) => { if (ok) setEditing(null); }); }}><Check size={15} /> Enregistrer</button>
                <button className="ghost-button" onClick={() => setEditing(null)}>Annuler</button>
              </div>
            </div>
          )}
        </div>
      ))}
    </section>
  );
}
/* ── Section Révisions : workflow complet + création manuelle ───────────── */
function RevisionsSection({ subjects, revisions, send }: { subjects: Subject[]; revisions: Revision[]; send: Send }) {
  const [filter, setFilter] = useState<"upcoming" | "today" | "late" | "all">("upcoming");
  const [subjectId, setSubjectId] = useState("");
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("18:00");
  const [duration, setDuration] = useState("30");
  const [editing, setEditing] = useState<string | null>(null);
  const [editDate, setEditDate] = useState("");
  const [editTime, setEditTime] = useState("");
  const [editDuration, setEditDuration] = useState("30");

  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const filtered = revisions.filter((revision) => {
    const revisionDate = new Date(revision.date);
    const active = revision.status === "planned" || revision.status === "in_progress" || revision.status === "postponed";
    if (filter === "upcoming") return active && revisionDate >= startOfToday;
    if (filter === "today") return active && revisionDate >= startOfToday && revisionDate < new Date(startOfToday.getTime() + 86_400_000);
    if (filter === "late") return active && revisionDate < startOfToday;
    return true;
  });
  const lateCount = revisions.filter((revision) => (revision.status === "planned" || revision.status === "in_progress") && new Date(revision.date) < startOfToday).length;

  async function createRevision(event: FormEvent) {
    event.preventDefault();
    if (!subjectId || !title.trim() || !date) return;
    const ok = await send("/api/revisions", "POST", { subjectId, title: title.trim(), date, startTime, duration: Number(duration) || 30 }, "Session de révision créée.");
    if (ok) { setTitle(""); setDate(""); }
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div className="grid-2" style={{ alignItems: "start" }}>
        <form className="form-card" onSubmit={createRevision}>
          <h3>Ajouter une session manuelle</h3>
          <div className="field-row">
            <label>Matière<select value={subjectId} onChange={(event) => setSubjectId(event.target.value)} required><option value="">Choisir</option>{subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select></label>
            <label>Intitulé<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Revoir les fiches ch. 2" required /></label>
          </div>
          <div className="field-row" style={{ marginTop: 10 }}>
            <label>Date<input type="date" value={date} onChange={(event) => setDate(event.target.value)} required /></label>
            <label>Heure<input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} /></label>
            <label>Durée (min)<input type="number" min={5} max={180} step={5} value={duration} onChange={(event) => setDuration(event.target.value)} /></label>
          </div>
          <button className="primary-button" type="submit" style={{ marginTop: 12 }}><Plus size={16} /> Ajouter la session</button>
        </form>
        <div className="form-card">
          <h3>Filtrer les sessions</h3>
          <div role="group" aria-label="Filtres de sessions" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {([["upcoming", "À venir"], ["today", "Aujourd'hui"], ["late", lateCount ? `En retard (${lateCount})` : "En retard"], ["all", "Toutes"]] as const).map(([value, label]) => (
              <button key={value} type="button" className={filter === value ? "primary-button" : "ghost-button"} onClick={() => setFilter(value)} aria-pressed={filter === value}>{label}</button>
            ))}
          </div>
          <p className="chart-muted" style={{ marginTop: 12 }}>Les sessions « reportées » restent visibles jusqu&apos;à leur replanification ou suppression.</p>
        </div>
      </div>
      <RevisionsList revisions={filtered} total={revisions.length} send={send} editing={editing} setEditing={setEditing} editDate={editDate} setEditDate={setEditDate} editTime={editTime} setEditTime={setEditTime} editDuration={editDuration} setEditDuration={setEditDuration} />
    </div>
  );
}
function RevisionsList({ revisions, total, send, editing, setEditing, editDate, setEditDate, editTime, setEditTime, editDuration, setEditDuration }: {
  revisions: Revision[]; total: number; send: Send; editing: string | null; setEditing: (value: string | null) => void;
  editDate: string; setEditDate: (value: string) => void; editTime: string; setEditTime: (value: string) => void; editDuration: string; setEditDuration: (value: string) => void;
}) {
  return (
    <section className="data-list" aria-label="Liste des révisions">
      <div className="list-heading"><h2>Sessions de révision</h2><span>{revisions.length} / {total}</span></div>
      {!total ? (
        <div className="state-empty"><strong>Aucune session.</strong><span>Crée un contrôle pour générer automatiquement un planning, ou ajoute une session manuelle.</span></div>
      ) : revisions.length === 0 ? (
        <div className="state-empty"><strong>Rien dans ce filtre.</strong><span>Change de filtre pour voir les autres sessions.</span></div>
      ) : revisions.map((revision) => (
        <div key={revision.id} style={{ borderTop: "1px solid var(--border)" }}>
          <div className="data-item">
            <div>
              <strong>{revision.title}</strong>
              <span>{revision.subject.name}{revision.chapter ? ` · ${revision.chapter.name}` : ""} · {dateLabel(revision.date)}{revision.startTime ? ` · ${revision.startTime}` : ""} · {revision.duration} min · {typeLabels[revision.type] ?? revision.type}</span>
            </div>
            <div className="item-actions">
              <span className={`status-badge ${revision.status}`}>{statusLabels[revision.status] ?? revision.status}</span>
              {revision.status === "planned" && <button className="skip-button" onClick={() => { void send(`/api/revisions/${revision.id}`, "PATCH", { status: "in_progress" }, "Session commencée : bon courage !"); }} aria-label={`Commencer ${revision.title}`}>Commencer</button>}
              {(revision.status === "planned" || revision.status === "in_progress") && <button className="complete-button" onClick={() => { void send(`/api/revisions/${revision.id}`, "PATCH", { status: "completed" }, "Session terminée : la maîtrise du chapitre est mise à jour."); }} aria-label={`Terminer ${revision.title}`}><Check size={13} /> Terminer</button>}
              {revision.status === "planned" && <button className="skip-button" onClick={() => { if (window.confirm("Reporter la session d'un jour à la même heure ?")) void send(`/api/revisions/${revision.id}`, "PATCH", { status: "postponed" }, "Session reportée d'un jour."); }} aria-label={`Reporter ${revision.title}`}>Reporter</button>}
              {revision.status === "postponed" && <button className="skip-button" onClick={() => { void send(`/api/revisions/${revision.id}`, "PATCH", { status: "planned" }, "Session replanifiée."); }} aria-label={`Replanifier ${revision.title}`}>Replanifier</button>}
              <button className="icon-button" onClick={() => { setEditing(editing === revision.id ? null : revision.id); setEditDate(toLocalDateInput(revision.date)); setEditTime(revision.startTime ?? "18:00"); setEditDuration(String(revision.duration)); }} aria-label={`Modifier ${revision.title}`}><Pencil size={15} /></button>
              <button className="icon-button danger" onClick={() => { if (window.confirm(`Supprimer la session « ${revision.title} » ?`)) void send(`/api/revisions/${revision.id}`, "DELETE", undefined, "Session supprimée."); }} aria-label={`Supprimer ${revision.title}`}><Trash2 size={15} /></button>
            </div>
          </div>
          {editing === revision.id && (
            <div style={{ padding: "0 18px 14px", display: "grid", gap: 10 }}>
              <div className="field-row">
                <label>Date<input type="date" value={editDate} onChange={(event) => setEditDate(event.target.value)} /></label>
                <label>Heure<input type="time" value={editTime} onChange={(event) => setEditTime(event.target.value)} /></label>
                <label>Durée (min)<input type="number" min={5} max={180} step={5} value={editDuration} onChange={(event) => setEditDuration(event.target.value)} /></label>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="primary-button" onClick={() => { void send(`/api/revisions/${revision.id}`, "PATCH", { date: editDate, startTime: editTime, duration: Number(editDuration) || 30 }, "Session déplacée.").then((ok) => { if (ok) setEditing(null); }); }}><Check size={15} /> Enregistrer</button>
                <button className="ghost-button" onClick={() => setEditing(null)}>Annuler</button>
              </div>
            </div>
          )}
        </div>
      ))}
    </section>
  );
}
/* ── Section Notes : devoirs + notes, CRUD complet ──────────────────────── */
function NotesSection({ subjects, homework, grades, send }: { subjects: Subject[]; homework: Homework[]; grades: Grade[]; send: Send }) {
  const [hwTitle, setHwTitle] = useState("");
  const [hwSubject, setHwSubject] = useState("");
  const [hwDue, setHwDue] = useState("");
  const [hwPriority, setHwPriority] = useState("normal");
  const [hwEditing, setHwEditing] = useState<string | null>(null);
  const [hwEditTitle, setHwEditTitle] = useState("");
  const [hwEditDue, setHwEditDue] = useState("");

  const [gradeSubject, setGradeSubject] = useState("");
  const [gradeValue, setGradeValue] = useState("");
  const [gradeMax, setGradeMax] = useState("20");
  const [gradeCoef, setGradeCoef] = useState("1");
  const [gradeDate, setGradeDate] = useState(toLocalDateInput(new Date().toISOString()));
  const [gradeComment, setGradeComment] = useState("");
  const [gradeEditing, setGradeEditing] = useState<string | null>(null);
  const [gradeEditValue, setGradeEditValue] = useState("");

  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const overdueHomework = homework.filter((item) => item.status !== "completed" && new Date(item.dueDate) < startOfToday);
  const upcomingHomework = homework.filter((item) => item.status !== "completed" && new Date(item.dueDate) >= startOfToday);
  const doneHomework = homework.filter((item) => item.status === "completed");

  async function createHomework(event: FormEvent) {
    event.preventDefault();
    if (!hwTitle.trim() || !hwSubject || !hwDue) return;
    const ok = await send("/api/homework", "POST", { subjectId: hwSubject, title: hwTitle.trim(), dueDate: hwDue, priority: hwPriority }, "Devoir ajouté.");
    if (ok) { setHwTitle(""); setHwDue(""); }
  }
  async function createGrade(event: FormEvent) {
    event.preventDefault();
    if (!gradeSubject || gradeValue === "") return;
    const ok = await send("/api/grades", "POST", { subjectId: gradeSubject, grade: Number(gradeValue), maxGrade: Number(gradeMax) || 20, coefficient: Number(gradeCoef) || 1, date: gradeDate || toLocalDateInput(new Date().toISOString()), ...(gradeComment.trim() ? { comment: gradeComment.trim() } : {}) }, "Note ajoutée.");
    if (ok) { setGradeValue(""); setGradeComment(""); }
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div className="grid-2" style={{ alignItems: "start" }}>
        <form className="form-card" onSubmit={createHomework}>
          <h3>Nouveau devoir</h3>
          <div className="field-row">
            <label>Intitulé<input value={hwTitle} onChange={(event) => setHwTitle(event.target.value)} placeholder="Exercices 12 à 15 p.84" required /></label>
            <label>Matière<select value={hwSubject} onChange={(event) => setHwSubject(event.target.value)} required><option value="">Choisir</option>{subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select></label>
          </div>
          <div className="field-row" style={{ marginTop: 10 }}>
            <label>À rendre le<input type="datetime-local" value={hwDue} onChange={(event) => setHwDue(event.target.value)} required /></label>
            <label>Priorité<select value={hwPriority} onChange={(event) => setHwPriority(event.target.value)} aria-label="Priorité du devoir">{Object.entries(importanceLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          </div>
          <button className="primary-button" type="submit" style={{ marginTop: 12 }}><Plus size={16} /> Ajouter le devoir</button>
        </form>
        <form className="form-card" onSubmit={createGrade}>
          <h3>Nouvelle note</h3>
          <div className="field-row">
            <label>Matière<select value={gradeSubject} onChange={(event) => setGradeSubject(event.target.value)} required><option value="">Choisir</option>{subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select></label>
            <label>Note<input type="number" min={0} step={0.25} value={gradeValue} onChange={(event) => setGradeValue(event.target.value)} placeholder="15.5" required /></label>
            <label>Barème<input type="number" min={1} step={1} value={gradeMax} onChange={(event) => setGradeMax(event.target.value)} required /></label>
            <label>Coef<input type="number" min={0.5} step={0.5} value={gradeCoef} onChange={(event) => setGradeCoef(event.target.value)} required /></label>
          </div>
          <div className="field-row" style={{ marginTop: 10 }}>
            <label>Date<input type="date" value={gradeDate} onChange={(event) => setGradeDate(event.target.value)} /></label>
            <label>Commentaire<input value={gradeComment} onChange={(event) => setGradeComment(event.target.value)} placeholder="Contrôle chapitre 2" /></label>
          </div>
          <button className="primary-button" type="submit" style={{ marginTop: 12 }}><Plus size={16} /> Ajouter la note</button>
        </form>
      </div>
      <HomeworkLists overdue={overdueHomework} upcoming={upcomingHomework} done={doneHomework} send={send} editing={hwEditing} setEditing={setHwEditing} editTitle={hwEditTitle} setEditTitle={setHwEditTitle} editDue={hwEditDue} setEditDue={setHwEditDue} />
      <GradesList grades={grades} send={send} editing={gradeEditing} setEditing={setGradeEditing} editValue={gradeEditValue} setEditValue={setGradeEditValue} />
    </div>
  );
}
function HomeworkLists({ overdue, upcoming, done, send, editing, setEditing, editTitle, setEditTitle, editDue, setEditDue }: {
  overdue: Homework[]; upcoming: Homework[]; done: Homework[]; send: Send; editing: string | null; setEditing: (value: string | null) => void;
  editTitle: string; setEditTitle: (value: string) => void; editDue: string; setEditDue: (value: string) => void;
}) {
  const row = (item: Homework) => (
    <div key={item.id} style={{ borderTop: "1px solid var(--border)" }}>
      <div className="data-item">
        <div>
          <strong>{item.title}</strong>
          <span>{item.subject.name} · à rendre le {dateLabel(item.dueDate)}{item.estimatedDuration ? ` · ~${item.estimatedDuration} min` : ""}</span>
        </div>
        <div className="item-actions">
          <span className={`status-badge ${item.status === "completed" ? "completed" : item.priority === "critical" || item.priority === "high" ? "high" : "planned"}`}>{item.status === "completed" ? "Terminé" : importanceLabels[item.priority] ?? item.priority}</span>
          {item.status !== "completed" && <button className="complete-button" onClick={() => { void send(`/api/homework/${item.id}`, "PATCH", { status: "completed" }, "Devoir terminé, bravo !"); }} aria-label={`Marquer ${item.title} comme terminé`}><Check size={13} /> Terminer</button>}
          <button className="icon-button" onClick={() => { setEditing(editing === item.id ? null : item.id); setEditTitle(item.title); setEditDue(toLocalDateInput(item.dueDate)); }} aria-label={`Modifier ${item.title}`}><Pencil size={15} /></button>
          <button className="icon-button danger" onClick={() => { if (window.confirm(`Supprimer le devoir « ${item.title} » ?`)) void send(`/api/homework/${item.id}`, "DELETE", undefined, "Devoir supprimé."); }} aria-label={`Supprimer ${item.title}`}><Trash2 size={15} /></button>
        </div>
      </div>
      {editing === item.id && (
        <div style={{ padding: "0 18px 14px", display: "grid", gap: 10 }}>
          <div className="field-row">
            <label>Intitulé<input value={editTitle} onChange={(event) => setEditTitle(event.target.value)} /></label>
            <label>Échéance<input type="datetime-local" value={editDue} onChange={(event) => setEditDue(event.target.value)} /></label>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="primary-button" onClick={() => { void send(`/api/homework/${item.id}`, "PATCH", { title: editTitle.trim(), dueDate: editDue }, "Devoir mis à jour.").then((ok) => { if (ok) setEditing(null); }); }}><Check size={15} /> Enregistrer</button>
            <button className="ghost-button" onClick={() => setEditing(null)}>Annuler</button>
          </div>
        </div>
      )}
    </div>
  );
  return (
    <>
      <section className="data-list">
        <div className="list-heading"><h2>Devoirs en retard</h2><span>{overdue.length}</span></div>
        {overdue.length ? overdue.map(row) : <p className="empty-state">Aucun devoir en retard.</p>}
      </section>
      <section className="data-list">
        <div className="list-heading"><h2>Devoirs à venir</h2><span>{upcoming.length}</span></div>
        {upcoming.length ? upcoming.map(row) : <p className="empty-state">Aucun devoir à venir. Ajoute celui de demain !</p>}
      </section>
      <section className="data-list">
        <div className="list-heading"><h2>Devoirs terminés</h2><span>{done.length}</span></div>
        {done.length ? done.map(row) : <p className="empty-state">Les devoirs terminés apparaîtront ici.</p>}
      </section>
    </>
  );
}
function GradesList({ grades, send, editing, setEditing, editValue, setEditValue }: {
  grades: Grade[]; send: Send; editing: string | null; setEditing: (value: string | null) => void; editValue: string; setEditValue: (value: string) => void;
}) {
  return (
    <section className="data-list">
      <div className="list-heading"><h2>Notes</h2><span>{grades.length}</span></div>
      {!grades.length ? (
        <div className="state-empty"><strong>Aucune note.</strong><span>Ajoute tes notes : la moyenne pondérée par coefficient est calculée automatiquement.</span></div>
      ) : grades.map((grade) => (
        <div key={grade.id} style={{ borderTop: "1px solid var(--border)" }}>
          <div className="data-item">
            <div>
              <strong>{grade.grade}/{grade.maxGrade} <span className="chart-muted">· coef {grade.coefficient}</span></strong>
              <span>{grade.subject.name} · {dateLabel(grade.date)}{grade.comment ? ` · ${grade.comment}` : ""}</span>
            </div>
            <div className="item-actions">
              {editing === grade.id ? (
                <>
                  <input type="number" min={0} step={0.25} value={editValue} onChange={(event) => setEditValue(event.target.value)} aria-label="Nouvelle note" style={{ maxWidth: 90, minHeight: 32 }} />
                  <button className="complete-button" onClick={() => { void send(`/api/grades/${grade.id}`, "PATCH", { grade: Number(editValue) }, "Note mise à jour.").then((ok) => { if (ok) setEditing(null); }); }} aria-label="Enregistrer la note"><Check size={13} /></button>
                  <button className="skip-button" onClick={() => setEditing(null)} aria-label="Annuler"><X size={13} /></button>
                </>
              ) : (
                <>
                  <button className="icon-button" onClick={() => { setEditValue(String(grade.grade)); setEditing(grade.id); }} aria-label={`Modifier la note de ${grade.subject.name}`}><Pencil size={15} /></button>
                  <button className="icon-button danger" onClick={() => { if (window.confirm(`Supprimer la note ${grade.grade}/${grade.maxGrade} ?`)) void send(`/api/grades/${grade.id}`, "DELETE", undefined, "Note supprimée."); }} aria-label={`Supprimer la note de ${grade.subject.name}`}><Trash2 size={15} /></button>
                </>
              )}
            </div>
          </div>
        </div>
      ))}
    </section>
  );
}
const difficultyLabels: Record<string, string> = { easy: "Facile", normal: "Normale", hard: "Difficile" };