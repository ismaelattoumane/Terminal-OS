import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPagination, totalHeader } from "@/lib/pagination";

const revisionSchema = z.object({
  subjectId: z.string().cuid(),
  chapterId: z.string().cuid().optional(),
  title: z.string().trim().min(1).max(120),
  date: z.coerce.date(),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  duration: z.number().int().min(5).max(180).default(30),
  type: z.enum(["learning", "memorization", "practice", "flashcards", "quiz", "final_review"]).default("learning"),
  priority: z.enum(["low", "normal", "high", "critical"]).default("normal"),
});

async function userId() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return null;
  return (await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } }))?.id ?? null;
}

export async function GET(request: Request) {
  const id = await userId();
  if (!id) return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  const url = new URL(request.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const where = { userId: id, ...(from || to ? { date: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } } : {}) };
  const { take, skip } = getPagination(url);
  const [revisions, total] = await Promise.all([
    prisma.revisionSession.findMany({ where, include: { subject: true, chapter: true }, orderBy: [{ date: "asc" }, { startTime: "asc" }], take, skip }),
    prisma.revisionSession.count({ where }),
  ]);
  return NextResponse.json(revisions, { headers: totalHeader(total) });
}

export async function POST(request: Request) {
  const id = await userId();
  if (!id) return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  const parsed = revisionSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Données invalides", details: parsed.error.flatten() }, { status: 400 });
  const { chapterId, subjectId } = parsed.data;
  const subject = await prisma.subject.findFirst({ where: { id: subjectId, userId: id } });
  if (!subject) return NextResponse.json({ error: "Matière introuvable" }, { status: 404 });
  if (chapterId && !(await prisma.chapter.findFirst({ where: { id: chapterId, subjectId, userId: id } }))) return NextResponse.json({ error: "Chapitre introuvable" }, { status: 404 });
  const revision = await prisma.revisionSession.create({ data: { ...parsed.data, userId: id } });
  return NextResponse.json(revision, { status: 201 });
}