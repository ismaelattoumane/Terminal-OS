import { prisma } from "@/lib/prisma";

type GoogleEvent = { id?: string; summary: string; description: string; start: { dateTime: string; timeZone: string }; end: { dateTime: string; timeZone: string } };

export async function syncRevisionToGoogleCalendar(accessToken: string, revisionId: string, userId: string) {
  const revision = await prisma.revisionSession.findFirst({ where: { id: revisionId, userId }, include: { subject: true, chapter: true, evaluation: true } });
  if (!revision) throw new Error("Révision introuvable");
  const timeZone = process.env.CALENDAR_TIMEZONE ?? "Europe/Paris";
  const start = new Date(revision.date); const [hours, minutes] = (revision.startTime ?? "18:00").split(":").map(Number); start.setHours(hours, minutes, 0, 0);
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