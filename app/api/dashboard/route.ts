import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { weightedAverageOn20 } from "@/services/grades";

function dayStart(value: Date) { return new Date(value.getFullYear(), value.getMonth(), value.getDate()); }
function addDays(value: Date, days: number) { const result = new Date(value); result.setDate(result.getDate() + days); return result; }

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  const user = await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } });
  if (!user) return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 401 });

  const today = dayStart(new Date());
  const tomorrow = addDays(today, 1);
  const weekEnd = addDays(today, 7);
  const [todayRevisions, weekRevisions, dueHomework, upcomingEvaluations, chapters, grades, subjects] = await Promise.all([
    prisma.revisionSession.findMany({ where: { userId: user.id, date: { gte: today, lt: tomorrow } }, include: { subject: true, chapter: true }, orderBy: { startTime: "asc" } }),
    prisma.revisionSession.findMany({ where: { userId: user.id, date: { gte: today, lt: weekEnd } }, select: { duration: true, status: true } }),
    prisma.homework.findMany({ where: { userId: user.id, status: { not: "completed" }, dueDate: { lt: weekEnd } }, include: { subject: true }, orderBy: { dueDate: "asc" } }),
    prisma.evaluation.findMany({ where: { userId: user.id, status: "planned", date: { gte: today, lt: addDays(today, 30) } }, include: { subject: true, chapters: { select: { mastery: true } } }, orderBy: { date: "asc" } }),
    prisma.chapter.findMany({ where: { userId: user.id }, select: { mastery: true } }),
    prisma.grade.findMany({ where: { userId: user.id }, select: { grade: true, maxGrade: true, coefficient: true } }),
    prisma.subject.findMany({ where: { userId: user.id }, include: { chapters: { select: { name: true, mastery: true } } }, orderBy: { name: "asc" } }),
  ]);
  const plannedMinutes = weekRevisions.filter((revision) => revision.status === "planned").reduce((total, revision) => total + revision.duration, 0);
  const averageMastery = chapters.length ? Math.round(chapters.reduce((total, chapter) => total + chapter.mastery, 0) / chapters.length) : 0;
  // B23 : moyenne pondérée par coefficient via le service partagé (cohérent avec /api/statistics).
  const averageGrade = weightedAverageOn20(grades);
  const workload = plannedMinutes > 240 || dueHomework.length >= 4 ? "critical" : plannedMinutes > 150 || dueHomework.length >= 3 ? "high" : plannedMinutes > 60 || dueHomework.length >= 1 ? "normal" : "low";
  // B26 : suppression de `subjectStats` (champ mort jamais consommé par le front).
  // Les révisions en retard (passées, non terminées/non ignorées) sont comptées
  // pour alimenter le panneau « Rappels » du dashboard.
  const lateRevisions = await prisma.revisionSession.count({ where: { userId: user.id, status: { in: ["planned", "in_progress"] }, date: { lt: today } } });
  const focus = subjects
    .flatMap((subject) => subject.chapters.map((chapter) => ({ name: chapter.name, mastery: chapter.mastery, subject: { name: subject.name, coefficient: subject.coefficient } })))
    .sort((a, b) => a.mastery - b.mastery)[0] ?? null;
  return NextResponse.json({ today: { revisions: todayRevisions, homework: dueHomework, evaluations: upcomingEvaluations.slice(0, 3) }, week: { sessions: weekRevisions.length, plannedMinutes }, progression: { mastery: averageMastery, averageGrade }, workload, subjects, focus, alerts: { overdueHomework: dueHomework.filter((homework) => homework.dueDate < today).length, weakChapters: chapters.filter((chapter) => chapter.mastery < 40).length, lateRevisions } });
}