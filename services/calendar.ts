import { prisma } from "@/lib/prisma";
import { calendarTimeZone, datePartsInZone, zonedTimeToUtc } from "@/lib/timezone";

type GoogleEvent = { id?: string; summary: string; description: string; start: { dateTime: string; timeZone: string }; end: { dateTime: string; timeZone: string } };

export async function importGoogleCalendarEvents(accessToken: string, userId: string, timeMin?: Date, timeMax?: Date) {
  const timeZone = calendarTimeZone();
  const params = new URLSearchParams({ singleEvents: "true", showDeleted: "false", maxResults: "2500" });
  if (timeMin) params.set("timeMin", timeMin.toISOString());
  if (timeMax) params.set("timeMax", timeMax.toISOString());
  const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!response.ok) throw new Error(`Google Calendar a répondu ${response.status}`);
  const data = await response.json() as { items?: Array<{ id: string; summary?: string; description?: string; start?: { dateTime?: string; date?: string }; end?: { dateTime?: string; date?: string } }> };
  let imported = 0;
  const seenExternalIds: string[] = [];
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
    seenExternalIds.push(item.id);
    await prisma.event.upsert({ where: { userId_source_externalId: { userId, source: "google", externalId: item.id } }, update: { title: item.summary ?? "Événement Google", start: new Date(start), end: new Date(end) }, create: { userId, title: item.summary ?? "Événement Google", start: new Date(start), end: new Date(end), type: "personal", source: "google", externalId: item.id } });
    imported += 1;
  }
  // Nettoyage : un événement supprimé côté Google (ou déplacé hors de la fenêtre)
  // ne doit plus exister localement, sinon il « réapparaît » à la sync suivante.
  if (timeMin && seenExternalIds.length) {
    await prisma.event.deleteMany({ where: { userId, source: "google", externalId: { notIn: seenExternalIds }, start: { gte: timeMin } } });
  }
  return imported;
}

export async function syncRevisionToGoogleCalendar(accessToken: string, revisionId: string, userId: string) {
  const revision = await prisma.revisionSession.findFirst({ where: { id: revisionId, userId }, include: { subject: true, chapter: true, evaluation: true } });
  if (!revision) throw new Error("Révision introuvable");
  const timeZone = calendarTimeZone();
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
export async function deleteGoogleEvents(accessToken: string | null | undefined, calendarEventIds: Array<string | null>): Promise<number> {
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
/**
 * Retourne un jeton d'accès Google valide pour un utilisateur, en le
 * rafraîchissant via le refresh token persisté si nécessaire. C'est ce qui
 * permet au worker/cron de synchroniser Google Calendar sans session
 * navigateur active (PC éteint), et évite les appels avec un token expiré.
 */
export async function getGoogleAccessToken(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { googleAccessToken: true, googleRefreshToken: true, googleAccessTokenExpiresAt: true } });
  if (!user?.googleAccessToken) return null;
  if (user.googleAccessTokenExpiresAt && Date.now() < user.googleAccessTokenExpiresAt.getTime() - 60_000) return user.googleAccessToken;
  if (!user.googleRefreshToken) return null;
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID ?? "", client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "", grant_type: "refresh_token", refresh_token: user.googleRefreshToken }),
  });
  if (!response.ok) return null;
  const refreshed = await response.json() as { access_token: string; expires_in?: number; refresh_token?: string };
  await prisma.user.update({ where: { id: userId }, data: { googleAccessToken: refreshed.access_token, googleAccessTokenExpiresAt: new Date(Date.now() + (refreshed.expires_in ?? 3600) * 1000), ...(refreshed.refresh_token ? { googleRefreshToken: refreshed.refresh_token } : {}) } });
  return refreshed.access_token;
}

/**
 * Synchronise une liste de révisions vers Google Calendar (POST si aucun
 * événement n'existe, PATCH sinon). Sert à la sync immédiate après création
 * d'évaluation, au déplacement d'une session et après régénération de plan.
 */
export async function syncRevisionsToGoogle(accessToken: string, userId: string, revisionIds: Array<string | null>): Promise<number> {
  let synced = 0;
  for (const revisionId of revisionIds) {
    if (!revisionId) continue;
    try {
      await syncRevisionToGoogleCalendar(accessToken, revisionId, userId);
      synced += 1;
    } catch {
      // Best effort : la sync globale (bouton ou job) repassera plus tard.
    }
  }
  return synced;
}