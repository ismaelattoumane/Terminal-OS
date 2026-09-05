import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAIProvider } from "@/services/ai";

const createSchema = z.object({ chapterId: z.string().cuid(), courseId: z.string().cuid().optional(), question: z.string().min(1).max(500).optional(), answer: z.string().min(1).max(2000).optional(), count: z.number().int().min(1).max(30).default(5) });
export async function GET(request: Request) { const session = await getServerSession(authOptions); if (!session?.user?.email) return NextResponse.json({ error: "Authentification requise" }, { status: 401 }); const user = await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } }); if (!user) return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 401 }); const chapterId = new URL(request.url).searchParams.get("chapterId"); return NextResponse.json(await prisma.flashcard.findMany({ where: { userId: user.id, ...(chapterId ? { chapterId } : {}), nextReview: { lte: new Date() } }, orderBy: { nextReview: "asc" } })); }
export async function POST(request: Request) {
  const session = await getServerSession(authOptions); if (!session?.user?.email) return NextResponse.json({ error: "Authentification requise" }, { status: 401 }); const user = await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } }); if (!user) return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 401 });
  const parsed = createSchema.safeParse(await request.json()); if (!parsed.success) return NextResponse.json({ error: "Données invalides", details: parsed.error.flatten() }, { status: 400 });
  if (parsed.data.question && parsed.data.answer) return NextResponse.json(await prisma.flashcard.create({ data: { userId: user.id, chapterId: parsed.data.chapterId, question: parsed.data.question, answer: parsed.data.answer } }), { status: 201 });
  if (!parsed.data.courseId) return NextResponse.json({ error: "courseId requis pour une génération" }, { status: 400 });
  const course = await prisma.course.findFirst({ where: { id: parsed.data.courseId, userId: user.id }, select: { content: true } }); if (!course) return NextResponse.json({ error: "Cours introuvable" }, { status: 404 });
  const generated = await getAIProvider().generateFlashcards(course.content ?? "", parsed.data.count); const cards = await prisma.$transaction(generated.map((card) => prisma.flashcard.create({ data: { userId: user.id, chapterId: parsed.data.chapterId, question: card.question, answer: card.answer } }))); return NextResponse.json(cards, { status: 201 });
}