import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const updateSchema = z.object({
  grade: z.number().min(0).optional(),
  maxGrade: z.number().positive().optional(),
  coefficient: z.number().positive().max(100).optional(),
  date: z.coerce.date().optional(),
  comment: z.string().trim().max(500).nullable().optional(),
}).strict();

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  const user = await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } });
  if (!user) return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 401 });
  const { id } = await context.params;
  const parsed = updateSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Données invalides", details: parsed.error.flatten() }, { status: 400 });
  const existing = await prisma.grade.findFirst({ where: { id, userId: user.id }, select: { id: true, grade: true, maxGrade: true } });
  if (!existing) return NextResponse.json({ error: "Note introuvable" }, { status: 404 });
  const nextGrade = parsed.data.grade ?? existing.grade;
  const nextMax = parsed.data.maxGrade ?? existing.maxGrade;
  if (nextGrade > nextMax) return NextResponse.json({ error: "La note dépasse le barème" }, { status: 400 });
  const grade = await prisma.grade.update({ where: { id }, data: parsed.data });
  return NextResponse.json(grade);
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  const user = await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } });
  if (!user) return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 401 });
  const { id } = await context.params;
  const existing = await prisma.grade.findFirst({ where: { id, userId: user.id }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: "Note introuvable" }, { status: 404 });
  await prisma.grade.delete({ where: { id } });
  return new NextResponse(null, { status: 204 });
}
