import { prisma } from "@/lib/prisma";

type GoogleEvent = { id?: string; summary: string; description: string; start: { dateTime: string; timeZone: string }; end: { dateTime: string; timeZone: string } };

// B32 / B33 : construire des dates dans un fuseau donné (Europe/Paris) sans
// dépendre du fuseau du serveur (souvent UTC en cloud), via Intl.

function datePartsInZone(date: Date, timeZone: string) {
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

function zonedTimeToUtc(year: number, month: number, day: number, hour: number, minute: number, timeZone: string): Date {
  let guess = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const offset = offsetMs(guess, timeZone);
  guess = new Date(guess.getTime() - offset);
  // Deuxième passage pour corriger l'heure d'été au bord d'une transition.
  if (offsetMs(guess, timeZone) !== offset) guess = new Date(guess.getTime() - (offsetMs(guess, timeZone) - offset));
  return guess;
}

export async function importGoogleCalendarEvents(accessToken: string, userId: string, timeMin?: Date, timeMax?: Date) {
  const timeZone = process.env.CALENDAR_TIMEZONE ?? "Europe/Paris";
  const params = new URLSearchParams({ singleEvents: "true", showDeleted: "false", maxResults: "2500" });
  if (timeMin) params.set("timeMin", timeMin.toISOString());
  if (timeMax) params.set("timeMax", timeMax.toISOString());
  const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!response.ok) throw new Error(`Google Calendar a répondu ${response.status}`);
  const data = await response.json() as { items?: Array<{ id: string; summary?: string; description?: string; start?: { dateTime?: string; date?: string }; end?: { dateTime?: string; date?: string } }> };
  let imported = 0;
  for (const item of data.items ?? []) {
    // B33 : les événements « journées entières » (champ `date`) doivent être
    // stockés dans le fuseau CALENDAR_TIMEZONE, pas calés en UTC (ce qui les
    // décalait d'un cran horaire à l'affichage).
    let start: Date | null = null;
    let end: Date | null = null;
    if (item.start?.dateTime) {
      start = new Date(item.start.dateTime);
    } else if (item.start?.date) {
      const [y, m, d] = item.start.date.split("-").map(Number);
      start = zonedTimeToUtc(y, m, d, 0, 0, timeZone);
    }
    if (item.end?.dateTime) {
      end = new Date(item.end.dateTime);
    } else if (item.end?.date) {
      const [y, m, d] = item.end.date.split("-").map(Number);
      end = zonedTimeToUtc(y, m, d, 23, 59, timeZone);
    }
    if (!start || !end) continue;
    await prisma.event.upsert({ where: { userId_source_externalId: { userId, source: "google", externalId: item.id } }, update: { title: item.summary ?? "Événement Google", start: new Date(start), end: new Date(end) }, create: { userId, title: item.summary ?? "Événement Google", start: new Date(start), end: new Date(end), type: "personal", source: "google", externalId: item.id } });
    imported += 1;
  }
  return imported;
}

export async function syncRevisionToGoogleCalendar(accessToken: string, revisionId: string, userId: string) {
  const revision = await prisma.revisionSession.findFirst({ where: { id: revisionId, userId }, include: { subject: true, chapter: true, evaluation: true } });
  if (!revision) throw new Error("Révision introuvable");
  const timeZone = process.env.CALENDAR_TIMEZONE ?? "Europe/Paris";
  // B32 : construire la date dans le fuseau CALENDAR_TIMEZONE (pas le fuseau du
  // serveur) pour que l'événement Google soit à la bonne heure.
  const { year, month, day } = datePartsInZone(revision.date, timeZone);
  const [hours, minutes] = (revision.startTime ?? "18:00").split(":").map(Number);
  const start = zonedTimeToUtc(year, month, day, hours, minutes, timeZone);
  const end = new Date(start.getTime() + revision.duration * 60_000);
  const event: GoogleEvent = { summary: `🧠 Révision ${revision.subject.name} — ${revision.chapter?.name ?? revision.title}`, description: `Type : ${revision.type}\nPriorité : ${revision.priority}\nContrôle : ${revision.evaluation?.title ?? "Révision personnelle"}`, start: { dateTime: start.toISOString(), timeZone }, end: { dateTime: end.toISOString(), timeZone } };
  const response = await fetch(revision.calendarEventId ? `https://www.googleapis.com/calendar/v3/calendars/primary/events/${revision.calendarEventId}` : "https://www.googleapis.com/calendar/v3/calendars/primary/events", { method: revision.calendarEventId ? "PATCH" : "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }, body: JSON.stringify(event) });
  if (!response.ok) throw new Error(`Google Calendar a répondu ${response.status}`);
  const googleEvent = await response.json() as { id: string };
  await prisma.revisionSession.update({ where: { id: revision.id }, data: { calendarEventId: googleEvent.id } });
  return googleEvent.id;
}

export async function deleteRevisionFromGoogleCalendar(accessToken: string, revisionId: string, userId: string) {
  const revision = await prisma.revisionSession.findFirst({ where: { id: revisionId, userId }, select: { calendarEventId: true } });
  if (!revision?.calendarEventId) return false;
  const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${revision.calendarEventId}`, { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } });
  if (!response.ok && response.status !== 404) throw new Error(`Google Calendar a répondu ${response.status}`);
  await prisma.revisionSession.update({ where: { id: revisionId }, data: { calendarEventId: null } });
  return true;
}

/**
 * Supprime côté Google les événements appartenant à une liste d'identifiants
 * d'événements NOUVELLE (nettoyage d'orphelins : sessions régénérées, révisions
 * supprimées, évaluations annulées). Best effort : un échec Google ne fait pas
 * échouer l'opération locale ; l'événement absent (404) est considéré comme
 * déjà supprimé. La modification de l'événement distant suffit à garantir
 * l'idempotence (rien n'est recréé).
 */
export async function deleteGoogleEvents(accessToken: string | undefined, calendarEventIds: Array<string | null>): Promise<number> {
  if (!accessToken) return 0;
  const ids = calendarEventIds.filter((id): id is string => Boolean(id));
  if (!ids.length) return 0;
  let deleted = 0;
  for (const id of ids) {
    try {
      const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(id)}`, { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } });
      if (response.ok || response.status === 404) deleted += 1;
    } catch {
      // Token expiré / réseau : on continue ; la prochaine synchronisation pourra
      // recréer un état cohérent car l'événement local a déjà été retiré.
    }
  }
  return deleted;
}