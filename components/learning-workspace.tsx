"use client";

import { FormEvent, startTransition, useEffect, useState } from "react";
import { Check, ChevronDown, Pencil, Plus, Trash2 } from "lucide-react";
import { answersMatch } from "@/lib/answer-matching";

type Subject = { id: string; name: string };
type Chapter = { id: string; name: string; subjectId: string };
type Course = { id: string; title: string; subjectId: string; chapterId: string | null };
type SheetContent = { summary?: string; keyIdeas?: string[]; definitions?: string[]; formulas?: string[]; methods?: string[]; commonMistakes?: string[]; examples?: string[]; takeaways?: string[] };
type Sheet = { id: string; title: string; content: SheetContent; createdAt: string };
type Card = { id: string; question: string; answer: string; chapterId: string; nextReview: string };
type QuizQuestion = { question: string; answer: string; type: string };

export function LearningWorkspace({ mode }: { mode: "sheets" | "flashcards" | "quiz" }) {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [allCards, setAllCards] = useState<Card[]>([]);
  const [subjectId, setSubjectId] = useState("");
  const [chapterId, setChapterId] = useState("");
  const [courseIds, setCourseIds] = useState<string[]>([]);
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  const [revealed, setRevealed] = useState<string | null>(null);
  const [expandedSheet, setExpandedSheet] = useState<string | null>(null);

  async function load() {
    const [subjectResponse, chapterResponse, courseResponse, sheetResponse, cardResponse, allCardResponse] = await Promise.all([fetch("/api/subjects"), fetch("/api/chapters"), fetch("/api/courses"), fetch("/api/study-sheets"), fetch("/api/flashcards"), fetch("/api/flashcards?scope=all")]);
    if (subjectResponse.ok) setSubjects(await subjectResponse.json());
    if (chapterResponse.ok) setChapters(await chapterResponse.json());
    if (courseResponse.ok) setCourses(await courseResponse.json());
    if (sheetResponse.ok) setSheets(await sheetResponse.json());
    if (cardResponse.ok) setCards(await cardResponse.json());
    if (allCardResponse.ok) setAllCards(await allCardResponse.json());
  }

  useEffect(() => {
let cancelled = false;
    Promise.all([fetch("/api/subjects"), fetch("/api/chapters"), fetch("/api/courses"), fetch("/api/study-sheets"), fetch("/api/flashcards"), fetch("/api/flashcards?scope=all")])
      .then(async ([subjectResponse, chapterResponse, courseResponse, sheetResponse, cardResponse, allCardResponse]) => {
        const subjectData = subjectResponse.ok ? await subjectResponse.json() : [];
        const chapterData = chapterResponse.ok ? await chapterResponse.json() : [];
        const courseData = courseResponse.ok ? await courseResponse.json() : [];
        const sheetData = sheetResponse.ok ? await sheetResponse.json() : [];
        const cardData = cardResponse.ok ? await cardResponse.json() : [];
        const allCardData = allCardResponse.ok ? await allCardResponse.json() : [];
        if (!cancelled) startTransition(() => { setSubjects(subjectData); setChapters(chapterData); setCourses(courseData); setSheets(sheetData); setCards(cardData); setAllCards(allCardData); });
      })
      .catch(() => { if (!cancelled) setFeedback("Connecte-toi pour utiliser cet espace."); });
    return () => { cancelled = true; };
  }, []);
async function generateSheet(event: FormEvent) {

    event.preventDefault();
    if (!courseIds.length) { setFeedback("Sélectionne au moins un cours."); return; }
    setBusy(true);
    try {
      const response = await fetch("/api/study-sheets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subjectId, chapterId: chapterId || undefined, courseIds, title: "Fiche · " + (courseIds.length === 1 ? courses.find((course) => course.id === courseIds[0])?.title ?? "Cours" : `${courseIds.length} cours`) }) });
      setFeedback(response.ok ? "Fiche générée." : "Génération impossible.");
      if (response.ok) await load();
    } finally { setBusy(false); }
  }

  async function deleteSheet(id: string) {
    if (!window.confirm("Supprimer cette fiche ? Cette action est définitive.")) return;
    const response = await fetch(`/api/study-sheets/${id}`, { method: "DELETE" });
    setFeedback(response.ok ? "Fiche supprimée." : "Suppression impossible.");
    if (response.ok) await load();
  }

  // Édition réelle d'une fiche (titre + contenu) persistée en base (PATCH).
  async function editSheet(id: string, payload: { title?: string; summary?: string; keyIdeas?: string[] }) {
    setBusy(true);
    try {
      const response = await fetch(`/api/study-sheets/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...(payload.title !== undefined ? { title: payload.title } : {}), content: { ...(payload.summary !== undefined ? { summary: payload.summary } : {}), ...(payload.keyIdeas !== undefined ? { keyIdeas: payload.keyIdeas } : {}) } }) });
      setFeedback(response.ok ? "Fiche mise à jour." : "Mise à jour impossible.");
      if (response.ok) await load();
    } finally { setBusy(false); }
  }

  async function reviewCard(id: string, quality: 1 | 2 | 3) {
    const response = await fetch(`/api/flashcards/${id}/review`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ quality }) });
    if (response.ok) { setRevealed(null); await load(); }
    else setFeedback("Action impossible. Vérifie ta connexion.");
  }

  async function editCard(id: string, question: string, answer: string) {
    setBusy(true);
    try {
      const response = await fetch(`/api/flashcards/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question, answer }) });
      setFeedback(response.ok ? "Carte mise à jour." : "Mise à jour impossible.");
      if (response.ok) await load();
    } finally { setBusy(false); }
  }

  async function deleteCard(id: string) {
    if (!window.confirm("Supprimer cette flashcard ? Cette action est définitive.")) return;
    const response = await fetch(`/api/flashcards/${id}`, { method: "DELETE" });
    setFeedback(response.ok ? "Carte supprimée." : "Suppression impossible.");
    if (response.ok) await load();
  }

  // B05 : création manuelle ou génération IA de flashcards via POST /api/flashcards.
  async function createCard(payload: { chapterId: string; courseId?: string; question?: string; answer?: string }) {
    if (!payload.chapterId) { setFeedback("Choisis un chapitre."); return; }
    if (!payload.question !== !payload.answer) { setFeedback("Remplis question ET réponse, ou laisse les deux vides pour générer."); return; }
    if (!payload.question && !payload.courseId) { setFeedback("Choisis un cours à partir duquel générer, ou saisis question et réponse."); return; }
    setBusy(true);
    try {
      const response = await fetch("/api/flashcards", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chapterId: payload.chapterId, courseId: payload.courseId || undefined, question: payload.question || undefined, answer: payload.answer || undefined }) });
      if (!response.ok) { const data = await response.json().catch(() => null); setFeedback((data as { error?: string } | null)?.error ?? "Création impossible."); return; }
      setFeedback("Flashcard(s) ajoutée(s).");
      await load();
    } finally { setBusy(false); }
  }

  function toggleCourse(id: string) {
    setCourseIds((current) => current.includes(id) ? current.filter((courseId) => courseId !== id) : [...current, id]);
  }

  // B14 : changer de matière vide le chapitre et les cours cochés (sinon 404 côté API).
  function changeSubject(value: string) {
    startTransition(() => { setSubjectId(value); setChapterId(""); setCourseIds([]); });
  }

  const subtitle = mode === "sheets" ? "Transforme tes cours en synthèses exploitables." : mode === "flashcards" ? "Révise avec une répétition espacée simple." : "Auto-évalue-toi : chaque tentative nourrit ta maîtrise.";
  const title = mode === "sheets" ? "Fiches de révision" : mode === "flashcards" ? "Flashcards" : "Quiz d'auto-évaluation";

  return (
    <div>
      <div className="page-heading">
        <div>
          <p className="eyebrow">APPRENTISSAGE</p>
          <h1>{title}</h1>
          <p className="muted">{subtitle}</p>
        </div>
        {feedback && <span className="workspace-message">{feedback}</span>}
      </div>
      {mode === "sheets" && <SheetManager subjects={subjects} chapters={chapters} courses={courses} sheets={sheets} subjectId={subjectId} setSubjectId={changeSubject} chapterId={chapterId} setChapterId={setChapterId} courseIds={courseIds} toggleCourse={toggleCourse} generateSheet={generateSheet} deleteSheet={deleteSheet} editSheet={editSheet} busy={busy} expandedSheet={expandedSheet} setExpandedSheet={setExpandedSheet} />}
      {mode === "flashcards" && <FlashcardManager cards={cards} allCards={allCards} subjects={subjects} chapters={chapters} courses={courses} onGenerate={createCard} busy={busy} revealed={revealed} setRevealed={setRevealed} reviewCard={reviewCard} editCard={editCard} deleteCard={deleteCard} />}
      {mode === "quiz" && <QuizManager subjects={subjects} chapters={chapters} courses={courses} subjectId={subjectId} setSubjectId={setSubjectId} chapterId={chapterId} setChapterId={setChapterId} setCourseId={(courseId: string) => setCourseIds(courseId ? [courseId] : [])} courseId={courseIds[0] ?? ""} />}
    </div>
  );
}
function SheetManager({ subjects, chapters, courses, sheets, subjectId, setSubjectId, chapterId, setChapterId, courseIds, toggleCourse, generateSheet, deleteSheet, editSheet, busy, expandedSheet, setExpandedSheet }: {
  subjects: Subject[]; chapters: Chapter[]; courses: Course[]; sheets: Sheet[]; subjectId: string; setSubjectId: (value: string) => void; chapterId: string; setChapterId: (value: string) => void; courseIds: string[]; toggleCourse: (id: string) => void; generateSheet: (event: FormEvent) => Promise<void>; deleteSheet: (id: string) => Promise<void>; editSheet: (id: string, payload: { title?: string; summary?: string; keyIdeas?: string[] }) => Promise<void>; busy: boolean; expandedSheet: string | null; setExpandedSheet: (id: string | null) => void;
}) {
  const filteredCourses = courses.filter((course) => !subjectId || course.subjectId === subjectId);
  const filteredChapters = chapters.filter((chapter) => !subjectId || chapter.subjectId === subjectId);
  const [editing, setEditing] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editSummary, setEditSummary] = useState("");
  const [editIdeas, setEditIdeas] = useState("");
  return (
    <>
      <form className="data-form wide-form" onSubmit={generateSheet}>
        <h2 className="form-title">Nouvelle fiche depuis tes cours</h2>
        <div className="form-row">
          <label>Matière
            <select value={subjectId} onChange={(event) => setSubjectId(event.target.value)} required>
              <option value="">Choisir</option>
              {subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
            </select>
          </label>
          <label>Chapitre
            <select value={chapterId} onChange={(event) => setChapterId(event.target.value)}>
              <option value="">Tout le chapitre</option>
              {filteredChapters.map((chapter) => <option key={chapter.id} value={chapter.id}>{chapter.name}</option>)}
            </select>
          </label>
        </div>
        <div className="form-row">
          <label className="course-picker">
            Cours sélectionnés ({courseIds.length})
            <div className="course-options">
              {filteredCourses.length ? filteredCourses.map((course) => (
                <button type="button" key={course.id} className={`course-option ${courseIds.includes(course.id) ? "selected" : ""}`} onClick={() => toggleCourse(course.id)}>
                  <span className="check-grid"><Check size={13} /></span>{course.title}
                </button>
              )) : <span className="muted">Aucun cours pour cette matière.</span>}
            </div>
          </label>
        </div>
        <button className="primary-button" type="submit" disabled={busy}>{busy ? "Génération…" : <><Plus size={16} /> Générer la fiche</>}</button>
      </form>
      <div className="learning-list">
        {sheets.length ? sheets.map((sheet) => (
          <article className="data-list" key={sheet.id}>
            <div className="list-heading">
              <h2>{sheet.title}</h2>
              <div className="item-actions">
                <span>{new Date(sheet.createdAt).toLocaleDateString("fr-FR")}</span>
                <button className="skip-button" onClick={() => setExpandedSheet(expandedSheet === sheet.id ? null : sheet.id)}>{expandedSheet === sheet.id ? "Réduire" : "Détail"} <ChevronDown size={14} /></button>
                <button className="skip-button" onClick={() => { if (editing === sheet.id) { setEditing(null); return; } setEditing(sheet.id); setEditTitle(sheet.title); setEditSummary(sheet.content.summary ?? ""); setEditIdeas((sheet.content.keyIdeas ?? []).join("\n")); }} aria-label={`Modifier ${sheet.title}`}>{editing === sheet.id ? "Annuler" : "Modifier"}</button>
                <button className="delete-button" onClick={() => deleteSheet(sheet.id)} aria-label={`Supprimer ${sheet.title}`}><Trash2 size={15} /></button>
              </div>
            </div>
            {editing === sheet.id ? (
              <div style={{ padding: "0 18px 14px", display: "grid", gap: 10 }}>
                <label>Titre<input value={editTitle} onChange={(event) => setEditTitle(event.target.value)} /></label>
                <label>Résumé<textarea value={editSummary} onChange={(event) => setEditSummary(event.target.value)} style={{ minHeight: 70 }} /></label>
                <label>Idées clés (une par ligne)<textarea value={editIdeas} onChange={(event) => setEditIdeas(event.target.value)} style={{ minHeight: 90 }} /></label>
                <button className="primary-button" disabled={busy} onClick={() => { void editSheet(sheet.id, { title: editTitle.trim() || sheet.title, summary: editSummary, keyIdeas: editIdeas.split("\n").map((line) => line.trim()).filter(Boolean) }).then(() => setEditing(null)); }}>Enregistrer la fiche</button>
              </div>
            ) : (
              <>
                <p className="muted">{sheet.content.summary}</p>
                {sheet.content.keyIdeas?.slice(0, 3).map((idea) => <p className="learning-point" key={idea}>• {idea}</p>)}
                {expandedSheet === sheet.id && <SheetDetail content={sheet.content} />}
              </>
            )}
          </article>
        )) : <p className="empty-state">Aucune fiche pour le moment. Génère-en une depuis tes cours.</p>}
      </div>
    </>
  );
}

function SheetSection({ label, items }: { label: string; items?: string[] }) {
  if (!items?.length) return null;
  return <div className="sheet-section"><strong>{label}</strong>{items.map((item) => <p className="learning-point" key={item}>• {item}</p>)}</div>;
}

function SheetDetail({ content }: { content: SheetContent }) {
  return (
    <div className="sheet-detail">
      <SheetSection label="Idées clés" items={content.keyIdeas} />
      <SheetSection label="Définitions" items={content.definitions} />
      <SheetSection label="Formules" items={content.formulas} />
      <SheetSection label="Méthodes" items={content.methods} />
      <SheetSection label="Erreurs fréquentes" items={content.commonMistakes} />
      <SheetSection label="Exemples" items={content.examples} />
      <SheetSection label="À retenir" items={content.takeaways} />
    </div>
  );
}
function FlashcardManager({ cards, allCards, subjects, chapters, courses, onGenerate, busy, revealed, setRevealed, reviewCard, editCard, deleteCard }: { cards: Card[]; allCards: Card[]; subjects: Subject[]; chapters: Chapter[]; courses: Course[]; onGenerate: (payload: { chapterId: string; courseId?: string; question?: string; answer?: string }) => Promise<void>; busy: boolean; revealed: string | null; setRevealed: (id: string | null) => void; reviewCard: (id: string, quality: 1 | 2 | 3) => Promise<void>; editCard: (id: string, question: string, answer: string) => Promise<void>; deleteCard: (id: string) => Promise<void> }) {
  const [editingCard, setEditingCard] = useState<string | null>(null);
  const [editQuestion, setEditQuestion] = useState("");
  const [editAnswer, setEditAnswer] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [chapterId, setChapterId] = useState("");
  const [courseId, setCourseId] = useState("");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const filteredChapters = chapters.filter((chapter) => !subjectId || chapter.subjectId === subjectId);
  const filteredCourses = courses.filter((course) => course.subjectId === subjectId && (!chapterId || course.chapterId === chapterId));
  function changeSubject(value: string) { setSubjectId(value); setChapterId(""); setCourseId(""); }
  return (
    <>
      <form className="data-form wide-form" onSubmit={(event) => { event.preventDefault(); void onGenerate({ chapterId, courseId, question: question.trim() || undefined, answer: answer.trim() || undefined }).then(() => { setQuestion(""); setAnswer(""); }); }}>
        <h2 className="form-title">Nouvelles flashcards</h2>
        <div className="form-row">
          <label>Matière
            <select value={subjectId} onChange={(event) => changeSubject(event.target.value)} required>
              <option value="">Choisir</option>
              {subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
            </select>
          </label>
          <label>Chapitre
            <select value={chapterId} onChange={(event) => { setChapterId(event.target.value); setCourseId(""); }} required>
              <option value="">Choisir</option>
              {filteredChapters.map((chapter) => <option key={chapter.id} value={chapter.id}>{chapter.name}</option>)}
            </select>
          </label>
          <label>Cours (pour générer)
            <select value={courseId} onChange={(event) => setCourseId(event.target.value)}>
              <option value="">Aucun</option>
              {filteredCourses.map((course) => <option key={course.id} value={course.id}>{course.title}</option>)}
            </select>
          </label>
        </div>
        <div className="form-row">
          <label>Question<input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Optionnel si un cours est choisi" /></label>
          <label>Réponse<input value={answer} onChange={(event) => setAnswer(event.target.value)} placeholder="Optionnel si un cours est choisi" /></label>
        </div>
        <p className="muted">Laisse question et réponse vides pour générer automatiquement des cartes depuis le cours choisi.</p>
        <button className="primary-button" type="submit" disabled={busy}>{busy ? "Création…" : <><Plus size={16} /> Créer / générer</>}</button>
      </form>
      <section className="data-list">
        <div className="list-heading"><h2>À réviser maintenant</h2><span>{cards.length}</span></div>
        {cards.length ? cards.map((card) => (
          <article className="flashcard" key={card.id}>
            <button className="flashcard-question" onClick={() => setRevealed(revealed === card.id ? null : card.id)}>{card.question}</button>
            {revealed === card.id && <>
              <p className="flashcard-answer">{card.answer}</p>
              <div className="item-actions">
                <button className="skip-button" onClick={() => reviewCard(card.id, 1)}>Difficile</button>
                <button className="skip-button" onClick={() => reviewCard(card.id, 2)}>Moyen</button>
                <button className="complete-button" onClick={() => reviewCard(card.id, 3)}><Check size={14} /> Facile</button>
              </div>
            </>}
          </article>
        )) : <p className="empty-state">Aucune carte à réviser pour le moment. Crée-en ci-dessus.</p>}
      </section>
      <section className="data-list">
        <div className="list-heading"><h2>Toutes mes cartes</h2><span>{allCards.length}</span></div>
        {allCards.length ? allCards.map((card) => (
          <article className="flashcard" key={card.id}>
            {editingCard === card.id ? (
              <div style={{ width: "100%", display: "grid", gap: 8 }}>
                <label>Question<input value={editQuestion} onChange={(event) => setEditQuestion(event.target.value)} /></label>
                <label>Réponse<textarea value={editAnswer} onChange={(event) => setEditAnswer(event.target.value)} style={{ minHeight: 60 }} /></label>
                <div className="item-actions">
                  <button className="complete-button" disabled={busy} onClick={() => { void editCard(card.id, editQuestion.trim(), editAnswer.trim()).then(() => setEditingCard(null)); }}><Check size={13} /> Enregistrer</button>
                  <button className="skip-button" onClick={() => setEditingCard(null)}>Annuler</button>
                </div>
              </div>
            ) : (
              <>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <button className="flashcard-question" onClick={() => setRevealed(revealed === card.id ? null : card.id)}>{card.question}</button>
                  {revealed === card.id && <p className="flashcard-answer" style={{ marginTop: 8 }}>{card.answer}</p>}
                  <span className="chart-muted" style={{ display: "block", marginTop: 6 }}>Prochaine révision : {new Date(card.nextReview).toLocaleDateString("fr-FR")}</span>
                </div>
                <div className="item-actions">
                  <button className="icon-button" onClick={() => { setEditingCard(card.id); setEditQuestion(card.question); setEditAnswer(card.answer); }} aria-label={`Modifier la carte « ${card.question.slice(0, 40)} »`}><Pencil size={15} /></button>
                  <button className="icon-button danger" onClick={() => deleteCard(card.id)} aria-label={`Supprimer la carte « ${card.question.slice(0, 40)} »`}><Trash2 size={15} /></button>
                </div>
              </>
            )}
          </article>
        )) : <p className="empty-state">Aucune carte. Crée-en ou génère-les depuis un cours.</p>}
      </section>
    </>
  );
}

function QuizManager({ subjects, chapters, courses, subjectId, setSubjectId, chapterId, setChapterId, courseId, setCourseId }: {
  subjects: Subject[]; chapters: Chapter[]; courses: Course[]; subjectId: string; setSubjectId: (value: string) => void; chapterId: string; setChapterId: (value: string) => void; courseId: string; setCourseId: (value: string) => void;
}) {
  const [questions, setQuestions] = useState<QuizQuestion[] | null>(null);
  const [answers, setAnswers] = useState<string[]>([]);
  const [result, setResult] = useState<{ score: number; correct: number; total: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  // B04 : l'API /api/quizzes exige que le cours appartienne au chapitre choisi,
  // on filtre donc les cours par chapitre (et pas seulement par matière).
  const filteredCourses = courses.filter((course) => course.subjectId === subjectId && (!chapterId || course.chapterId === chapterId));
  const filteredChapters = chapters.filter((chapter) => !subjectId || chapter.subjectId === subjectId);

  async function startQuiz() {
    if (!chapterId || !courseId) { setFeedback("Choisis un chapitre et un cours."); return; }
    setBusy(true);
    try {
      const response = await fetch("/api/quizzes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chapterId, courseId, count: 5 }) });
      if (!response.ok) { setFeedback("Impossible de générer le quiz."); return; }
      const data = await response.json();
      setQuestions(data.questions); setAnswers(data.questions.map(() => "")); setResult(null); setFeedback("");
    } finally { setBusy(false); }
  }

  async function submitQuiz() {
    if (!questions) return;
    // B19 : avertir avant de valider avec des réponses vides.
    if (answers.some((value) => !value?.trim()) && !window.confirm("Certaines réponses sont vides : elles compteront comme fausses. Valider quand même ?")) return;
    const response = await fetch("/api/quizzes/attempt", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chapterId, questions, answers }) });
    if (!response.ok) { setFeedback("Tentative non enregistrée."); return; }
    const data = await response.json();
    // B19 : comparaison normalisée (accents, ponctuation, articles) au lieu du strict trim/toLowerCase.
    const correct = questions.reduce((total, question, index) => total + (answersMatch(question.answer, answers[index] ?? "") ? 1 : 0), 0);
    setResult({ score: Math.round(data.score * 100), correct, total: questions.length });
    setQuestions(null);
  }

  return (
    <section className="data-list">
      {!questions && <>
        <div className="list-heading"><h2>Lancer un quiz d&apos;auto-évaluation</h2><span>5 questions</span></div>
        <form className="data-form" onSubmit={(event) => { event.preventDefault(); startQuiz(); }}>
          <div className="form-row">
            <label>Matière
              <select value={subjectId} onChange={(event) => { setSubjectId(event.target.value); setChapterId(""); setCourseId(""); }} required>
                <option value="">Choisir</option>
                {subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
              </select>
            </label>
            <label>Chapitre
              <select value={chapterId} onChange={(event) => setChapterId(event.target.value)} required>
                <option value="">Choisir</option>
                {filteredChapters.map((chapter) => <option key={chapter.id} value={chapter.id}>{chapter.name}</option>)}
              </select>
            </label>
            <label>Cours
              <select value={courseId} onChange={(event) => setCourseId(event.target.value)} required>
                <option value="">Choisir</option>
                {filteredCourses.map((course) => <option key={course.id} value={course.id}>{course.title}</option>)}
              </select>
            </label>
          </div>
          <button className="primary-button" type="submit" disabled={busy}>{busy ? "Génération…" : "Commencer le quiz"}</button>
        </form>
        {result && <div className="quiz-result"><strong>Score : {result.score}%</strong><span>{result.correct} bonne(s) réponse(s) sur {result.total}</span></div>}
        {feedback && <p className="muted">{feedback}</p>}
      </>}
      {questions && <>
        <div className="list-heading"><h2>Réponds à chaque question</h2><span>{questions.length} questions</span></div>
        {questions.map((question, index) => (
          <article className="flashcard" key={index}>
            <p className="flashcard-question">{index + 1}. {question.question}</p>
            <input className="quiz-input" value={answers[index] ?? ""} onChange={(event) => setAnswers((current) => current.map((value, i) => i === index ? event.target.value : value))} placeholder="Ta réponse…" />
          </article>
        ))}
        <button className="primary-button" type="button" onClick={submitQuiz}>Valider mes réponses</button>
      </>}
    </section>
  );
}
