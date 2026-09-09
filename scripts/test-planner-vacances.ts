import { createRevisionPlan } from "@/services/revision-planner";

// Exam le vendredi 18 sept 2026. Toute la journée du mercredi 16 est vacances (00:00→24:00).
const result = createRevisionPlan({
  examDate: new Date("2026-09-18T08:00:00"),
  today: new Date("2026-09-14T10:00:00"),
  difficulty: "normal",
  importance: "normal",
  chapterCount: 1,
  mastery: [50],
  busyIntervals: [{ date: new Date("2026-09-16T00:00:00"), startTime: "00:00", endTime: "24:00" }],
});
const onWednesday = result.sessions.filter((s) => s.date.getDay() === 3); // mercredi JS=3
let failed = 0;
console.log(`desired=${result.desired} sessions=${result.sessions.length}`);
result.sessions.forEach((s) => console.log(`  ${s.date.toISOString().slice(0,10)} ${s.startTime} ${s.type}`));
if (onWednesday.length > 0) { console.log("✘ révision planifiée un jour de vacances !"); failed += 1; }
else console.log("✔ aucune révision le mercredi (vacances bloquées)");
if (result.sessions.length === 0) { console.log("✘ aucune session trouvée (trop restrictif ?)"); failed += 1; }
else console.log("✔ des sessions existent sur les autres jours");
console.log(failed === 0 ? "PLANNER+VACANCES: SUCCÈS" : `${failed} échec(s)`);
process.exit(failed === 0 ? 0 : 1);
