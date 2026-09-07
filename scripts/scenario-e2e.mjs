/**
 * Test de scénario E2E — UI → API → logique métier → PostgreSQL → retour UI.
 *
 * Pilote le VRAI serveur Next.js via les VRAIES routes HTTP, avec une session
 * next-auth (JWT signé NEXTAUTH_SECRET, équivalent d'une connexion Google).
 * Vérifie la chaîne complète : emploi du temps → cours → évaluation → analyse
 * auto des chapitres → génération des révisions → PostgreSQL → interface →
 * modification → déplacement → suppression → absence de doublons → jobs.
 *
 * Usage :
 *   1) npm run dev (ou next start) sur :3000
 *   2) node --env-file=.env --import ./scripts/ts-runner.mjs scripts/scenario-e2e.mjs
 */
import { execFileSync } from "node:child_process";
import { prisma } from "@/lib/prisma";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const EMAIL = "scenario-e2e@terminal-os.local";
const sessionToken = execFileSync(process.execPath, ["scripts/make-session.mjs", EMAIL], { encoding: "utf8", cwd: process.cwd() }).trim();
const cookie = `next-auth.session-token=${sessionToken}`;

let failed = 0;
function ok(label, condition, detail = "") {
  console.log(`${condition ? "  ✔" : "  ✘"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!condition) failed += 1;
}

async function api(path, method = "GET", body) {
  return fetch(`${BASE}${path}`, {
    method,
    headers: { cookie, ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function jsonOf(response) {
  try { return await response.json(); } catch { return null; }
}

async function main() {
  console.log(`== SCÉNARIO E2E COMPLET — ${BASE} ==`);

  // ── Attente du serveur ──────────────────────────────────────────────────────
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const health = await fetch(`${BASE}/api/health`);
      if (health.ok) break;
    } catch { /* pas prêt */ }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  // ── Nettoyage + « première connexion » (équivalent du upsert de signIn) ────
  const previous = await prisma.user.findUnique({ where: { email: EMAIL }, select: { id: true } });
  if (previous) await prisma.user.delete({ where: { id: previous.id } });
  await prisma.user.create({ data: { email: EMAIL, name: "Scénario E2E" } });

  // ── Étape 1 : première connexion ────────────────────────────────────────────
  console.log("\n[1] Première connexion (session)");
  const dashboard = await api("/api/dashboard");
  ok("GET /api/dashboard 200 avec la session", dashboard.status === 200, `status=${dashboard.status}`);
  const noAuth = await fetch(`${BASE}/api/subjects`);
  ok("sans session → 401", noAuth.status === 401, `status=${noAuth.status}`);

  // ── Étape 2 : l'utilisateur renseigne son emploi du temps ───────────────────
  console.log("\n[2] Emploi du temps enregistré");
  const subjectResponse = await api("/api/subjects", "POST", { name: "Mathématiques", shortName: "MATH", color: "#f27645", coefficient: 2 });
  const subject = await jsonOf(subjectResponse);
  ok("POST /api/subjects 201", subjectResponse.status === 201 && Boolean(subject?.id), JSON.stringify(subject ?? {}).slice(0, 80));
  // Lundi 08h-12h + Mercredi 08h-21h30 (le mercredi sature la fenêtre d'étude).
  const slot1 = await api("/api/schedule", "POST", { dayOfWeek: 0, startTime: "08:00", endTime: "12:00", subjectId: subject.id, location: "B204" });
  const slot2 = await api("/api/schedule", "POST", { dayOfWeek: 2, startTime: "08:00", endTime: "21:30", subjectId: subject.id, location: "C101" });
  ok("POST /api/schedule x2 → 201", slot1.status === 201 && slot2.status === 201);
  const scheduleList = await jsonOf(await api("/api/schedule"));
  ok("GET /api/schedule renvoie les créneaux", scheduleList?.length === 2, `${scheduleList?.length} créneau(x)`);

  // ── Étape 3 : l'utilisateur ajoute un cours ────────────────────────────────
  console.log("\n[3] Cours créé et rattaché à un chapitre");
  const ch1Response = await api("/api/chapters", "POST", { subjectId: subject.id, name: "Suites numériques" });
  const ch1 = await jsonOf(ch1Response);
  const ch2Response = await api("/api/chapters", "POST", { subjectId: subject.id, name: "Fonctions" });
  const ch2 = await jsonOf(ch2Response);
  ok("POST /api/chapters x2 → 201", ch1Response.status === 201 && ch2Response.status === 201);
  const courseResponse = await api("/api/courses", "POST", { subjectId: subject.id, chapterId: ch1.id, title: "Cours Suites", content: "Une suite arithmétique est définie par Un+1 = Un + r. Une suite géométrique par Un+1 = q·Un." });
  const course = await jsonOf(courseResponse);
  ok("POST /api/courses 201 (lié au chapitre)", courseResponse.status === 201 && course?.chapterId === ch1.id);
  const courseList = await jsonOf(await api("/api/courses"));
  ok("GET /api/courses renvoie le cours (retour UI)", courseList?.some((item) => item.id === course.id));
  // ── Étape 4 : évaluation liée au cours → analyse auto des chapitres ───────
  console.log("\n[4] Évaluation : analyse automatique des chapitres concernés");
  const evalDate = new Date(Date.now() + 12 * 86_400_000).toISOString().slice(0, 10);
  const evalResponse = await api("/api/evaluations", "POST", { title: "Contrôle Suites & Fonctions", subjectId: subject.id, date: evalDate, importance: "high", difficulty: "normal", chapterIds: [] });
  const evalData = await jsonOf(evalResponse);
  ok("POST /api/evaluations 201", evalResponse.status === 201, JSON.stringify(evalData ?? {}).slice(0, 120));
  ok("chapitres détectés automatiquement", evalData?.autoChapters === true && evalData?.chapters?.length >= 1, `${evalData?.chapters?.length ?? 0} chapitre(s)`);
  ok("sessions générées automatiquement", evalData?.revisionSessionsCreated > 0, `${evalData?.revisionSessionsCreated} session(s)`);
  const evaluationId = evalData?.evaluation?.id;

  // ── Étape 5 : sessions en PostgreSQL + créneaux réellement libres ──────────
  console.log("\n[5] Sessions en base, créneaux libres, pas de conflit");
  const revisionsInDb = await prisma.revisionSession.findMany({ where: { evaluationId }, include: { chapter: true } });
  ok("sessions persistées dans PostgreSQL (createMany)", revisionsInDb.length === evalData.revisionSessionsCreated, `${revisionsInDb.length} ligne(s)`);
  ok("chaque session reliée à un chapitre + à l'évaluation", revisionsInDb.every((session) => session.chapterId && session.evaluationId === evaluationId));
  const wednesday = revisionsInDb.filter((session) => (new Date(session.date).getDay() + 6) % 7 === 2);
  ok("aucune session le mercredi (journée saturée protégée)", wednesday.length === 0, wednesday.map((session) => session.startTime).join(","));
  const mondayMorning = revisionsInDb.filter((session) => (new Date(session.date).getDay() + 6) % 7 === 0 && (session.startTime ?? "17:00") < "12:00");
  ok("aucune session lundi matin (créneau 08h-12h protégé)", mondayMorning.length === 0);

  // ── Étape 6 : elles apparaissent dans l'interface (API consommée par l'UI) ─
  console.log("\n[6] Retour UI : révisions, évaluations, dashboard");
  const revisionList = await jsonOf(await api("/api/revisions"));
  ok("GET /api/revisions renvoie les sessions", revisionList?.length === revisionsInDb.length, `${revisionList?.length}`);
  const evalList = await jsonOf(await api("/api/evaluations"));
  ok("GET /api/evaluations inclut les révisions", evalList?.[0]?.revisions?.length === revisionsInDb.length);
  const dashData = await jsonOf(await api("/api/dashboard"));
  ok("dashboard expose les données réelles (aucun mock)", typeof dashData?.week?.sessions === "number" && dashData.week.sessions >= 1 && typeof dashData?.progression?.mastery === "number", `week.sessions=${dashData?.week?.sessions} mastery=${dashData?.progression?.mastery}`);

  // ── Étape 7 : Google Calendar (non connecté → 412, pas de crash) ───────────
  console.log("\n[7] Synchronisation Google Calendar");
  const syncNotConnected = await api("/api/calendar/sync", "POST");
  ok("sync sans Google → 412 (comportement propre)", syncNotConnected.status === 412, `status=${syncNotConnected.status}`);
  const statusResponse = await jsonOf(await api("/api/calendar/status"));
  ok("GET /api/calendar/status cohérent", statusResponse?.configured === true && statusResponse.connected === false);

  // ── Étape 8 : l'évaluation change → planning recalculé sans doublons ───────
  console.log("\n[8] Modification de l'évaluation → recalcul");
  const newDate = new Date(Date.now() + 20 * 86_400_000).toISOString().slice(0, 10);
  const patchResponse = await api(`/api/evaluations/${evaluationId}`, "PATCH", { date: newDate });
  ok("PATCH /api/evaluations 200 (planning recalculé)", patchResponse.status === 200, `status=${patchResponse.status}`);
  const afterReschedule = await prisma.revisionSession.findMany({ where: { evaluationId, status: "planned" } });
  ok("sessions régénérées dans la nouvelle fenêtre", afterReschedule.every((session) => new Date(session.date) <= new Date(`${newDate}T23:59:59Z`)), `${afterReschedule.length} session(s)`);
  const uniqueSlots = new Set(afterReschedule.map((session) => `${session.date.toISOString().slice(0, 10)}T${session.startTime}`));
  ok("aucun doublon après régénération", uniqueSlots.size === afterReschedule.length, `${uniqueSlots.size}/${afterReschedule.length}`);

  // ── Étape 9 : déplacement d'une révision (modification conservée) ─────────
  console.log("\n[9] Déplacement d'une révision");
  const movable = afterReschedule[0];
  const moveResponse = await api(`/api/revisions/${movable.id}`, "PATCH", { date: new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10), startTime: "20:30" });
  const moved = await jsonOf(moveResponse);
  ok("PATCH /api/revisions 200", moveResponse.status === 200 && moved?.startTime === "20:30");
  const movedInDb = await prisma.revisionSession.findUnique({ where: { id: movable.id } });
  ok("modification conservée en base", movedInDb?.startTime === "20:30");

  // ── Étape 10 : suppression d'une révision ─────────────────────────────────
  console.log("\n[10] Suppression d'une révision");
  const deletable = afterReschedule[1];
  const deleteResponse = await api(`/api/revisions/${deletable.id}`, "DELETE");
  ok("DELETE /api/revisions 204", deleteResponse.status === 204);
  const stillThere = await prisma.revisionSession.findUnique({ where: { id: deletable.id } });
  ok("ligne réellement supprimée de PostgreSQL", stillThere === null);

  // ── Étape 11 : conflits entre évaluations ──────────────────────────────────
  console.log("\n[11] Deuxième évaluation : créneaux déjà occupés évités");
  const eval2Response = await api("/api/evaluations", "POST", { title: "Contrôle 2", subjectId: subject.id, date: new Date(Date.now() + 8 * 86_400_000).toISOString().slice(0, 10), chapterIds: [ch2.id], importance: "normal", difficulty: "normal" });
  const eval2 = await jsonOf(eval2Response);
  ok("POST /api/evaluations 201 (2e évaluation)", eval2Response.status === 201 && eval2?.revisionSessionsCreated > 0);
  const userRow = await prisma.user.findUnique({ where: { email: EMAIL }, select: { id: true } });
  const allPlanned = await prisma.revisionSession.findMany({ where: { userId: userRow.id, status: "planned" } });
  const slotKeys = allPlanned.map((session) => `${session.date.toISOString().slice(0, 10)}T${session.startTime}`);
  ok("aucun chevauchement de créneau entre évaluations", new Set(slotKeys).size === slotKeys.length, `${slotKeys.length} session(s)`);

  // ── Étape 12 : automatisations (jobs visibles, traités) ────────────────────
  console.log("\n[12] Automatisations");
  const jobResponse = await api("/api/automation", "POST", { type: "update_mastery", payload: { chapterId: ch1.id }, idempotencyKey: "e2e:mastery" });
  ok("POST /api/automation crée le job", jobResponse.status === 201);
  const jobList = await jsonOf(await api("/api/automation"));
  const e2eJob = jobList?.find((job) => job.idempotencyKey === "e2e:mastery");
  ok("GET /api/automation liste le job (écran Automatisations)", Boolean(e2eJob));
  const retryResponse = await api(`/api/automation/${e2eJob.id}/retry`, "POST");
  ok("relance du job traitée", retryResponse.status === 200);

  // ── Étape 13 : suppression complète (évaluation + cascade) ─────────────────
  console.log("\n[13] Suppression de l'évaluation (cascade)");
  const deleteEval = await api(`/api/evaluations/${evaluationId}`, "DELETE");
  ok("DELETE /api/evaluations 204", deleteEval.status === 204);
  const remaining = await prisma.revisionSession.count({ where: { evaluationId } });
  ok("sessions liées supprimées (cascade)", remaining === 0, `restantes=${remaining}`);

  // ── Nettoyage ───────────────────────────────────────────────────────────────
  const userRowEnd = await prisma.user.findUnique({ where: { email: EMAIL }, select: { id: true } });
  if (userRowEnd) await prisma.user.delete({ where: { id: userRowEnd.id } });

  console.log(`\n${failed ? "ÉCHEC" : "SUCCÈS"} — ${failed} assertion(s) en échec`);
  process.exit(failed ? 1 : 0);
}

await main();