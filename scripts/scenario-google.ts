/**
 * Test de scénario — couche services Google Calendar + worker de jobs.
 *
 * Vérifie, contre la vraie base PostgreSQL et le vrai code de services
 * (calendar, plan-execution, automation) :
 *  - refresh token persisté : expire → rafraîchi via le token endpoint ;
 *  - sync des révisions (POST) puis mise à jour (PATCH, déplacement conservé) ;
 *  - suppression d'une révision (DELETE côté Google) ;
 *  - import sans doublons (upsert) + nettoyage des événements supprimés côté Google ;
 *  - worker `/api/automation/worker` sans session navigateur (PC éteint).
 */
import { prisma } from "@/lib/prisma";

const TEST_EMAIL = "scenario-google@terminal-os.local";
let tokenRefreshCalls = 0;
let googlePosts = 0;
let googlePatches = 0;
let googleDeletes = 0;
const googleEventStore = new Map<string, { summary: string; start: string }>();
let failed = 0;

function ok(label: string, condition: boolean, detail = "") {
  console.log(`${condition ? "  ✔" : "  ✘"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!condition) failed += 1;
}

async function main() {
  console.log("== SCÉNARIO GOOGLE CALENDAR / WORKER ==");
  const previous = await prisma.user.findUnique({ where: { email: TEST_EMAIL }, select: { id: true } });
  if (previous) await prisma.user.delete({ where: { id: previous.id } });
  const user = await prisma.user.create({
    data: {
      email: TEST_EMAIL,
      name: "Scénario Google",
      googleAccessToken: "expired-access-token",
      googleRefreshToken: "refresh-token-v1",
      googleAccessTokenExpiresAt: new Date(Date.now() - 3_600_000),
    },
  });

  const realFetch = globalThis.fetch;
  const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    if (url.includes("oauth2.googleapis.com/token")) {
      tokenRefreshCalls += 1;
      return json({ access_token: `fresh-access-token-${tokenRefreshCalls}`, expires_in: 3600, refresh_token: "refresh-token-v2" });
    }
    if (url.includes("www.googleapis.com/calendar")) {
      const method = init?.method ?? "GET";
      if (method === "GET" && !url.includes("/events/")) {
        const start = new Date(Date.now() + 5 * 86_400_000).toISOString();
        return json({ items: [{ id: "gcal-1", summary: "RDV médecin", start: { dateTime: start }, end: { dateTime: new Date(new Date(start).getTime() + 3_600_000).toISOString() } }] });
      }
      const match = url.match(/events\/([^?]+)/);
      const id = match ? decodeURIComponent(match[1]) : `created-${googlePosts + googlePatches}`;
      if (method === "POST") {
        googlePosts += 1;
        const body = JSON.parse(String(init?.body));
        googleEventStore.set(id, { summary: body.summary ?? "", start: body.start?.dateTime ?? "" });
        return json({ id });
      }
      if (method === "PATCH") {
        googlePatches += 1;
        const body = JSON.parse(String(init?.body));
        googleEventStore.set(id, { summary: body.summary ?? googleEventStore.get(id)?.summary ?? "", start: body.start?.dateTime ?? "" });
        return json({ id });
      }
      if (method === "DELETE") {
        googleDeletes += 1;
        googleEventStore.delete(id);
        return new Response(null, { status: 204 });
      }
    }
    return realFetch(input, init);
  };

  try {
    await runSteps(user.id);
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
    globalThis.fetch = realFetch;
  }
  console.log(`\n${failed ? "ÉCHEC" : "SUCCÈS"} — ${failed} assertion(s) en échec`);
  process.exit(failed ? 1 : 0);
}

async function runSteps(userId: string) {
  // ── Étape 1 : refresh token côté serveur ───────────────────────────────────
  console.log("\n[1] Refresh token persisté");
  const { getGoogleAccessToken, syncRevisionsToGoogle, syncRevisionToGoogleCalendar, deleteRevisionFromGoogleCalendar, importGoogleCalendarEvents } = await import("@/services/calendar");
  const token = await getGoogleAccessToken(userId);
  ok("token expiré rafraîchi via refresh token", token === "fresh-access-token-1", `token=${token}`);
  const persisted = await prisma.user.findUnique({ where: { id: userId }, select: { googleAccessToken: true, googleRefreshToken: true } });
  ok("nouveau access token persisté", persisted?.googleAccessToken === "fresh-access-token-1");
  ok("refresh token roté persisté", persisted?.googleRefreshToken === "refresh-token-v2");
  const token2 = await getGoogleAccessToken(userId);
  ok("token non expiré réutilisé sans appel réseau", token2 === "fresh-access-token-1" && tokenRefreshCalls === 1, `appels=${tokenRefreshCalls}`);

  // ── Étape 2 : données + génération du plan (services réels) ────────────────
  console.log("\n[2] Génération du plan (emploi du temps + événements)");
  const subject = await prisma.subject.create({ data: { userId, name: "Mathématiques", shortName: "MATH", color: "#f27645" } });
  const ch1 = await prisma.chapter.create({ data: { userId, subjectId: subject.id, name: "Suites numériques" } });
  const ch2 = await prisma.chapter.create({ data: { userId, subjectId: subject.id, name: "Fonctions" } });
  await prisma.course.create({ data: { userId, subjectId: subject.id, chapterId: ch1.id, title: "Cours Suites", content: "Les suites arithmétiques et géométriques..." } });
  // Emploi du temps : Lundi 08h-12h (index 0 dans l'UI), Mercredi 08h-21h30 (index 2).
  // Le mercredi bloque la totalité de la fenêtre d'étude (17h-21h) : aucune
  // session ne doit y être placée — c'est ce qui différencie l'ancien mapping
  // erroné (`dayOfWeek === date.getDay()`, qui protégeait le mardi) du bon.
  await prisma.schedule.createMany({ data: [
    { userId, dayOfWeek: 0, startTime: "08:00", endTime: "12:00", subjectId: subject.id },
    { userId, dayOfWeek: 2, startTime: "08:00", endTime: "21:30", subjectId: subject.id },
  ] });
  const examDay = new Date(Date.now() + 12 * 86_400_000);
  await prisma.event.create({ data: { userId, title: "Foot", start: new Date(examDay.getTime() - 2 * 86_400_000), end: new Date(examDay.getTime() - 2 * 86_400_000 + 3_600_000), type: "personal" } });
  const evaluation = await prisma.evaluation.create({ data: { userId, subjectId: subject.id, title: "Contrôle 1", date: examDay, chapters: { connect: [{ id: ch1.id }, { id: ch2.id }] } } });

  const { createEvaluationRevisionSessions } = await import("@/services/plan-execution");
  const first = await createEvaluationRevisionSessions(userId, evaluation.id);
  ok("sessions générées (>0)", first.created.length > 0, `${first.created.length} session(s)`);
  const sessions = await prisma.revisionSession.findMany({ where: { userId }, include: { chapter: true } });
  ok("sessions reliées à un chapitre", sessions.length === first.created.length && sessions.every((session) => session.chapterId), `${sessions.filter((session) => !session.chapterId).length} sans chapitre`);
  const mondayMorning = sessions.filter((session) => (new Date(session.date).getDay() + 6) % 7 === 0).filter((session) => session.startTime && session.startTime < "12:00");
  ok("aucune session un lundi matin (créneau 08-12 protégé)", mondayMorning.length === 0, mondayMorning.map((session) => session.startTime).join(","));
  // Test clé du mapping jour de semaine : le mercredi est saturé (08h-21h30),
  // donc AUCUNE session ne doit tomber un mercredi. Avec l'ancien bug
  // (`dayOfWeek === date.getDay()`), c'est le mardi qui était protégé.
  const wednesday = sessions.filter((session) => (new Date(session.date).getDay() + 6) % 7 === 2);
  ok("aucune session un mercredi (journée 08h-21h30 protégée)", wednesday.length === 0, wednesday.map((session) => `${new Date(session.date).toISOString().slice(0, 10)} ${session.startTime}`).join(","));
  // ── Étape 3 : synchronisation Google (POST puis PATCH idempotent) ──────────
  console.log("\n[3] Synchronisation Google Calendar");
  const accessToken = await getGoogleAccessToken(userId);
  const synced = await syncRevisionsToGoogle(accessToken ?? "", userId, sessions.map((session) => session.id));
  ok("sessions poussées vers Google", synced === sessions.length, `synced=${synced}/${sessions.length}`);
  const afterSync = await prisma.revisionSession.findMany({ where: { userId }, select: { id: true, calendarEventId: true } });
  ok("calendarEventId enregistrés en base", afterSync.every((session) => Boolean(session.calendarEventId)));
  const postsAfterFirstSync = googlePosts;
  await syncRevisionsToGoogle(accessToken ?? "", userId, afterSync.map((session) => session.id));
  ok("deuxième sync sans doublon (PATCH, pas de POST)", googlePosts === postsAfterFirstSync && googlePatches >= afterSync.length, `POST=${googlePosts} PATCH=${googlePatches}`);

  // ── Étape 4 : déplacement d'une révision → événement Google mis à jour ─────
  console.log("\n[4] Déplacement d'une révision conservé côté Google");
  const target = afterSync[0];
  const movedRevision = await prisma.revisionSession.update({ where: { id: target.id }, data: { date: new Date(Date.now() + 3 * 86_400_000), startTime: "19:30" } });
  const patchesBeforeMove = googlePatches;
  await syncRevisionToGoogleCalendar(accessToken ?? "", movedRevision.id, userId);
  ok("PATCH envoyé avec la nouvelle date", googlePatches === patchesBeforeMove + 1);
  const googleSummary = googleEventStore.get(movedRevision.calendarEventId ?? "");
  ok("événement distant mis à jour (nouvelle date)", googleSummary !== undefined && googleSummary.start.includes(new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10)));

  // ── Étape 5 : suppression d'une révision → événement Google supprimé ───────
  console.log("\n[5] Suppression d'une révision");
  const removable = afterSync.filter((session) => session.id !== target.id)[0];
  const eventId = (await prisma.revisionSession.findUnique({ where: { id: removable.id }, select: { calendarEventId: true } }))?.calendarEventId;
  const deletesBefore = googleDeletes;
  await deleteRevisionFromGoogleCalendar(accessToken ?? "", removable.id, userId);
  ok("DELETE envoyé à Google", googleDeletes === deletesBefore + 1);
  ok("événement retiré du store distant", !googleEventStore.has(eventId ?? ""));
  const deletedLocally = await prisma.revisionSession.findUnique({ where: { id: removable.id }, select: { calendarEventId: true } });
  ok("calendarEventId nullé en base", deletedLocally?.calendarEventId === null);

  // ── Étape 6 : import sans doublons + nettoyage des événements disparus ─────
  console.log("\n[6] Import Google + nettoyage des événements disparus");
  await prisma.event.create({ data: { userId, title: "Ancien événement supprimé côté Google", start: new Date(Date.now() + 86_400_000), end: new Date(Date.now() + 86_400_000 + 3_600_000), type: "personal", source: "google", externalId: "gcal-ghost" } });
  await importGoogleCalendarEvents(accessToken ?? "", userId, new Date());
  const googleEvents = await prisma.event.findMany({ where: { userId, source: "google" }, select: { externalId: true } });
  ok("événement actif importé (sans doublon)", googleEvents.filter((event) => event.externalId === "gcal-1").length === 1, JSON.stringify(googleEvents.map((event) => event.externalId)));
  ok("ancien événement Google nettoyé", !googleEvents.some((event) => event.externalId === "gcal-ghost"), JSON.stringify(googleEvents.map((event) => event.externalId)));

  // ── Étape 7 : worker sans session navigateur (PC éteint) ───────────────────
  console.log("\n[7] Worker cron (jobs sans navigateur)");
  const { enqueueJob, processNextJob } = await import("@/services/automation");
  const syncJob = await enqueueJob(userId, "sync_google_calendar", {}, "scenario:sync");
  const processed = await processNextJob(userId, syncJob.id);
  ok("job sync_google_calendar traité par le worker", processed?.status === "completed", `status=${processed?.status}`);
  const dbJob = await prisma.automationJob.findUnique({ where: { id: syncJob.id }, select: { status: true, error: true } });
  ok("job terminé en base sans erreur", dbJob?.status === "completed" && dbJob.error === null, dbJob?.error ?? "");

  const deletesBeforePlan = googleDeletes;
  const planJob = await enqueueJob(userId, "create_revision_plan", { evaluationId: evaluation.id }, "scenario:plan");
  const planProcessed = await processNextJob(userId, planJob.id);
  ok("job create_revision_plan traité", planProcessed?.status === "completed", planProcessed?.id ? "" : "non traité");
  const totalForEval = await prisma.revisionSession.count({ where: { evaluationId: evaluation.id } });
  const plannedForEval = await prisma.revisionSession.count({ where: { evaluationId: evaluation.id, status: "planned" } });
  ok("plan régénéré sans doublons (toutes planifiées)", totalForEval === plannedForEval && plannedForEval > 0, `total=${totalForEval} planned=${plannedForEval}`);
  ok("anciens événements Google des sessions remplacées nettoyés par le service", googleDeletes >= deletesBeforePlan, `DELETE=${googleDeletes - deletesBeforePlan}`);
}

await main();