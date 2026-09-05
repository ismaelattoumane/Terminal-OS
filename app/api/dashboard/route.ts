import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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
    prisma.subject.findMany({ where: { userId: user.id }, include: { chapters: { select: { mastery: true } }, grades: { select: { grade: true, maxGrade: true, coefficient: true } } }, orderBy: { name: "asc" } }),
  ]);
  const plannedMinutes = weekRevisions.filter((revision) => revision.status === "planned").reduce((total, revision) => total + revision.duration, 0);
  const averageMastery = chapters.length ? Math.round(chapters.reduce((total, chapter) => total + chapter.mastery, 0) / chapters.length) : 0;
  const weightedGrades = grades.reduce((result, grade) => result + (grade.grade / grade.maxGrade) * 20 * grade.coefficient, 0);
  const totalCoefficients = grades.reduce((result, grade) => result + grade.coefficient, 0);
  const workload = plannedMinutes > 240 || dueHomework.length >= 4 ? "critical" : plannedMinutes > 150 || dueHomework.length >= 3 ? "high" : plannedMinutes > 60 || dueHomework.length >= 1 ? "normal" : "low";
  const subjectStats = subjects.map((subject) => { const coefficients = subject.grades.reduce((sum, grade) => sum + grade.coefficient, 0); const weighted = subject.grades.reduce((sum, grade) => sum + grade.grade / grade.maxGrade * 20 * grade.coefficient, 0); return { id: subject.id, name: subject.name, mastery: subject.chapters.length ? Math.round(subject.chapters.reduce((sum, chapter) => sum + chapter.mastery, 0) / subject.chapters.length) : 0, averageGrade: coefficients ? Math.round(weighted / coefficients * 100) / 100 : null }; });
  return NextResponse.json({ today: { revisions: todayRevisions, homework: dueHomework, evaluations: upcomingEvaluations.slice(0, 3) }, week: { sessions: weekRevisions.length, plannedMinutes }, progression: { mastery: averageMastery, averageGrade: totalCoefficients ? Math.round((weightedGrades / totalCoefficients) * 100) / 100 : null }, workload, subjects, subjectStats, alerts: { overdueHomework: dueHomework.filter((homework) => homework.dueDate < today).length, weakChapters: chapters.filter((chapter) => chapter.mastery < 40).length } });
}