import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";

const textTypes = new Set(["text/plain", "text/markdown"]);
const imageTypes = new Set(["image/png", "image/jpeg"]);

export async function extractCourseText(file: File) {
  const buffer = Buffer.from(await file.arrayBuffer());
  if (textTypes.has(file.type) || file.name.toLowerCase().endsWith(".txt")) return buffer.toString("utf8");
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    const parser = new PDFParse({ data: buffer });
    try { return (await parser.getText()).text; } finally { await parser.destroy(); }
  }
  if (file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || file.name.toLowerCase().endsWith(".docx")) return (await mammoth.extractRawText({ buffer })).value;
  if (imageTypes.has(file.type)) return null;
  throw new Error("Format non supporté");
}

export function sourceTypeFor(file: File) {
  if (file.type === "application/pdf" || file.name.endsWith(".pdf")) return "pdf" as const;
  if (imageTypes.has(file.type)) return "image" as const;
  if (file.name.endsWith(".docx")) return "document" as const;
  return "text" as const;
}

export const MAX_COURSE_FILE_SIZE = 15 * 1024 * 1024;
export const allowedCourseMimeTypes = new Set(["text/plain", "text/markdown", "application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "image/png", "image/jpeg"]);
