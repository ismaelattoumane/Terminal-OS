/**
 * Helpers de manipulation d'heures et de dates dans un fuseau donné
 * (CALENDAR_TIMEZONE, défaut Europe/Paris) sans dépendre du fuseau du serveur
 * (souvent UTC en cloud). Utilisés par le planner de révisions, la
 * synchronisation Google Calendar et l'import des événements — une seule
 * implémentation pour éviter les dérives de fuseau entre les couches.
 */

export function calendarTimeZone(): string {
  return process.env.CALENDAR_TIMEZONE ?? "Europe/Paris";
}

export function datePartsInZone(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-GB", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
  const parts = formatter.formatToParts(date);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute"), second: get("second") };
}

function offsetMs(date: Date, timeZone: string): number {
  const { year, month, day, hour, minute, second } = datePartsInZone(date, timeZone);
  const asUTC = Date.UTC(year, month - 1, day, hour, minute, second);
  return asUTC - date.getTime();
}

/** Convertit une heure « murale » (année, mois, jour, heure, minute) d'un fuseau
 * vers l'instant UTC correspondant. Deux passages corrigent l'heure d'été au
 * bord d'une transition. */
export function zonedTimeToUtc(year: number, month: number, day: number, hour: number, minute: number, timeZone: string): Date {
  let guess = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const offset = offsetMs(guess, timeZone);
  guess = new Date(guess.getTime() - offset);
  if (offsetMs(guess, timeZone) !== offset) guess = new Date(guess.getTime() - (offsetMs(guess, timeZone) - offset));
  return guess;
}

/** Instant UTC du début du jour « mural » (00:00) d'un instant donné, dans un fuseau. */
export function zonedStartOfDay(date: Date, timeZone: string): Date {
  const { year, month, day } = datePartsInZone(date, timeZone);
  return zonedTimeToUtc(year, month, day, 0, 0, timeZone);
}

/** Clé « YYYY-MM-DD » du jour mural auquel appartient l'instant, dans un fuseau. */
export function zonedDayKey(date: Date, timeZone: string): string {
  const { year, month, day } = datePartsInZone(date, timeZone);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Heure « HH:MM » murale d'un instant, dans un fuseau. */
export function zonedTimeOfDay(date: Date, timeZone: string): string {
  const { hour, minute } = datePartsInZone(date, timeZone);
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/** Jour de la semaine au sens JS (0 = dimanche … 6 = samedi) du jour mural,
 * dans un fuseau — utile pour comparer avec l'emploi du temps. */
export function zonedDayOfWeek(date: Date, timeZone: string): number {
  const formatter = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" });
  const weekday = formatter.format(date);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekday);
}

/** Convertit un `dayOfWeek` de l'emploi du temps (Lundi = 0 … Dimanche = 6,
 * index du tableau « days » de l'UI) en jour JS (0 = dimanche … 6 = samedi). */
export function scheduleDayToJs(dayOfWeek: number): number {
  return (dayOfWeek + 1) % 7;
}