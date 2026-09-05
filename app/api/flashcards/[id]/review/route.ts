import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { scheduleFlashcard } from "@/services/spaced-repetition";
import { recalculateChapterMastery } from "@/services/mastery";
import { auditLog } from "@/lib/audit";
const schema = z.object({ quality: z.union([z.literal(1), z.literal(2), z.literal(3)]) });
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) { const session = await getServerSession(authOptions); if (!session?.user?.email) return NextResponse.json({ error: "Authentification requise" }, { status: 401 }); const user = await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } }); if (!user) return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 401 }); const parsed = schema.safeParse(await request.json()); if (!parsed.success) return NextResponse.json({ error: "Qualité invalide" }, { status: 400 }); const { id } = await context.params; const card = await prisma.flashcard.findFirst({ where: { id, userId: user.id } }); if (!card) return NextResponse.json({ error: "Flashcard introuvable" }, { status: 404 }); const update = scheduleFlashcard({ difficulty: card.difficulty, interval: card.interval, easeFactor: card.easeFactor, repetitions: card.repetitions }, parsed.data.quality); const updated = await prisma.flashcard.update({ where: { id }, data: update }); const mastery = await recalculateChapterMastery(user.id, card.chapterId); await auditLog(user.id, "flashcard.review", { flashcardId: id, quality: parsed.data.quality, chapterId: card.chapterId }); return NextResponse.json({ ...updated, mastery }); }