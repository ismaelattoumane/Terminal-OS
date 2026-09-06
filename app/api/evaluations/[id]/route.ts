import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { regenerateRevisionPlan } from "@/services/automation";
import { deleteGoogleEvents } from "@/services/calendar";

const updateSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  date: z.coerce.date().optional(),
  status: z.enum(["planned", "completed", "cancelled"]).optional(),
  description: z.string().max(2000).nullable().optional(),
  importance: z.enum(["low", "normal", "high", "critical"]).optional(),
  difficulty: z.enum(["easy", "normal", "hard"]).optional(),
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
  const existing = await prisma.evaluation.findFirst({ where: { id, userId: user.id } });
  if (!existing) return NextResponse.json({ error: "Évaluation introuvable" }, { status: 404 });
  const evaluation = await prisma.evaluation.update({ where: { id }, data: parsed.data });

  if (parsed.data.date && parsed.data.date.getTime() !== existing.date.getTime()) {
    // La date change : les anciennes sessions planifiées sont supprimées PUIS le
    // plan est régénéré. Avant la suppression, on récupère les éventuels identifiants
    // Google pour nettoyer les événements distants et éviter les orphelins (M03).
    const scheduled = await prisma.revisionSession.findMany({ where: { evaluationId: id, status: "planned" }, select: { calendarEventId: true } });
    await deleteGoogleEvents(user.googleAccessToken, scheduled.map((session) => session.calendarEventId));
    await prisma.revisionSession.deleteMany({ where: { evaluationId: id, status: "planned" } });
    try { await regenerateRevisionPlan(user.id, id); } catch {
      return NextResponse.json({ error: "Évaluation mise à jour, mais la régénération du plan a échoué. Relance-la depuis Automatisations." }, { status: 500 });
    }
  }

  // Terminer une évaluation clôt ses sessions planifiées ; l'annuler les ignore ET
  // nettoie leurs événements Google (elles ne doivent plus apparaître dans le
  // calendrier distant non plus).
  if (parsed.data.status === "completed") {
    await prisma.revisionSession.updateMany({ where: { evaluationId: id, status: "planned" }, data: { status: "completed" } });
    await prisma.revisionSession.updateMany({ where: { evaluationId: id, status: "in_progress" }, data: { status: "completed" } });
  }
  if (parsed.data.status === "cancelled") {
    const active = await prisma.revisionSession.findMany({ where: { evaluationId: id, status: { in: ["planned", "in_progress"] } }, select: { calendarEventId: true } });
    await deleteGoogleEvents(user.googleAccessToken, active.map((session) => session.calendarEventId));
    await prisma.revisionSession.updateMany({ where: { evaluationId: id, status: { in: ["planned", "in_progress"] } }, data: { status: "skipped", calendarEventId: null } });
  }
  return NextResponse.json(evaluation);
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  const { id } = await context.params;
  const existing = await prisma.evaluation.findFirst({ where: { id, userId: user.id }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: "Évaluation introuvable" }, { status: 404 });
  // Supprimer une évaluation supprime ses sessions (cascade DB) ; on tente aussi
  // de retirer les événements Google correspondants pour rester cohérent.
  const sessions = await prisma.revisionSession.findMany({ where: { evaluationId: id }, select: { calendarEventId: true } });
  await deleteGoogleEvents(user.googleAccessToken, sessions.map((session) => session.calendarEventId));
  await prisma.evaluation.delete({ where: { id } });
  return new NextResponse(null, { status: 204 });
}
