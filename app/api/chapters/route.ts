import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPagination, totalHeader } from "@/lib/pagination";

const chapterSchema = z.object({
  subjectId: z.string().cuid(),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).optional(),
  mastery: z.number().int().min(0).max(100).default(0),
  difficulty: z.enum(["easy", "normal", "hard"]).default("normal"),
});

async function currentUserId() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return null;
  return (await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } }))?.id ?? null;
}

export async function GET(request: Request) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  const subjectId = new URL(request.url).searchParams.get("subjectId");
  const { take, skip } = getPagination(new URL(request.url));
  const [chapters, total] = await Promise.all([
    prisma.chapter.findMany({ where: { userId, ...(subjectId ? { subjectId } : {}) }, include: { subject: true, courses: { select: { id: true, title: true } } }, orderBy: { name: "asc" }, take, skip }),
    prisma.chapter.count({ where: { userId, ...(subjectId ? { subjectId } : {}) } }),
  ]);
  return NextResponse.json(chapters, { headers: totalHeader(total) });
}

export async function POST(request: Request) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  const parsed = chapterSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Données invalides", details: parsed.error.flatten() }, { status: 400 });
  const subject = await prisma.subject.findFirst({ where: { id: parsed.data.subjectId, userId }, select: { id: true } });
  if (!subject) return NextResponse.json({ error: "Matière introuvable" }, { status: 404 });
  const chapter = await prisma.chapter.create({ data: { ...parsed.data, userId } });
  return NextResponse.json(chapter, { status: 201 });
}