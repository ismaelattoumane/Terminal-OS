import { prisma } from "@/lib/prisma";
import { calendarTimeZone, scheduleDayToJs, zonedStartOfDay, zonedTimeOfDay } from "@/lib/timezone";
import { createRevisionPlan, type BusyInterval } from "@/services/revision-planner";

/**
 * Orchestration de la génération des sessions de révision d'une évaluation.
 * Unique point d'entrée pour la route `POST /api/evaluations` et le job
 * `create_revision_plan` (régénération) — la logique vivait en double, avec des
 * divergences de fuseau et l'oubli des créneaux déjà planifiés.
 */

/** Détecte les chapitres « concernés » par une évaluation. L'utilisateur peut
 * les sélectionner ; à défaut, on les déduit des données : chapitres de la
 * matière ayant des cours (cibles probables), sinon tous les chapitres de la
 * matière. */
export async function resolveEvaluationChapterIds(userId: string, subjectId: string, requested: string[]): Promise<Array<{ id: string; mastery: number }>> {
  if (requested.length) {
    const chapters = await prisma.chapter.findMany({ where: { id: { in: requested }, userId, subjectId }, select: { id: true, mastery: true } });
    if (chapters.length !== requested.length) throw new Error("Un ou plusieurs chapitres sont invalides ou hors de cette matière");
    return chapters;
  }
  const withCourses = await prisma.chapter.findMany({ where: { userId, subjectId, courses: { some: {} } }, select: { id: true, mastery: true } });
  if (withCourses.length) return withCourses;
  return prisma.chapter.findMany({ where: { userId, subjectId }, select: { id: true, mastery: true } });
}
/** Construit la liste des créneaux occupés entre deux instants : cours de
 * l'emploi du temps (mappés sur le bon jour de la semaine — Lundi=0 en base,
 * dimanche=0 en JS), événements internes/Google et sessions de révision déjà
 * planifiées (évite les conflits entre évaluations). Tout est exprimé dans
 * CALENDAR_TIMEZONE, heure murale de l'utilisateur. */
async function buildBusyIntervals(userId: string, from: Date, to: Date): Promise<{ intervals: BusyInterval[]; existingLoad: Record<string, number> }> {
  const timeZone = calendarTimeZone();
  const [schedules, events, plannedRevisions] = await Promise.all([
    prisma.schedule.findMany({ where: { userId }, select: { dayOfWeek: true, startTime: true, endTime: true } }),
    prisma.event.findMany({ where: { userId, start: { gte: from }, end: { lte: to } }, select: { start: true, end: true } }),
    prisma.revisionSession.findMany({ where: { userId, status: "planned", date: { gte: zonedStartOfDay(from, timeZone), lte: to } }, select: { date: true, startTime: true, duration: true } }),
  ]);
  const intervals: BusyInterval[] = [];
  const existingLoad: Record<string, number> = {};
  const startDay = zonedStartOfDay(from, timeZone).getTime();
  const dayCount = Math.max(0, Math.round((zonedStartOfDay(to, timeZone).getTime() - startDay) / 86_400_000));
  for (let index = 1; index <= dayCount; index += 1) {
    const date = new Date(startDay + index * 86_400_000);
    const jsDayOfWeek = (date.getDay() + 6) % 7;
    for (const schedule of schedules) {
      if (scheduleDayToJs(schedule.dayOfWeek) !== jsDayOfWeek) continue;
      intervals.push({ date, startTime: schedule.startTime, endTime: schedule.endTime });
    }
  }
  for (const event of events) {
    intervals.push({ date: event.start, startTime: zonedTimeOfDay(event.start, timeZone), endTime: zonedTimeOfDay(event.end, timeZone) });
  }
  for (const revision of plannedRevisions) {
    const start = toMinutes(revision.startTime ?? "18:00");
    intervals.push({ date: revision.date, startTime: revision.startTime ?? "18:00", endTime: toHHMM(Math.min(24 * 60, start + (revision.duration || 30))) });
    const key = `${revision.date.getFullYear()}-${String(revision.date.getMonth() + 1).padStart(2, "0")}-${String(revision.date.getDate()).padStart(2, "0")}`;
    existingLoad[key] = (existingLoad[key] ?? 0) + (revision.duration || 30);
  }
  return { intervals, existingLoad };
}
/**
 * Génère (ou régénère) le plan de révision d'une évaluation : calcule les
 * créneaux libres (emploi du temps + événements + sessions déjà planifiées),
 * supprime les éventuelles sessions planifiées existantes de cette évaluation
 * (idempotence — jamais de doublons) et nettoie leurs événements Google (aucun
 * orphelin), puis crée les nouvelles sessions, chaque session étant rattachée à
 * un chapitre (rotation) pour que la maîtrise puisse être mise à jour.
 */
export async function createEvaluationRevisionSessions(userId: string, evaluationId: string, options?: { googleAccessToken?: string | null }): Promise<{ created: Array<{ id: string }>; deleted: number }> {
  const evaluation = await prisma.evaluation.findFirst({
    where: { id: evaluationId, userId },
    include: { chapters: { select: { id: true, mastery: true } }, subject: { select: { id: true } } },
  });
  if (!evaluation) throw new Error("Évaluation introuvable pour ce compte");

  const now = new Date();
  const { intervals, existingLoad } = await buildBusyIntervals(userId, now, evaluation.date);
  const plan = createRevisionPlan({
    examDate: evaluation.date,
    difficulty: evaluation.difficulty,
    importance: evaluation.importance,
    chapterCount: evaluation.chapters.length,
    mastery: evaluation.chapters.map(({ mastery }) => mastery),
    existingLoad,
    busyIntervals: intervals,
  });

  const toRemove = await prisma.revisionSession.findMany({ where: { evaluationId, userId, status: "planned" }, select: { calendarEventId: true } });
  // Nettoyage des événements Google des sessions remplacées (best effort) :
  // évite les orphelins quand la régénération part d'un job (worker) plutôt que
  // de la route PATCH.
  if (toRemove.length) {
    const { deleteGoogleEvents } = await import("@/services/calendar");
    await deleteGoogleEvents(options?.googleAccessToken, toRemove.map((session) => session.calendarEventId));
  }
  const deleted = await prisma.revisionSession.deleteMany({ where: { evaluationId, userId, status: "planned" } });
  if (!plan.length) return { created: [], deleted: deleted.count };

  const chapterIds = evaluation.chapters.map(({ id }) => id);
  const data = plan.map((session, index) => ({
    userId,
    subjectId: evaluation.subject.id,
    chapterId: chapterIds.length ? chapterIds[index % chapterIds.length] : null,
    evaluationId: evaluation.id,
    title: `${evaluation.title} · ${session.type}`,
    date: session.date,
    startTime: session.startTime,
    duration: session.duration,
    type: session.type,
    priority: evaluation.importance,
  }));
  await prisma.revisionSession.createMany({ data });
  const rows = await prisma.revisionSession.findMany({
    where: { evaluationId: evaluation.id, userId, status: "planned" },
    select: { id: true },
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
    take: data.length,
  });
  return { created: rows, deleted: deleted.count };
}

function toMinutes(value: string) { const [hours, minutes] = value.split(":").map(Number); return hours * 60 + minutes; }
function toHHMM(minutes: number) { return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`; }