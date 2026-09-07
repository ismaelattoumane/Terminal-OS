import { calendarTimeZone, zonedDayKey, zonedDayOfWeek, zonedStartOfDay } from "@/lib/timezone";

export type BusyInterval = { date: Date; startTime: string; endTime: string };
export type RevisionPlanInput = { examDate: Date; today?: Date; difficulty: "easy" | "normal" | "hard"; importance: "low" | "normal" | "high" | "critical"; chapterCount: number; mastery: number[]; existingLoad?: Record<string, number>; availableDays?: number[]; busyIntervals?: BusyInterval[] };
export type RevisionPlanSession = { type: "learning" | "memorization" | "practice" | "final_review"; date: Date; startTime: string; duration: number };
const stages: Array<RevisionPlanSession["type"]> = ["learning", "memorization", "practice", "final_review"];

/**
 * Planifie les sessions de révision d'une évaluation.
 * Dates, jours et disponibilités sont raisonnés dans CALENDAR_TIMEZONE (le
 * fuseau « mural » de l'utilisateur), pas celui du serveur : `today` et
 * `examDate` sont ramenés au début du jour mural, l'occupation est comparée
 * heure par heure dans ce même fuseau, et le jour de la semaine est calculé
 * dans ce fuseau (les créneaux de cours étant saisis en heure locale).
 */
export function createRevisionPlan(input: RevisionPlanInput): RevisionPlanSession[] {
  const timeZone = calendarTimeZone();
  const today = zonedStartOfDay(input.today ?? new Date(), timeZone);
  const examDate = zonedStartOfDay(input.examDate, timeZone);
  const daysAvailable = Math.max(0, Math.round((examDate.getTime() - today.getTime()) / 86_400_000));
  if (daysAvailable < 1) return [];
  const desired = Math.min(stages.length, Math.max(2, Math.ceil(daysAvailable / 3)));
  const baseDuration = input.difficulty === "hard" || input.importance === "critical" ? 40 : input.difficulty === "easy" ? 25 : 30;
  const averageMastery = input.mastery.length ? input.mastery.reduce((sum, value) => sum + value, 0) / input.mastery.length : 50;
  const duration = Math.min(60, baseDuration + (averageMastery < 50 ? 10 : 0));
  const candidateDays = Array.from({ length: daysAvailable }, (_, index) => index + 1).filter((offset) => {
    const date = addDays(today, offset);
    return !input.availableDays || input.availableDays.includes(zonedDayOfWeek(date, timeZone));
  });
  const selectedDays = candidateDays.filter((offset) => (input.existingLoad?.[zonedDayKey(addDays(today, offset), timeZone)] ?? 0) < 120);
  const usableDays = selectedDays.length >= desired ? selectedDays : candidateDays;
  const sessions: RevisionPlanSession[] = [];
  const staged = stages.slice(0, Math.min(desired, usableDays.length));
  for (let index = 0; index < staged.length; index += 1) {
    const type = staged[index];
    const date = addDays(today, usableDays[Math.floor((index + 1) * usableDays.length / (desired + 1)) - 1] ?? usableDays[usableDays.length - 1]);
    const sessionDuration = type === "practice" ? duration + 10 : duration;
    const startTime = findFreeStartTime(date, sessionDuration, input.busyIntervals ?? [], timeZone);
    if (!startTime) continue;
    sessions.push({ type, date, startTime, duration: sessionDuration });
  }
  return sessions;
}
function addDays(date: Date, days: number) { const result = new Date(date); result.setDate(result.getDate() + days); return result; }

/**
 * Cherche le premier créneau libre de `duration` minutes sur le jour `date`,
 * entre 17 h et 21 h (période d'étude du soir), puis entre 8 h et 17 h.
 * Renvoie "HH:MM" ou null si la journée est saturée — le planning préfère alors
 * une autre journée plutôt que de créer un conflit.
 */
function findFreeStartTime(date: Date, duration: number, busyIntervals: BusyInterval[], timeZone: string): string | null {
  const dayKey = zonedDayKey(date, timeZone);
  const busy = busyIntervals.filter((interval) => zonedDayKey(interval.date, timeZone) === dayKey).map((interval) => [toMinutes(interval.startTime), toMinutes(interval.endTime)] as const);
  for (const [from, to] of [[17 * 60, 21 * 60], [8 * 60, 17 * 60]] as const) {
    for (let start = from; start <= to - duration; start += 30) {
      if (!busy.some(([busyFrom, busyTo]) => start < busyTo && start + duration > busyFrom)) return toHHMM(start);
    }
  }
  return null;
}
function toHHMM(minutes: number) { return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`; }
function toMinutes(value: string) { const [hours, minutes] = value.split(":").map(Number); return hours * 60 + minutes; }