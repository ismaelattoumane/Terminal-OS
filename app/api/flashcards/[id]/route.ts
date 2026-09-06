import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const updateSchema = z.object({
  question: z.string().trim().min(1).max(500).optional(),
  answer: z.string().trim().min(1).max(2000).optional(),
  chapterId: z.string().cuid().optional(),
}).strict();

async function currentUser() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return null;
  return (await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } }))?.id ?? null;
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const userId = await currentUser();
  if (!userId) return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  const { id } = await context.params;
  const parsed = updateSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Données invalides", details: parsed.error.flatten() }, { status: 400 });
  const existing = await prisma.flashcard.findFirst({ where: { id, userId }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: "Flashcard introuvable" }, { status: 404 });
  if (parsed.data.chapterId && !(await prisma.chapter.findFirst({ where: { id: parsed.data.chapterId, userId }, select: { id: true, subjectId: true } }))) {
    return NextResponse.json({ error: "Chapitre introuvable" }, { status: 404 });
  }
  const card = await prisma.flashcard.update({ where: { id }, data: parsed.data });
  return NextResponse.json(card);
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const userId = await currentUser();
  if (!userId) return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  const { id } = await context.params;
  const existing = await prisma.flashcard.findFirst({ where: { id, userId }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: "Flashcard introuvable" }, { status: 404 });
  await prisma.flashcard.delete({ where: { id } });
  return new NextResponse(null, { status: 204 });
}