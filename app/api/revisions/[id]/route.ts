import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { recalculateChapterMastery } from "@/services/mastery";
import { auditLog } from "@/lib/audit";

const updateSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  date: z.coerce.date().optional(),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional(),
  duration: z.number().int().min(5).max(180).optional(),
  type: z.enum(["learning", "memorization", "practice", "flashcards", "quiz", "final_review"]).optional(),
  status: z.enum(["planned", "in_progress", "completed", "skipped", "postponed"]).optional(),
  notes: z.string().max(2000).nullable().optional(),
  priority: z.enum(["low", "normal", "high", "critical"]).optional(),
  subjectId: z.string().cuid().optional(),
  chapterId: z.string().cuid().nullable().optional(),
}).strict();

async function currentUser() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return null;
  const user = await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } });
  return user ? { id: user.id, googleAccessToken: session.googleAccessToken } : null;
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  const { id } = await context.params;
  const parsed = updateSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Données invalides", details: parsed.error.flatten() }, { status: 400 });
  const existing = await prisma.revisionSession.findFirst({ where: { id, userId: user.id } });
  if (!existing) return NextResponse.json({ error: "Révision introuvable" }, { status: 404 });

  // Intégrité des relations « matières / chapitres » toujours vérifiée côté serveur.
  if (parsed.data.subjectId) {
    const subject = await prisma.subject.findFirst({ where: { id: parsed.data.subjectId, userId: user.id }, select: { id: true } });
    if (!subject) return NextResponse.json({ error: "Matière introuvable" }, { status: 404 });
  }
  const nextSubjectId = parsed.data.subjectId ?? existing.subjectId;
  if (parsed.data.chapterId !== undefined) {
    const chapterId = parsed.data.chapterId;
    if (chapterId && !(await prisma.chapter.findFirst({ where: { id: chapterId, subjectId: nextSubjectId, userId: user.id }, select: { id: true } }))) {
      return NextResponse.json({ error: "Chapitre introuvable pour cette matière" }, { status: 404 });
    }
  }

  // Statut « postponed » sans nouvelle date : on reporte d'un jour à la même heure.
  const data = { ...parsed.data };
  if (data.status === "postponed" && !data.date) {
    const nextDate = new Date(existing.date);
    nextDate.setDate(nextDate.getDate() + 1);
    data.date = nextDate;
  }

  const revision = await prisma.revisionSession.update({ where: { id }, data });

  // Effets de bord :
  // - Terminer une session : la maîtrise du chapitre est recalculée.
  // - Ignorer/reporter une session : son événement Google est retiré (best effort)
  //   pour ne pas laisser d'orphelin dans le calendrier distant.
  if (parsed.data.status === "completed" && existing.status !== "completed") {
    if (revision.chapterId) await recalculateChapterMastery(user.id, revision.chapterId);
    await auditLog(user.id, "revision.completed", { revisionId: id });
  }
  const becameInactive = (parsed.data.status === "skipped" || parsed.data.status === "postponed") && existing.calendarEventId;
  if (becameInactive) {
    const { deleteGoogleEvents } = await import("@/services/calendar");
    await deleteGoogleEvents(user.googleAccessToken, [existing.calendarEventId]);
    await prisma.revisionSession.update({ where: { id }, data: { calendarEventId: null } });
  }
  return NextResponse.json(revision);
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  const { id } = await context.params;
  const existing = await prisma.revisionSession.findFirst({ where: { id, userId: user.id }, select: { id: true, chapterId: true, calendarEventId: true } });
  if (!existing) return NextResponse.json({ error: "Révision introuvable" }, { status: 404 });

  // La suppression est réelle (DB) ; l'événement Google lié est retiré en best effort.
  if (existing.calendarEventId) {
    const { deleteGoogleEvents } = await import("@/services/calendar");
    await deleteGoogleEvents(user.googleAccessToken, [existing.calendarEventId]);
  }
  await prisma.revisionSession.delete({ where: { id } });
  if (existing.chapterId) await recalculateChapterMastery(user.id, existing.chapterId);
  await auditLog(user.id, "revision.deleted", { revisionId: id });
  return new NextResponse(null, { status: 204 });
}