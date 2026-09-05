import { prisma } from "@/lib/prisma";

export async function recalculateChapterMastery(userId: string, chapterId: string) {
  const [chapter, revisions, attempts, flashcards] = await Promise.all([
    prisma.chapter.findFirst({ where: { id: chapterId, userId }, select: { id: true } }),
    prisma.revisionSession.findMany({ where: { chapterId, userId }, select: { status: true } }),
    prisma.quizAttempt.findMany({ where: { chapterId, userId }, select: { score: true } }),
    prisma.flashcard.findMany({ where: { chapterId, userId }, select: { repetitions: true, easeFactor: true } }),
  ]);
  if (!chapter) throw new Error("Chapitre introuvable");
  const revisionScore = revisions.length ? revisions.filter((item) => item.status === "completed").length / revisions.length : null;
  const quizScore = attempts.length ? attempts.reduce((sum, item) => sum + item.score, 0) / attempts.length : null;
  const flashcardScore = flashcards.length ? flashcards.reduce((sum, item) => sum + Math.min(1, item.repetitions / 5) * Math.min(1, item.easeFactor / 2.5), 0) / flashcards.length : null;
  const values = [revisionScore, quizScore, flashcardScore].filter((value): value is number => value !== null);
  const mastery = values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length * 100) : 0;
  await prisma.chapter.update({ where: { id: chapterId }, data: { mastery } });
  return mastery;
}
