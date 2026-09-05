import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPagination, totalHeader } from "@/lib/pagination";

const gradeSchema = z.object({
  subjectId: z.string().cuid(),
  evaluationId: z.string().cuid().optional(),
  grade: z.number().min(0),
  maxGrade: z.number().positive().default(20),
  coefficient: z.number().positive().max(100).default(1),
  date: z.coerce.date(),
  comment: z.string().trim().max(500).optional(),
});

async function currentUserId() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return null;
  return (await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } }))?.id ?? null;
}

export async function GET(request: Request) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  const { take, skip } = getPagination(new URL(request.url));
  const [grades, total] = await Promise.all([
    prisma.grade.findMany({ where: { userId }, include: { subject: true, evaluation: { select: { id: true, title: true } } }, orderBy: { date: "desc" }, take, skip }),
    prisma.grade.count({ where: { userId } }),
  ]);
  return NextResponse.json(grades, { headers: totalHeader(total) });
}

export async function POST(request: Request) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  const parsed = gradeSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Données invalides", details: parsed.error.flatten() }, { status: 400 });
  if (parsed.data.grade > parsed.data.maxGrade) return NextResponse.json({ error: "La note dépasse le barème" }, { status: 400 });
  const subject = await prisma.subject.findFirst({ where: { id: parsed.data.subjectId, userId }, select: { id: true } });
  if (!subject) return NextResponse.json({ error: "Matière introuvable" }, { status: 404 });
  if (parsed.data.evaluationId && !(await prisma.evaluation.findFirst({ where: { id: parsed.data.evaluationId, userId }, select: { id: true } }))) return NextResponse.json({ error: "Évaluation introuvable" }, { status: 404 });
  const grade = await prisma.grade.create({ data: { ...parsed.data, userId } });
  return NextResponse.json(grade, { status: 201 });
}
