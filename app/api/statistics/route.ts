import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function startOfDay(value: Date) { return new Date(value.getFullYear(), value.getMonth(), value.getDate()); }
function mondayOf(value: Date) { const day = startOfDay(value); const offset = (day.getDay() + 6) % 7; day.setDate(day.getDate() - offset); return day; }

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  const user = await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } });
  if (!user) return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 401 });

  const [subjects, grades, chapters, revisions, quizAttempts, flashcardCount, sheetCount] = await Promise.all([
    prisma.subject.findMany({ where: { userId: user.id }, include: { chapters: { select: { mastery: true } }, grades: { select: { grade: true, maxGrade: true, coefficient: true, date: true } } }, orderBy: { name: "asc" } }),
    prisma.grade.findMany({ where: { userId: user.id }, include: { subject: { select: { name: true } } }, orderBy: { date: "desc" }, take: 12 }),
    prisma.chapter.findMany({ where: { userId: user.id }, select: { mastery: true } }),
    prisma.revisionSession.findMany({ where: { userId: user.id }, select: { date: true, duration: true, status: true } }),
    prisma.quizAttempt.findMany({ where: { userId: user.id }, include: { chapter: { select: { name: true } }, subject: { select: { name: true } } }, orderBy: { date: "desc" }, take: 15 }),
    prisma.flashcard.count({ where: { userId: user.id } }),
    prisma.studySheet.count({ where: { userId: user.id } }),
  ]);

  const averageGrade = grades.length
    ? Math.round(grades.reduce((sum, grade) => sum + (grade.grade / grade.maxGrade) * 20, 0) / grades.length * 100) / 100
    : null;
  const averageMastery = chapters.length ? Math.round(chapters.reduce((sum, chapter) => sum + chapter.mastery, 0) / chapters.length) : 0;
  const weakChapters = chapters.filter((chapter) => chapter.mastery < 40).length;

  const masteryBySubject = subjects.map((subject) => ({
    id: subject.id,
    name: subject.name,
    color: subject.color,
    mastery: subject.chapters.length ? Math.round(subject.chapters.reduce((sum, chapter) => sum + chapter.mastery, 0) / subject.chapters.length) : 0,
    chapterCount: subject.chapters.length,
    averageGrade: subject.grades.length ? Math.round(subject.grades.reduce((sum, grade) => sum + grade.grade / grade.maxGrade * 20, 0) / subject.grades.length * 100) / 100 : null,
  }));

  const start = mondayOf(new Date());
  start.setDate(start.getDate() - 7 * 7);
  const sessionsPerWeek = Array.from({ length: 8 }, (_, index) => {
    const weekStart = new Date(start); weekStart.setDate(start.getDate() + index * 7);
    const weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 7);
    const weekSessions = revisions.filter((revision) => revision.date >= weekStart && revision.date < weekEnd);
    return { weekStart: weekStart.toISOString().slice(0, 10), count: weekSessions.length, plannedMinutes: weekSessions.reduce((sum, revision) => sum + (revision.status === "planned" ? revision.duration : 0), 0), completedMinutes: weekSessions.reduce((sum, revision) => sum + (revision.status === "completed" ? revision.duration : 0), 0) };
  });

  const workloadBySubject = subjects.map((subject) => ({ id: subject.id, name: subject.name, plannedMinutes: 0, sessionCount: 0 }));

  return NextResponse.json(
    {
      summary: { averageGrade, averageMastery, weakChapters, totalSessions: revisions.length, completedSessions: revisions.filter((revision) => revision.status === "completed").length, quizCount: quizAttempts.length, flashcardCount, sheetCount, gradeCount: grades.length },
      gradesTrend: grades.map((grade) => ({ date: grade.date, subject: grade.subject.name, grade: grade.grade, maxGrade: grade.maxGrade })),
      masteryBySubject,
      quizTrend: quizAttempts.map((attempt) => ({ date: attempt.date, chapter: attempt.chapter.name, subject: attempt.subject?.name ?? null, score: attempt.score })),
      sessionsPerWeek,
      workloadBySubject,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}