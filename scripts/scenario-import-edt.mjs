import { execFileSync } from "node:child_process";
import { prisma } from "../lib/prisma";

const BASE = "http://localhost:3000";
const EMAIL = "scenario-new@terminal-os.local";
const token = execFileSync(process.execPath, ["scripts/make-session.mjs", EMAIL], { encoding: "utf8", cwd: "/workspaces/Terminal-OS" }).trim();
const cookie = `next-auth.session-token=${token}`;
let failed = 0;
function ok(label, c, d="") { console.log(`${c?"  ✔":"  ✘"} ${label}${d?` — ${d}`:""}`); if(!c) failed+=1; }

// Création de l'utilisateur (équivalent du upsert lors de la connexion Google)
const previousUser = await prisma.user.findUnique({ where: { email: EMAIL }, select: { id: true } });
if (previousUser) await prisma.user.delete({ where: { id: previousUser.id } });
await prisma.user.create({ data: { email: EMAIL, name: "Scénario Nouvelles" } });
// Test 1: import CSV (aperçu)
const csv = "jour;debut;fin;matiere;salle\nLundi;08:00;09:00;Maths;B204\nLundi;09:00;10:00;Français;A101\nMardi;10:00;11:00;NSI;LABO\n";
const form = new FormData();
form.append("file", new Blob([csv], { type: "text/csv" }), "edt.csv");
const previewRes = await fetch(`${BASE}/api/schedule/import`, { method: "POST", headers: { cookie }, body: form });
const previewData = await previewRes.json();
console.log(JSON.stringify(previewData, null, 1).slice(0, 800));
ok("POST /api/schedule/import (CSV) 200", previewRes.status === 200, `status=${previewRes.status}`);
ok("3 créneaux détectés", previewData?.preview?.slots?.length === 3);
const monday = previewData?.preview?.slots?.filter(s => s.dayOfWeek === 0);
ok("créneau lundi 08:00→09:00 Maths", monday?.some(s => s.startTime === "08:00" && s.endTime === "09:00" && s.subject === "Maths"));
ok("salle B204 détectée", monday?.some(s => s.room === "B204"));

// Test 2: confirmation → écriture en base
// D'abord une matière "Maths" pour vérifier la liaison automatique subject ↔ créneau.
const subjectRes = await fetch(`${BASE}/api/subjects`, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ name: "Mathématiques", shortName: "Maths", color: "#1d4ed8", coefficient: 5 }) });
ok("matière Maths créée pour la liaison", subjectRes.status === 201, `status=${subjectRes.status}`);
const confirmBody = { slots: previewData.preview.slots, mode: "replace" };
const confirmRes = await fetch(`${BASE}/api/schedule/import/confirm`, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify(confirmBody) });
const confirmData = await confirmRes.json();
ok("POST /api/schedule/import/confirm 200", confirmRes.status === 200, `status=${confirmRes.status}`);
ok("3 créneaux créés", confirmData?.created === 3, `created=${confirmData?.created}`);
ok("au moins 1 créneau relié à une matière", (confirmData?.linked ?? 0) >= 1, `linked=${confirmData?.linked}`);

// Ré-import identique : aucun doublon
const confirm2 = await fetch(`${BASE}/api/schedule/import/confirm`, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify(confirmBody) });
const confirm2Data = await confirm2.json();
ok("ré-import : 0 créé, 3 préservés (pas de doublons)", confirm2Data?.created === 0 && confirm2Data?.preserved === 3, JSON.stringify({created: confirm2Data?.created, preserved: confirm2Data?.preserved}));

// Test 3: mode replace retire les créneaux absents
const subsetBody = { slots: previewData.preview.slots.slice(0, 1), mode: "replace" };
const subsetRes = await fetch(`${BASE}/api/schedule/import/confirm`, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify(subsetBody) });
const subsetData = await subsetRes.json();
ok("replace : 2 supprimés, 1 préservé", subsetData?.deleted === 2 && subsetData?.total === 1, JSON.stringify({deleted: subsetData?.deleted, total: subsetData?.total}));

// Test 4: texte libre (PDF simulé via texte)
const txt = new Blob(["Lundi\n08:00 → 09:00 Maths\n09:00-10:00 Français\nMardi\n10:00 → 11:00 NSI B204"], { type: "text/plain" });
const form2 = new FormData();
form2.append("file", txt, "edt.txt");
const txtRes = await fetch(`${BASE}/api/schedule/import`, { method: "POST", headers: { cookie }, body: form2 });
const txtData = await txtRes.json();
ok("import texte libre 200", txtRes.status === 200, `status=${txtRes.status}`);
ok("texte: 3 créneaux", txtData?.preview?.slots?.length === 3, `slots=${txtData?.preview?.slots?.length}`);
ok("texte: 2 jours détectés (Lundi, Mardi)", txtData?.preview?.daysDetected?.length === 2, JSON.stringify(txtData?.preview?.daysDetected));

// Test 5: vacances
const exRes = await fetch(`${BASE}/api/calendar/exceptions`, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ date: "2026-12-25", type: "holiday", label: "Noël" }) });
ok("POST /api/calendar/exceptions 201", exRes.status === 201, `status=${exRes.status}`);
const exGet = await fetch(`${BASE}/api/calendar/exceptions`, { headers: { cookie } });
const exList = await exGet.json();
ok("GET exceptions liste la journée", exList.length === 1);
// Upsert même jour (mise à jour du type)
await fetch(`${BASE}/api/calendar/exceptions`, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ date: "2026-12-25", type: "vacation", label: "Vacances de Noël" }) });
const ex2List = await (await fetch(`${BASE}/api/calendar/exceptions`, { headers: { cookie } })).json();
ok("upsert: toujours 1 seule entrée par jour (type mis à jour)", ex2List.length === 1 && ex2List[0].type === "vacation", JSON.stringify({ count: ex2List.length, type: ex2List[0]?.type }));

// Nettoyage
const user = await prisma.user.findUnique({ where: { email: EMAIL } });
if (user) await prisma.user.delete({ where: { id: user.id } });
console.log(failed === 0 ? "\nNOUVELLES FONCTIONNALITÉS: SUCCÈS" : `\n${failed} échec(s)`);
