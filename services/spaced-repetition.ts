export function scheduleFlashcard(current: { difficulty: "easy" | "medium" | "hard"; interval: number; easeFactor: number; repetitions: number }, quality: 1 | 2 | 3) {
  if (quality === 1) return { interval: 1, easeFactor: Math.max(1.3, current.easeFactor - 0.2), repetitions: 0, nextReview: nextDate(1) };
  const interval = current.repetitions === 0 ? 1 : current.repetitions === 1 ? 6 : Math.round(current.interval * (quality === 3 ? current.easeFactor : 1.2));
  return { interval, easeFactor: Math.max(1.3, current.easeFactor + (quality === 3 ? 0.1 : -0.05)), repetitions: current.repetitions + 1, nextReview: nextDate(interval) };
}
function nextDate(days: number) { const date = new Date(); date.setDate(date.getDate() + days); return date; }