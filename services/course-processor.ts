import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";

const textTypes = new Set(["text/plain", "text/markdown"]);
const imageTypes = new Set(["image/png", "image/jpeg"]);

export async function extractCourseText(file: File) {
  const buffer = Buffer.from(await file.arrayBuffer());
  // B31 : certains navigateurs/OS envoient "application/octet-stream" ou "" pour
  // les .md / .txt, on accepte donc aussi par extension (comme pour .pdf/.docx).
  if (textTypes.has(file.type) || /\.(txt|md|markdown)$/i.test(file.name)) return buffer.toString("utf8");
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    const parser = new PDFParse({ data: buffer });
    try { return (await parser.getText()).text; } finally { await parser.destroy(); }
  }
  if (file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || file.name.toLowerCase().endsWith(".docx")) return (await mammoth.extractRawText({ buffer })).value;
  if (imageTypes.has(file.type)) return null;
  throw new Error("Format non supporté");
}

/**
 * Validation du contenu réel du fichier (magic bytes) pour un premier contrôle
 * au-delà du MIME déclaré.
 */
export async function validateFileSignature(file: File): Promise<{ ok: boolean; detected: string | null }> {
  const buffer = Buffer.from(await file.slice(0, 16).arrayBuffer());
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    const ok = buffer.toString("latin1").startsWith("%PDF");
    return ok ? { ok, detected: "pdf" } : { ok: false, detected: null };
  }
  if (imageTypes.has(file.type) || file.name.toLowerCase().match(/\.(png|jpe?g)$/)) {
    if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { ok: true, detected: "png" };
    if (buffer.length >= 3 && buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return { ok: true, detected: "jpeg" };
    return { ok: false, detected: null };
  }
  if (file.name.toLowerCase().endsWith(".docx")) {
    const ok = buffer.subarray(0, 2).equals(Buffer.from([0x50, 0x4b]));
    return ok ? { ok, detected: "docx" } : { ok: false, detected: null };
  }
  return { ok: true, detected: "text" };
}

/**
 * STRUCTURATION : transforme un extrait brut en plan de cours Markdown
 * organisé (titre, résumé, sections, points-clés, vocabulaire, à retenir).
 */
export function structureCourseText(title: string, raw: string): string {
  const clean = raw.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  const lines = clean.split("\n").map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return clean;

  const sectionBreaks: number[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const current = lines[index];
    const next = lines[index + 1];
    const isShort = current.length <= 90 && !current.match(/[.!?:;]$/);
    if (isShort && next && (next.length > 30 || next.match(/^[-*•]/))) sectionBreaks.push(index);
  }

  const sentences = clean.split(/[.!?]+/).map((sentence) => sentence.trim()).filter((sentence) => sentence.length > 20);
  const summary = sentences.slice(0, 2).join(". ").slice(0, 500);

  const keyTerms = lines.flatMap((line) => line.split(/[;,]/)).map((term) => term.trim()).filter((term) => /^[A-ZÀ-Ý][a-zà-ÿ]/.test(term) && term.length >= 3 && term.length <= 60);
  const terms = Array.from(new Set(keyTerms)).slice(0, 8);

  const sections: Array<{ heading: string | null; body: string }> = [];
  sectionBreaks.forEach((breakIndex, index) => {
    const start = index === 0 ? 0 : sectionBreaks[index - 1] + 1;
    const heading = lines[breakIndex];
    const body = lines.slice(start, breakIndex).join(" ").replace(/^#{1,3}\s*/, "");
    if (body) sections.push({ heading, body });
  });
  const tailStart = sectionBreaks.length ? sectionBreaks[sectionBreaks.length - 1] + 1 : 0;
  const tail = lines.slice(tailStart).join(" ");
  if (tail) sections.push({ heading: null, body: tail });

  const maxBody = sections.map((section) => section.body.length).sort((a, b) => b - a)[0] ?? 0;
  const mainSections = sections
    .filter((section) => section.heading && (section.body.length >= maxBody * 0.35 || section.body.length >= 120))
    .slice(0, 6);

  const parts: string[] = [];
  parts.push(`# ${title.toUpperCase()}`);
  if (summary) parts.push(`> ${summary}`);
  if (mainSections.length) {
    parts.push("\n## Plan du cours");
    mainSections.forEach((section) => parts.push(`- ${section.heading}`));
  }
  mainSections.forEach((section) => parts.push(`\n## ${section.heading}\n\n${section.body}`));
  if (terms.length) parts.push(`\n## Vocabulaire et notions clés\n\n${terms.map((term) => `- ${term}`).join("\n")}`);
  const takeaways = sentences.slice(-2);
  if (takeaways.length) parts.push(`\n## À retenir\n\n${takeaways.map((item) => `- ${item}.`).join("\n")}`);
  parts.push(`\n## Extrait brut\n\n${lines.slice(0, 80).join("\n")}`);
  return parts.filter(Boolean).join("\n\n");
}

export function sourceTypeFor(file: File) {
  if (file.type === "application/pdf" || file.name.endsWith(".pdf")) return "pdf" as const;
  if (imageTypes.has(file.type)) return "image" as const;
  if (file.name.endsWith(".docx")) return "document" as const;
  return "text" as const;
}

export const MAX_COURSE_FILE_SIZE = 15 * 1024 * 1024;
// B31 : les .md/.txt peuvent arriver avec un MIME non garanti (octet-stream,
// vide) ; l'extension est donc aussi acceptée à l'upload (en plus du MIME).
export const allowedCourseMimeTypes = new Set(["text/plain", "text/markdown", "application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "image/png", "image/jpeg"]);
export const allowedCourseExtensions = /\.(txt|md|markdown|pdf|docx|png|jpe?g)$/i;
