export type BusyInterval = { date: Date; startTime: string; endTime: string };
export type RevisionPlanInput = { examDate: Date; today?: Date; difficulty: "easy" | "normal" | "hard"; importance: "low" | "normal" | "high" | "critical"; chapterCount: number; mastery: number[]; existingLoad?: Record<string, number>; availableDays?: number[]; busyIntervals?: BusyInterval[] };
export type RevisionPlanSession = { type: "learning" | "memorization" | "practice" | "final_review"; date: Date; startTime: string; duration: number };
const stages: Array<RevisionPlanSession["type"]> = ["learning", "memorization", "practice", "final_review"];
export function createRevisionPlan(input: RevisionPlanInput): RevisionPlanSession[] {
  const today = startOfDay(input.today ?? new Date()); const examDate = startOfDay(input.examDate);
  const daysAvailable = Math.max(0, Math.floor((examDate.getTime() - today.getTime()) / 86_400_000)); if (daysAvailable < 1) return [];
  const desired = Math.min(stages.length, Math.max(2, Math.ceil(daysAvailable / 3)));
  const baseDuration = input.difficulty === "hard" || input.importance === "critical" ? 40 : input.difficulty === "easy" ? 25 : 30;
  const averageMastery = input.mastery.length ? input.mastery.reduce((sum, value) => sum + value, 0) / input.mastery.length : 50; const duration = Math.min(60, baseDuration + (averageMastery < 50 ? 10 : 0));
  const candidateDays = Array.from({ length: daysAvailable }, (_, index) => index + 1).filter((offset) => {
    const date = addDays(today, offset);
    return !input.availableDays || input.availableDays.includes(date.getDay());
  });
  const selectedDays = candidateDays.filter((offset) => (input.existingLoad?.[dateKey(addDays(today, offset))] ?? 0) < 120);
  const usableDays = selectedDays.length >= desired ? selectedDays : candidateDays;
  return stages.slice(0, Math.min(desired, usableDays.length)).map((type, index) => {
    const date = addDays(today, usableDays[Math.floor((index + 1) * usableDays.length / (desired + 1)) - 1] ?? usableDays[usableDays.length - 1]);
    const sessionDuration = type === "practice" ? duration + 10 : duration;
    return { type, date, startTime: findFreeStartTime(date, sessionDuration, input.busyIntervals ?? []), duration: sessionDuration };
  });
}
function startOfDay(date: Date) { return new Date(date.getFullYear(), date.getMonth(), date.getDate()); }
function addDays(date: Date, days: number) { const result = new Date(date); result.setDate(result.getDate() + days); return result; }
function dateKey(date: Date) { return date.toISOString().slice(0, 10); }
function findFreeStartTime(date: Date, duration: number, busyIntervals: BusyInterval[]) {
  const busy = busyIntervals.filter((interval) => dateKey(interval.date) === dateKey(date)).map((interval) => [toMinutes(interval.startTime), toMinutes(interval.endTime)] as const);
  for (let start = 17 * 60; start <= 21 * 60 - duration; start += 30) if (!busy.some(([from, to]) => start < to && start + duration > from)) return `${String(Math.floor(start / 60)).padStart(2, "0")}:${String(start % 60).padStart(2, "0")}`;
  return "21:00";
}
function toMinutes(value: string) { const [hours, minutes] = value.split(":").map(Number); return hours * 60 + minutes; }