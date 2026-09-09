import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { enqueueJob } from "@/services/automation";
import { resolveEvaluationChapterIds, createEvaluationRevisionSessions } from "@/services/plan-execution";
import { getPagination, totalHeader } from "@/lib/pagination";

const evaluationSchema = z.object({
  title: z.string().trim().min(1).max(120), subjectId: z.string().cuid(), date: z.coerce.date(),
  description: z.string().max(2000).optional(), importance: z.enum(["low", "normal", "high", "critical"]).default("normal"),
  difficulty: z.enum(["easy", "normal", "hard"]).default("normal"), chapterIds: z.array(z.string().cuid()).default([]),
});

async function currentUser() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return null;
  const user = await prisma.user.findUnique({ where: { email: session.user.email } });
  return user ? { user, googleAccessToken: session.googleAccessToken } : null;
}

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  const parsed = evaluationSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Données invalides", details: parsed.error.flatten() }, { status: 400 });
  const { chapterIds: requestedChapterIds, ...data } = parsed.data;
  const subject = await prisma.subject.findFirst({ where: { id: data.subjectId, userId: user.user.id }, select: { id: true } });
  if (!subject) return NextResponse.json({ error: "Matière introuvable" }, { status: 404 });
  // Étape « analyse automatique des chapitres » : si aucun chapitre n'est
  // sélectionné, Terminal OS déduit les chapitres concernés (ceux qui ont des
  // cours, sinon tous ceux de la matière).
  let chapters: Array<{ id: string; mastery: number }>;
  try {
    chapters = await resolveEvaluationChapterIds(user.user.id, data.subjectId, requestedChapterIds);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Chapitres invalides" }, { status: 400 });
  }
  const evaluation = await prisma.evaluation.create({ data: { ...data, userId: user.user.id, chapters: { connect: chapters.map(({ id }) => ({ id })) } } });
  const { created, deleted, unplaced } = await createEvaluationRevisionSessions(user.user.id, evaluation.id);
  void deleted;
  await Promise.all(chapters.map((chapter) => enqueueJob(user.user.id, "update_mastery", { chapterId: chapter.id }, `evaluation:${evaluation.id}:mastery:${chapter.id}`)));
  // Synchronisation Google Calendar immédiate (best effort) : les nouvelles
  // sessions sont poussées si un jeton existe ; sinon le job en file d'attente
  // (worker/cron) le fera depuis le token persisté.
  let googleSynced = 0;
  try {
    const { getGoogleAccessToken, syncRevisionsToGoogle } = await import("@/services/calendar");
    const accessToken = user.googleAccessToken ?? await getGoogleAccessToken(user.user.id);
    if (accessToken) {
      googleSynced = await syncRevisionsToGoogle(accessToken, user.user.id, created.map((session) => session.id));
      if (googleSynced === 0) await enqueueJob(user.user.id, "sync_google_calendar", {}, `evaluation:${evaluation.id}:sync`);
    }
  } catch {
    await enqueueJob(user.user.id, "sync_google_calendar", {}, `evaluation:${evaluation.id}:sync`);
  }
  const placementWarning = unplaced > 0
    ? `Impossible de placer toutes les révisions automatiquement (${unplaced} créneau(x) non trouvé(s)). Réduis la durée, utilise un autre jour, ou planifie manuellement.`
    : null;
  return NextResponse.json({
    evaluation,
    chapters: chapters.map(({ id }) => ({ id })),
    revisionSessionsCreated: created.length,
    revisionsUnplaced: unplaced,
    placementWarning,
    autoChapters: requestedChapterIds.length === 0,
    googleSynced,
  }, { status: 201 });
}

export async function GET(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  const { take, skip } = getPagination(new URL(request.url));
  const [evaluations, total] = await Promise.all([
    prisma.evaluation.findMany({ where: { userId: user.user.id }, include: { subject: true, chapters: true, revisions: true }, orderBy: { date: "asc" }, take, skip }),
    prisma.evaluation.count({ where: { userId: user.user.id } }),
  ]);
  return NextResponse.json(evaluations, { headers: totalHeader(total) });
}
