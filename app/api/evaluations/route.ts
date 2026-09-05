import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createRevisionPlan } from "@/services/revision-planner";
import { enqueueJob } from "@/services/automation";
import { getPagination, totalHeader } from "@/lib/pagination";

const evaluationSchema = z.object({
  title: z.string().trim().min(1).max(120), subjectId: z.string().cuid(), date: z.coerce.date(),
  description: z.string().max(2000).optional(), importance: z.enum(["low", "normal", "high", "critical"]).default("normal"),
  difficulty: z.enum(["easy", "normal", "hard"]).default("normal"), chapterIds: z.array(z.string().cuid()).default([]),
});

async function currentUser() {
  const session = await getServerSession(authOptions);
  return session?.user?.email ? prisma.user.findUnique({ where: { email: session.user.email } }) : null;
}

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  const parsed = evaluationSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Données invalides", details: parsed.error.flatten() }, { status: 400 });
  const { chapterIds, ...data } = parsed.data;
  const subject = await prisma.subject.findFirst({ where: { id: data.subjectId, userId: user.id }, select: { id: true } });
  if (!subject) return NextResponse.json({ error: "Matière introuvable" }, { status: 404 });
  const chapters = await prisma.chapter.findMany({ where: { id: { in: chapterIds }, userId: user.id, subjectId: data.subjectId }, select: { id: true, mastery: true } });
  if (chapters.length !== chapterIds.length) return NextResponse.json({ error: "Un ou plusieurs chapitres sont invalides" }, { status: 400 });
  const evaluation = await prisma.evaluation.create({ data: { ...data, userId: user.id, chapters: { connect: chapters.map(({ id }) => ({ id })) } } });
  const [schedules, events] = await Promise.all([
    prisma.schedule.findMany({ where: { userId: user.id }, select: { dayOfWeek: true, startTime: true, endTime: true } }),
    prisma.event.findMany({ where: { userId: user.id, start: { gte: new Date() }, end: { lte: data.date } }, select: { start: true, end: true } }),
  ]);
  const busyIntervals = [
    ...Array.from({ length: Math.max(0, Math.ceil((data.date.getTime() - new Date().getTime()) / 86_400_000)) }, (_, index) => {
      const date = new Date(); date.setDate(date.getDate() + index + 1); return schedules.filter((schedule) => schedule.dayOfWeek === date.getDay()).map((schedule) => ({ date, startTime: schedule.startTime, endTime: schedule.endTime }));
    }).flat(),
    ...events.map((event) => ({ date: event.start, startTime: event.start.toTimeString().slice(0, 5), endTime: event.end.toTimeString().slice(0, 5) })),
  ];
  const plan = createRevisionPlan({ examDate: data.date, difficulty: data.difficulty, importance: data.importance, chapterCount: chapters.length, mastery: chapters.map(({ mastery }) => mastery), busyIntervals });
  await prisma.revisionSession.createMany({ data: plan.map((session) => ({ userId: user.id, subjectId: data.subjectId, evaluationId: evaluation.id, title: `${data.title} · ${session.type}`, date: session.date, startTime: session.startTime, duration: session.duration, type: session.type, priority: data.importance })) });
  await Promise.all(chapters.map((chapter) => enqueueJob(user.id, "update_mastery", { chapterId: chapter.id }, `evaluation:${evaluation.id}:mastery:${chapter.id}`)));
  return NextResponse.json({ evaluation, revisionSessionsCreated: plan.length }, { status: 201 });
}

export async function GET(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  const { take, skip } = getPagination(new URL(request.url));
  const [evaluations, total] = await Promise.all([
    prisma.evaluation.findMany({ where: { userId: user.id }, include: { subject: true, chapters: true, revisions: true }, orderBy: { date: "asc" }, take, skip }),
    prisma.evaluation.count({ where: { userId: user.id } }),
  ]);
  return NextResponse.json(evaluations, { headers: totalHeader(total) });
}
