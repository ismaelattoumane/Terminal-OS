import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { regenerateRevisionPlan } from "@/services/automation";

const updateSchema = z.object({ title: z.string().trim().min(1).max(120).optional(), date: z.coerce.date().optional(), status: z.enum(["planned", "completed", "cancelled"]).optional(), description: z.string().max(2000).nullable().optional() }).strict();

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  const user = await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } });
  if (!user) return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 401 });
  const { id } = await context.params;
  const parsed = updateSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Données invalides", details: parsed.error.flatten() }, { status: 400 });
  const existing = await prisma.evaluation.findFirst({ where: { id, userId: user.id } });
  if (!existing) return NextResponse.json({ error: "Évaluation introuvable" }, { status: 404 });
  const evaluation = await prisma.evaluation.update({ where: { id }, data: parsed.data });
  if (parsed.data.date && parsed.data.date.getTime() !== existing.date.getTime()) {
    // B03 : la date change => les anciennes sessions planifiées sont supprimées
    // PUIS le plan est régénéré avec les chapitres liés à l'évaluation.
    await prisma.revisionSession.deleteMany({ where: { evaluationId: id, status: "planned" } });
    try { await regenerateRevisionPlan(user.id, id); } catch { /* plan régénérable depuis les Automatisations */ }
  }
  // B15 : terminer ou annuler une évaluation clôt ses sessions de révision.
  if (parsed.data.status === "completed") await prisma.revisionSession.updateMany({ where: { evaluationId: id, status: "planned" }, data: { status: "completed" } });
  if (parsed.data.status === "cancelled") await prisma.revisionSession.updateMany({ where: { evaluationId: id, status: "planned" }, data: { status: "skipped" } });
  return NextResponse.json(evaluation);
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  const user = await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } });
  if (!user) return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 401 });
  const { id } = await context.params;
  const existing = await prisma.evaluation.findFirst({ where: { id, userId: user.id }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: "Évaluation introuvable" }, { status: 404 });
  await prisma.evaluation.delete({ where: { id } });
  return new NextResponse(null, { status: 204 });
}