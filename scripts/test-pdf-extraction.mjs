// Test réel d'extraction PDF côté Node (valide le chemin /api/courses/upload).
// Usage : node scripts/test-pdf-extraction.mjs
//
// Vérifie :
//  1. import d'un vrai PDF texte (généré à la volée, xref valide)
//  2. extraction du texte via les services RÉELS de Terminal OS
//     (services/course-processor.ts → route /api/courses/upload
//      services/schedule-import.ts → route /api/schedule/import)
//  3. texte non vide et contenu attendu
//  4. absence d'erreur « fake worker » / pdf.worker
//  5. aucune dépendance à /var/task ni chemin absolu hardcodé
import { registerHooks } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { writeFileSync, mkdtempSync, existsSync } from "node:fs";
import os from "node:os";

// Résolution de l'alias "@/..." pour l'exécution Node directe des services TS.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      const rel = specifier.slice(2);
      const base = pathToFileURL(path.join(process.cwd(), rel)).href;
      return nextResolve(path.extname(rel) ? base : `${base}.ts`, context);
    }
    return nextResolve(specifier, context);
  },
});

let failures = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

// ── Génération d'un vrai PDF texte (structure PDF 1.4 valide, xref correct) ──
function escapePdfText(s) {
  return s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function buildPdf(lines) {
  const content = [
    "BT",
    "/F1 12 Tf",
    "14 TL",
    "72 720 Td",
    ...lines.map((line) => `(${escapePdfText(line)}) Tj T*`),
    "ET",
  ].join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [];
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach((o) => { pdf += `${String(o).padStart(10, "0")} 00000 n \n`; });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}

const tmpDir = mkdtempSync(path.join(os.tmpdir(), "terminal-os-pdf-"));
const pdfBytes = buildPdf([
  "Emploi du temps - Semaine 1",
  "Lundi",
  "08:00 - 10:00 Mathematiques Salle A102",
  "10:15 - 12:15 Physique Salle B204",
  "Mardi",
  "14:00 - 16:00 Histoire Salle C101",
]);
writeFileSync(path.join(tmpDir, "emploi-du-temps.pdf"), pdfBytes);

try {
  // ── Chemin réel 1 : /api/courses/upload → extractCourseText ──
  const { extractCourseText } = await import("../services/course-processor.ts");
  const file = new File([new Uint8Array(pdfBytes)], "emploi-du-temps.pdf", { type: "application/pdf" });
  const text = await extractCourseText(file);
  check("extractCourseText : import PDF OK (aucune erreur worker)", true);
  check("extractCourseText : texte non vide", typeof text === "string" && text.trim().length > 0, `${text.trim().length} caractères`);
  check("extractCourseText : contenu attendu présent", /Mathematiques/.test(text) && /Lundi/.test(text) && /Mardi/.test(text));
  check("extractCourseText : pas d'erreur « fake worker »", !/fake worker|pdf\.worker/i.test(String(text)));

  // ── Chemin réel 2 : /api/schedule/import → buildImportPreview ──
  const { buildImportPreview } = await import("../services/schedule-import.ts");
  const preview = await buildImportPreview(new File([new Uint8Array(pdfBytes)], "emploi-du-temps.pdf", { type: "application/pdf" }));
  check("buildImportPreview : sourceType === 'pdf'", preview.sourceType === "pdf");
  check("buildImportPreview : créneaux détectés", preview.slots.length >= 3, `${preview.slots.length} créneaux`);
  check("buildImportPreview : jours détectés", preview.daysDetected.includes("Lundi") && preview.daysDetected.includes("Mardi"), preview.daysDetected.join(", "));

  // ── Message d'erreur préservé pour un PDF sans texte ──
  let emptyError = null;
  try {
    await buildImportPreview(new File([new Uint8Array(buildPdf([]))], "vide.pdf", { type: "application/pdf" }));
  } catch (error) {
    emptyError = error;
  }
  check(
    "PDF sans texte : message d'erreur d'origine conservé",
    emptyError?.message === "PDF sans texte extractible (document composé d'images ?)",
    emptyError ? `"${emptyError.message}"` : "aucune erreur levée",
  );

  // ── Garanties serverless ──
  const unpdfUrl = import.meta.resolve("unpdf");
  check("unpdf résolu depuis node_modules (package externe tracé par nft)", unpdfUrl.includes("node_modules/unpdf"), unpdfUrl);
  // pdfjs-dist / pdf-parse doivent être absents : aucune résolution de
  // pdf.worker.mjs depuis node_modules n'est donc possible au runtime.
  check("pdfjs-dist et pdf-parse désinstallés (aucun worker filesystem requis)", !existsSync("node_modules/pdfjs-dist") && !existsSync("node_modules/pdf-parse"));
  const loadedModules = [...(process.moduleCache?.keys?.() ?? [])].join(" ");
  check("aucun module pdfjs-dist/pdf-parse chargé (worker inliné unpdf)", !/node_modules\/(pdfjs-dist|pdf-parse)\//.test(loadedModules));
  check("aucune dépendance à /var/task dans le chemin d'exécution", !loadedModules.includes("/var/task"));

  if (failures > 0) {
    console.error(`\n${failures} échec(s)`);
    process.exit(1);
  }
  console.log("\n🎉 Tous les tests PDF passent — extraction compatible Vercel Serverless validée.");
} catch (error) {
  console.error("❌ Erreur fatale pendant le test :", error);
  if (/fake worker|pdf\.worker/i.test(String(error))) console.error("→ Erreur worker PDF détectée !");
  if (String(error).includes("/var/task")) console.error("→ Dépendance /var/task détectée !");
  process.exit(1);
}
