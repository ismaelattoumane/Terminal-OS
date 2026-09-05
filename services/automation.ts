import { prisma } from "@/lib/prisma";
import { recalculateAllMastery, recalculateChapterMastery } from "@/services/mastery";
import { structureCourseText } from "@/services/course-processor";
import { getAIProvider } from "@/services/ai";
import { createRevisionPlan } from "@/services/revision-planner";

type JobType = "create_revision_plan" | "sync_google_calendar" | "process_course" | "generate_study_sheet" | "generate_flashcards" | "generate_quiz" | "update_mastery" | "recalculate_workload";

export async function enqueueJob(userId: string, type: JobType, payload: object, idempotencyKey = `${type}:${JSON.stringify(payload)}`) {
  return prisma.automationJob.upsert({ where: { userId_idempotencyKey: { userId, idempotencyKey } }, update: {}, create: { userId, type, payload, idempotencyKey } });
}

export async function processNextJob(userId: string, jobId?: string) {
  // B28 : on peut cibler un job précis (relance) sinon on prend le plus ancien.
  const job = await prisma.automationJob.findFirst({ where: { userId, ...(jobId ? { id: jobId } : {}), status: { in: ["pending", "failed"] }, attempts: { lt: 3 } }, orderBy: { createdAt: "asc" } });
  if (!job) return null;
  const claimed = await prisma.automationJob.updateMany({ where: { id: job.id, status: job.status, attempts: job.attempts }, data: { status: "running", attempts: { increment: 1 } } });
  if (!claimed.count) return null;
  try {
    await runHandler(job.type, job.userId, job.payload);
    await prisma.automationJob.update({ where: { id: job.id }, data: { status: "completed", error: null } });
    return { ...job, status: "completed" as const, attempts: job.attempts + 1 };
  } catch (error) {
    await prisma.automationJob.update({ where: { id: job.id }, data: { status: "failed", error: error instanceof Error ? error.message : "Erreur inconnue" } });
    throw error;
  }
}

export async function retryJob(userId: string, jobId: string) {
  const job = await prisma.automationJob.findFirst({ where: { id: jobId, userId }, select: { id: true, status: true, attempts: true } });
  if (!job) throw new Error("Job introuvable");
  if (job.status === "running") throw new Error("Job déjà en cours d'exécution");
  return prisma.automationJob.update({ where: { id: job.id }, data: { status: "pending", attempts: Math.max(1, job.attempts) } });
}

/**
 * Régénère le plan de révision d'une évaluation existante (B03) : utilisé quand
 * la date d'un contrôle change, après suppression des sessions planifiées.
 */
export async function regenerateRevisionPlan(userId: string, evaluationId: string) {
  await handleCreateRevisionPlan(userId, { evaluationId });
}

async function runHandler(type: JobType, userId: string, payload: unknown) {
  const data = payload as Record<string, unknown>;
  switch (type) {
    case "update_mastery":
      if (typeof data.chapterId === "string") await recalculateChapterMastery(userId, data.chapterId);
      return;
    case "recalculate_workload":
      await recalculateAllMastery(userId);
      return;
    case "process_course":
      await handleProcessCourse(userId, data);
      return;
    case "create_revision_plan":
      await handleCreateRevisionPlan(userId, data);
      return;
    case "generate_study_sheet":
      await handleGenerateStudySheet(userId, data);
      return;
    case "generate_flashcards":
      await handleGenerateFlashcards(userId, data);
      return;
    case "sync_google_calendar":
      if (typeof data.accessToken === "string" && data.accessToken) {
        const { importGoogleCalendarEvents, syncRevisionToGoogleCalendar } = await import("@/services/calendar");
        const revisions = await prisma.revisionSession.findMany({ where: { userId, status: { not: "skipped" } }, select: { id: true } });
        for (const revision of revisions) await syncRevisionToGoogleCalendar(data.accessToken, revision.id, userId);
        await importGoogleCalendarEvents(data.accessToken, userId, new Date());
        return;
      }
      throw new Error("Connexion Google requise : lancer la synchronisation depuis l'interface Calendrier");
    case "generate_quiz":
      // La génération de quiz reste à la demande : POST /api/quizzes. Rien à persister ici.
      return;
    default:
      throw new Error(`Type de job non supporté: ${type}`);
  }
}
/**
 * UPLOAD -> EXTRACTION -> STRUCTURATION -> COURS.
 * L'extraction est déjà faite à l'upload ; ce handler structure le contenu
 * et recalcule la maîtrise du chapitre concerné.
 */
async function handleProcessCourse(userId: string, payload: Record<string, unknown>) {
  const courseId = typeof payload.courseId === "string" ? payload.courseId : null;
  if (!courseId) throw new Error("courseId manquant");
  const course = await prisma.course.findFirst({ where: { id: courseId, userId }, select: { id: true, chapterId: true, title: true, content: true, sourceType: true, fileUrl: true } });
  if (!course) throw new Error("Cours introuvable pour ce compte");

  // OCR pour les images : le fichier est relu depuis le stockage S3.
  if (!course.content && course.sourceType === "image" && course.fileUrl) {
    const { downloadCourseFile } = await import("@/services/storage");
    const { ocrImageToText } = await import("@/services/ocr");
    const buffer = await downloadCourseFile(course.fileUrl);
    if (buffer) {
      const mime = course.fileUrl.endsWith(".png") ? "image/png" : "image/jpeg";
      const result = await ocrImageToText(new File([new Uint8Array(buffer)], "cours-image", { type: mime }));
      if (result) await prisma.course.update({ where: { id: course.id }, data: { content: result.text } });
    }
  }

  const latest = await prisma.course.findFirst({ where: { id: course.id, userId }, select: { content: true, rawContent: true } });
  if (latest?.content?.trim()) {
    const structured = structureCourseText(course.title, latest.content);
    // B30 : on conserve le contenu brut original avant de le remplacer par la
    // version structurée (évite la perte de données au-delà de l'extrait 80 lignes).
    await prisma.course.update({ where: { id: course.id }, data: { content: structured, rawContent: latest.rawContent ?? latest.content } });
  }
  if (course.chapterId) await recalculateChapterMastery(userId, course.chapterId);
}
async function handleCreateRevisionPlan(userId: string, payload: Record<string, unknown>) {
  const evaluationId = typeof payload.evaluationId === "string" ? payload.evaluationId : null;
  if (!evaluationId) throw new Error("evaluationId manquant");
  const evaluation = await prisma.evaluation.findFirst({ where: { id: evaluationId, userId }, include: { chapters: { select: { id: true, mastery: true } }, subject: { select: { id: true } } } });
  if (!evaluation) throw new Error("Évaluation introuvable pour ce compte");
  const [schedules, events] = await Promise.all([
    prisma.schedule.findMany({ where: { userId }, select: { dayOfWeek: true, startTime: true, endTime: true } }),
    prisma.event.findMany({ where: { userId, start: { gte: new Date() }, end: { lte: evaluation.date } }, select: { start: true, end: true } }),
  ]);
  const busyIntervals = [
    ...Array.from({ length: Math.max(0, Math.ceil((evaluation.date.getTime() - new Date().getTime()) / 86_400_000)) }, (_, index) => {
      const date = new Date(); date.setDate(date.getDate() + index + 1); return schedules.filter((schedule) => schedule.dayOfWeek === date.getDay()).map((schedule) => ({ date, startTime: schedule.startTime, endTime: schedule.endTime }));
    }).flat(),
    ...events.map((event) => ({ date: event.start, startTime: event.start.toTimeString().slice(0, 5), endTime: event.end.toTimeString().slice(0, 5) })),
  ];
  const plan = createRevisionPlan({ examDate: evaluation.date, difficulty: evaluation.difficulty, importance: evaluation.importance, chapterCount: evaluation.chapters.length, mastery: evaluation.chapters.map(({ mastery }) => mastery), busyIntervals });
  if (plan.length) await prisma.revisionSession.createMany({ data: plan.map((session) => ({ userId, subjectId: evaluation.subject.id, evaluationId: evaluation.id, title: `${evaluation.title} · ${session.type}`, date: session.date, startTime: session.startTime, duration: session.duration, type: session.type, priority: evaluation.importance })) });
}

async function handleGenerateStudySheet(userId: string, payload: Record<string, unknown>) {
  const { subjectId, courseIds } = payload;
  if (typeof subjectId !== "string" || !Array.isArray(courseIds) || !courseIds.every((id): id is string => typeof id === "string")) throw new Error("subjectId et courseIds requis");
  const title = typeof payload.title === "string" && payload.title.trim() ? payload.title.trim() : "Fiche de révision";
  const chapterId = typeof payload.chapterId === "string" ? payload.chapterId : null;
  if (chapterId && !(await prisma.chapter.findFirst({ where: { id: chapterId, userId, subjectId }, select: { id: true } }))) throw new Error("Chapitre introuvable pour cette matière");
  const courses = await prisma.course.findMany({ where: { id: { in: courseIds }, userId, subjectId }, select: { id: true, content: true } });
  if (courses.length !== courseIds.length) throw new Error("Cours introuvables pour ce compte");
  const content = await getAIProvider().generateStudySheet(courses.map((course) => course.content ?? "").join("\n").slice(0, 40000));
  await prisma.studySheet.create({ data: { userId, subjectId, chapterId, title, sourceCourseIds: courseIds, content } });
}

async function handleGenerateFlashcards(userId: string, payload: Record<string, unknown>) {
  const chapterId = typeof payload.chapterId === "string" ? payload.chapterId : null;
  const courseId = typeof payload.courseId === "string" ? payload.courseId : null;
  const count = typeof payload.count === "number" ? Math.min(Math.max(1, payload.count), 30) : 5;
  if (!chapterId) throw new Error("chapterId requis");
  const chapter = await prisma.chapter.findFirst({ where: { id: chapterId, userId }, select: { id: true, subjectId: true } });
  if (!chapter) throw new Error("Chapitre introuvable pour ce compte");
  const scope = courseId ? { id: courseId, userId, chapterId } : { chapterId, userId };
  const course = await prisma.course.findFirst({ where: scope, select: { content: true } });
  if (!course?.content) throw new Error("Aucun cours trouvé pour générer les flashcards");
  const generated = await getAIProvider().generateFlashcards(course.content.slice(0, 40000), count);
  if (generated.length) await prisma.flashcard.createMany({ data: generated.map((card) => ({ userId, chapterId, subjectId: chapter.subjectId, question: card.question, answer: card.answer })) });
}
