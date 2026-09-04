import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const courseSchema = z.object({
  subjectId: z.string().cuid(),
  chapterId: z.string().cuid().optional(),
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000).optional(),
  content: z.string().max(100000).optional(),
  sourceType: z.enum(["text", "pdf", "image", "document", "note"]).default("text"),
  fileUrl: z.string().url().max(2048).optional(),
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
  const chapterId = new URL(request.url).searchParams.get("chapterId");
  const courses = await prisma.course.findMany({ where: { userId, ...(chapterId ? { chapterId } : {}) }, include: { subject: true, chapter: true }, orderBy: { updatedAt: "desc" } });
  return NextResponse.json(courses);
}

export async function POST(request: Request) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  const parsed = courseSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Données invalides", details: parsed.error.flatten() }, { status: 400 });
  const { subjectId, chapterId } = parsed.data;
  const subject = await prisma.subject.findFirst({ where: { id: subjectId, userId }, select: { id: true } });
  if (!subject) return NextResponse.json({ error: "Matière introuvable" }, { status: 404 });
  if (chapterId && !(await prisma.chapter.findFirst({ where: { id: chapterId, subjectId, userId }, select: { id: true } }))) return NextResponse.json({ error: "Chapitre introuvable ou lié à une autre matière" }, { status: 400 });
  const course = await prisma.course.create({ data: { ...parsed.data, userId } });
  return NextResponse.json(course, { status: 201 });
}