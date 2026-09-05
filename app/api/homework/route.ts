import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPagination, totalHeader } from "@/lib/pagination";

const homeworkSchema = z.object({
  subjectId: z.string().cuid(),
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000).optional(),
  dueDate: z.coerce.date(),
  estimatedDuration: z.number().int().min(5).max(600).default(30),
  priority: z.enum(["low", "normal", "high", "critical"]).default("normal"),
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
  const [homework, total] = await Promise.all([
    prisma.homework.findMany({ where: { userId }, include: { subject: true }, orderBy: { dueDate: "asc" }, take, skip }),
    prisma.homework.count({ where: { userId } }),
  ]);
  return NextResponse.json(homework, { headers: totalHeader(total) });
}

export async function POST(request: Request) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  const parsed = homeworkSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Données invalides", details: parsed.error.flatten() }, { status: 400 });
  const subject = await prisma.subject.findFirst({ where: { id: parsed.data.subjectId, userId }, select: { id: true } });
  if (!subject) return NextResponse.json({ error: "Matière introuvable" }, { status: 404 });
  const homework = await prisma.homework.create({ data: { ...parsed.data, userId } });
  return NextResponse.json(homework, { status: 201 });
}
