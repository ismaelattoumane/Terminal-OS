import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAIProvider } from "@/services/ai";
import { getPagination, totalHeader } from "@/lib/pagination";

const createSchema = z.object({ chapterId: z.string().cuid(), courseId: z.string().cuid().optional(), question: z.string().min(1).max(500).optional(), answer: z.string().min(1).max(2000).optional(), count: z.number().int().min(1).max(30).default(5) });
export async function GET(request: Request) { const session = await getServerSession(authOptions); if (!session?.user?.email) return NextResponse.json({ error: "Authentification requise" }, { status: 401 }); const user = await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } }); if (!user) return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 401 }); const url = new URL(request.url); const chapterId = url.searchParams.get("chapterId"); const { take, skip } = getPagination(url); const upcomingOnly = url.searchParams.get("scope") !== "all"; const dueFilter = upcomingOnly ? { nextReview: { lte: new Date() } } : {}; const where = { userId: user.id, ...(chapterId ? { chapterId } : {}), ...dueFilter }; const [cards, total] = await Promise.all([prisma.flashcard.findMany({ where, orderBy: { nextReview: "asc" }, take, skip }), prisma.flashcard.count({ where })]); return NextResponse.json(cards, { headers: totalHeader(total) }); }
export async function POST(request: Request) {
  const session = await getServerSession(authOptions); if (!session?.user?.email) return NextResponse.json({ error: "Authentification requise" }, { status: 401 }); const user = await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } }); if (!user) return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 401 });
  const parsed = createSchema.safeParse(await request.json()); if (!parsed.success) return NextResponse.json({ error: "Données invalides", details: parsed.error.flatten() }, { status: 400 });
  const chapter = await prisma.chapter.findFirst({ where: { id: parsed.data.chapterId, userId: user.id }, select: { id: true, subjectId: true } });
  if (!chapter) return NextResponse.json({ error: "Chapitre introuvable" }, { status: 404 });
  if (parsed.data.question && parsed.data.answer) return NextResponse.json(await prisma.flashcard.create({ data: { userId: user.id, chapterId: chapter.id, subjectId: chapter.subjectId, question: parsed.data.question, answer: parsed.data.answer } }), { status: 201 });
  if (!parsed.data.courseId) return NextResponse.json({ error: "courseId requis pour une génération" }, { status: 400 });
  const course = await prisma.course.findFirst({ where: { id: parsed.data.courseId, userId: user.id, chapterId: chapter.id }, select: { content: true } }); if (!course) return NextResponse.json({ error: "Cours introuvable pour ce chapitre" }, { status: 404 });
  const generated = await getAIProvider().generateFlashcards(course.content ?? "", parsed.data.count); const cards = await prisma.$transaction(generated.map((card) => prisma.flashcard.create({ data: { userId: user.id, chapterId: chapter.id, subjectId: chapter.subjectId, question: card.question, answer: card.answer } }))); return NextResponse.json(cards, { status: 201 });
}
