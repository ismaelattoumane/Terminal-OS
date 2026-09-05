"use client";

import { FormEvent, startTransition, useEffect, useState } from "react";
import { Check, ChevronDown, Plus, Trash2 } from "lucide-react";

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
  const [subjectId, setSubjectId] = useState("");
  const [chapterId, setChapterId] = useState("");
  const [courseIds, setCourseIds] = useState<string[]>([]);
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  const [revealed, setRevealed] = useState<string | null>(null);
  const [expandedSheet, setExpandedSheet] = useState<string | null>(null);

  async function load() {
    const [subjectResponse, chapterResponse, courseResponse, sheetResponse, cardResponse] = await Promise.all([fetch("/api/subjects"), fetch("/api/chapters"), fetch("/api/courses"), fetch("/api/study-sheets"), fetch("/api/flashcards")]);
    if (subjectResponse.ok) setSubjects(await subjectResponse.json());
    if (chapterResponse.ok) setChapters(await chapterResponse.json());
    if (courseResponse.ok) setCourses(await courseResponse.json());
    if (sheetResponse.ok) setSheets(await sheetResponse.json());
    if (cardResponse.ok) setCards(await cardResponse.json());
  }

  useEffect(() => {
let cancelled = false;
    Promise.all([fetch("/api/subjects"), fetch("/api/chapters"), fetch("/api/courses"), fetch("/api/study-sheets"), fetch("/api/flashcards")])
      .then(async ([subjectResponse, chapterResponse, courseResponse, sheetResponse, cardResponse]) => {
        const subjectData = subjectResponse.ok ? await subjectResponse.json() : [];
        const chapterData = chapterResponse.ok ? await chapterResponse.json() : [];
        const courseData = courseResponse.ok ? await courseResponse.json() : [];
        const sheetData = sheetResponse.ok ? await sheetResponse.json() : [];
        const cardData = cardResponse.ok ? await cardResponse.json() : [];
        if (!cancelled) startTransition(() => { setSubjects(subjectData); setChapters(chapterData); setCourses(courseData); setSheets(sheetData); setCards(cardData); });
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
    const response = await fetch(`/api/study-sheets/${id}`, { method: "DELETE" });
    setFeedback(response.ok ? "Fiche supprimée." : "Suppression impossible.");
    if (response.ok) await load();
  }

  async function reviewCard(id: string, quality: 1 | 2 | 3) {
    const response = await fetch(`/api/flashcards/${id}/review`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ quality }) });
    if (response.ok) { setRevealed(null); await load(); }
    else setFeedback("Action impossible. Vérifie ta connexion.");
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

  const subtitle = mode === "sheets" ? "Transforme tes cours en synthèses exploitables." : mode === "flashcards" ? "Révise avec une répétition espacée simple." : "Auto-évalue-toi : chaque tentative nourrit ta maîtrise.";
  const title = mode === "sheets" ? "Fiches de révision" : mode === "flashcards" ? "Flashcards" : "Quiz d'auto-évaluation";

  return (
    <div className="workspace-page">
      <div className="workspace-heading">
        <div>
          <p className="eyebrow">PHASE 5 · APPRENTISSAGE</p>
          <h1>{title}</h1>
          <p className="muted">{subtitle}</p>
        </div>
        {feedback && <span className="workspace-message">{feedback}</span>}
      </div>
      {mode === "sheets" && <SheetManager subjects={subjects} chapters={chapters} courses={courses} sheets={sheets} subjectId={subjectId} setSubjectId={setSubjectId} chapterId={chapterId} setChapterId={setChapterId} courseIds={courseIds} toggleCourse={toggleCourse} generateSheet={generateSheet} deleteSheet={deleteSheet} busy={busy} expandedSheet={expandedSheet} setExpandedSheet={setExpandedSheet} />}
      {mode === "flashcards" && <FlashcardManager cards={cards} subjects={subjects} chapters={chapters} courses={courses} onGenerate={createCard} busy={busy} revealed={revealed} setRevealed={setRevealed} reviewCard={reviewCard} />}
      {mode === "quiz" && <QuizManager subjects={subjects} chapters={chapters} courses={courses} subjectId={subjectId} setSubjectId={setSubjectId} chapterId={chapterId} setChapterId={setChapterId} setCourseId={(courseId: string) => setCourseIds(courseId ? [courseId] : [])} courseId={courseIds[0] ?? ""} />}
    </div>
  );
}
function SheetManager({ subjects, chapters, courses, sheets, subjectId, setSubjectId, chapterId, setChapterId, courseIds, toggleCourse, generateSheet, deleteSheet, busy, expandedSheet, setExpandedSheet }: {
  subjects: Subject[]; chapters: Chapter[]; courses: Course[]; sheets: Sheet[]; subjectId: string; setSubjectId: (value: string) => void; chapterId: string; setChapterId: (value: string) => void; courseIds: string[]; toggleCourse: (id: string) => void; generateSheet: (event: FormEvent) => Promise<void>; deleteSheet: (id: string) => Promise<void>; busy: boolean; expandedSheet: string | null; setExpandedSheet: (id: string | null) => void;
}) {
  const filteredCourses = courses.filter((course) => !subjectId || course.subjectId === subjectId);
  const filteredChapters = chapters.filter((chapter) => !subjectId || chapter.subjectId === subjectId);
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
                <button className="delete-button" onClick={() => deleteSheet(sheet.id)} aria-label={`Supprimer ${sheet.title}`}><Trash2 size={15} /></button>
              </div>
            </div>
            <p className="muted">{sheet.content.summary}</p>
            {sheet.content.keyIdeas?.slice(0, 3).map((idea) => <p className="learning-point" key={idea}>• {idea}</p>)}
            {expandedSheet === sheet.id && <SheetDetail content={sheet.content} />}
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
function FlashcardManager({ cards, subjects, chapters, courses, onGenerate, busy, revealed, setRevealed, reviewCard }: { cards: Card[]; subjects: Subject[]; chapters: Chapter[]; courses: Course[]; onGenerate: (payload: { chapterId: string; courseId?: string; question?: string; answer?: string }) => Promise<void>; busy: boolean; revealed: string | null; setRevealed: (id: string | null) => void; reviewCard: (id: string, quality: 1 | 2 | 3) => Promise<void> }) {
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
    const response = await fetch("/api/quizzes/attempt", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chapterId, questions, answers }) });
    if (!response.ok) { setFeedback("Tentative non enregistrée."); return; }
    const data = await response.json();
    const correct = questions.reduce((total, question, index) => total + (question.answer.trim().toLowerCase() === answers[index]?.trim().toLowerCase() ? 1 : 0), 0);
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
