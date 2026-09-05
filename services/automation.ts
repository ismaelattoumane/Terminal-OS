import { prisma } from "@/lib/prisma";
import { recalculateChapterMastery } from "@/services/mastery";

type JobType = "create_revision_plan" | "sync_google_calendar" | "process_course" | "generate_study_sheet" | "generate_flashcards" | "generate_quiz" | "update_mastery" | "recalculate_workload";

export async function enqueueJob(userId: string, type: JobType, payload: object, idempotencyKey = `${type}:${JSON.stringify(payload)}`) {
  return prisma.automationJob.upsert({ where: { userId_idempotencyKey: { userId, idempotencyKey } }, update: {}, create: { userId, type, payload, idempotencyKey } });
}

export async function processNextJob(userId: string) {
  const job = await prisma.automationJob.findFirst({ where: { userId, status: { in: ["pending", "failed"] }, attempts: { lt: 3 } }, orderBy: { createdAt: "asc" } });
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

async function runHandler(type: JobType, userId: string, payload: unknown) {
  const data = payload as { chapterId?: string; courseId?: string };
  if (type === "update_mastery" && data.chapterId) {
    await recalculateChapterMastery(userId, data.chapterId);
    return;
  }
  if (type === "process_course" && data.courseId) {
    const course = await prisma.course.findFirst({ where: { id: data.courseId, userId }, select: { id: true } });
    if (!course) throw new Error("Cours introuvable pour ce compte");
    return;
  }
  if (["create_revision_plan", "sync_google_calendar", "generate_study_sheet", "generate_flashcards", "generate_quiz", "recalculate_workload"].includes(type)) return;
  throw new Error(`Type de job non supporté: ${type}`);
}