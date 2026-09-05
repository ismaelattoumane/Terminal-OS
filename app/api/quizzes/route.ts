import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAIProvider } from "@/services/ai";

const schema = z.object({ chapterId: z.string().cuid(), courseId: z.string().cuid().optional(), count: z.number().int().min(1).max(20).default(5) });
export async function GET() { const session = await getServerSession(authOptions); if (!session?.user?.email) return NextResponse.json({ error: "Authentification requise" }, { status: 401 }); const user = await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } }); if (!user) return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 401 }); return NextResponse.json(await prisma.quizAttempt.findMany({ where: { userId: user.id }, orderBy: { date: "desc" }, take: 50 })); }
export async function POST(request: Request) {
  const session = await getServerSession(authOptions); if (!session?.user?.email) return NextResponse.json({ error: "Authentification requise" }, { status: 401 }); const user = await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } }); if (!user) return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 401 });
  const parsed = schema.safeParse(await request.json()); if (!parsed.success) return NextResponse.json({ error: "Données invalides", details: parsed.error.flatten() }, { status: 400 }); if (!parsed.data.courseId) return NextResponse.json({ error: "courseId requis" }, { status: 400 });
  const course = await prisma.course.findFirst({ where: { id: parsed.data.courseId, userId: user.id, chapterId: parsed.data.chapterId }, select: { content: true } }); if (!course) return NextResponse.json({ error: "Cours introuvable" }, { status: 404 });
  return NextResponse.json({ chapterId: parsed.data.chapterId, questions: await getAIProvider().generateQuiz(course.content ?? "", parsed.data.count) });
}