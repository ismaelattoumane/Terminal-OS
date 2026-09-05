import { prisma } from "@/lib/prisma";

const WEIGHTS = { revisions: 0.3, quizzes: 0.4, flashcards: 0.3 };
const MAX_RECENCY_DAYS = 30;

function recencyWeight(date: Date) {
  const days = Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 86_400_000));
  return Math.max(0.4, 1 - days / MAX_RECENCY_DAYS);
}

/**
 * Fusionne les signaux de maîtrise d'un chapitre : sessions de révision
 * complétées, auto-évaluations (quiz) récentes et état des flashcards.
 * Chaque source est pondérée ; les tentatives récentes pèsent plus lourd.
 */
export async function recalculateChapterMastery(userId: string, chapterId: string) {
  const [chapter, revisions, attempts, flashcards] = await Promise.all([
    prisma.chapter.findFirst({ where: { id: chapterId, userId }, select: { id: true, subjectId: true } }),
    prisma.revisionSession.findMany({ where: { chapterId, userId }, select: { status: true } }),
    prisma.quizAttempt.findMany({ where: { chapterId, userId }, select: { score: true, date: true } }),
    prisma.flashcard.findMany({ where: { chapterId, userId }, select: { repetitions: true, easeFactor: true, difficulty: true } }),
  ]);
  if (!chapter) throw new Error("Chapitre introuvable");

  const revisionScore = revisions.length ? revisions.filter((item) => item.status === "completed").length / revisions.length : null;

  const weightedQuiz = attempts.length
    ? attempts.reduce((sum, item) => sum + item.score * recencyWeight(item.date), 0) / attempts.reduce((sum, item) => sum + recencyWeight(item.date), 0)
    : null;

  const flashcardScore = flashcards.length
    ? flashcards.reduce((sum, item) => {
        const progress = Math.min(1, item.repetitions / 5);
        const consistency = Math.min(1, item.easeFactor / 2.5);
        const difficultyPenalty = item.difficulty === "hard" ? 0.9 : item.difficulty === "easy" ? 1.05 : 1;
        return sum + Math.min(1, progress * consistency * difficultyPenalty);
      }, 0) / flashcards.length
    : null;

  const signals = [
    revisionScore !== null ? { value: revisionScore, weight: WEIGHTS.revisions } : null,
    weightedQuiz !== null ? { value: weightedQuiz, weight: WEIGHTS.quizzes } : null,
    flashcardScore !== null ? { value: flashcardScore, weight: WEIGHTS.flashcards } : null,
  ].filter((signal): signal is { value: number; weight: number } => signal !== null);

  const mastery = Math.round((signals.length ? signals.reduce((sum, signal) => sum + signal.value * signal.weight, 0) / signals.reduce((sum, signal) => sum + signal.weight, 0) : 0) * 100);

  await prisma.chapter.update({ where: { id: chapterId }, data: { mastery } });
  await recalculateSubjectMastery(userId, chapter.subjectId);
  return mastery;
}

export async function recalculateSubjectMastery(userId: string, subjectId: string) {
  const chapters = await prisma.chapter.findMany({ where: { subjectId, userId }, select: { mastery: true } });
  return chapters.length ? Math.round(chapters.reduce((sum, chapter) => sum + chapter.mastery, 0) / chapters.length) : 0;
}

export async function recalculateAllMastery(userId: string) {
  const chapters = await prisma.chapter.findMany({ where: { userId }, select: { id: true } });
  for (const chapter of chapters) await recalculateChapterMastery(userId, chapter.id);
  return chapters.length;
}
