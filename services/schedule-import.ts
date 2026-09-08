import { createHash } from "crypto";
import { PDFParse } from "pdf-parse";
import { ocrImageToText } from "@/services/ocr";

// ── Types --------------------------------------------------------------------
export type ParsedSlot = {
  dayOfWeek: number | null; // Lundi=0 … Dimanche=6
  startTime: string | null; // "HH:MM"
  endTime: string | null;
  subject: string | null;
  room: string | null;
  teacher: string | null;
  sourceLine: number;
  confidence: "high" | "medium" | "low";
  warnings: string[];
};

export type ImportPreview = {
  sourceType: string;
  entryCount: number;
  daysDetected: string[];
  subjectsDetected: string[];
  slots: ParsedSlot[];
  stats: { high: number; medium: number; low: number; duplicates: number; overlapping: number; incoherent: number };
};

export const daysLabels = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

const DAYS_FR: Array<[RegExp, number]> = [
  [/\b(lun|monday)\b/i, 0],
  [/\b(mar|tuesday)\b/i, 1],
  [/\b(mer|wednesday)\b/i, 2],
  [/\b(jeu|thursday)\b/i, 3],
  [/\b(ven|friday)\b/i, 4],
  [/\b(sam|saturday)\b/i, 5],
  [/\b(dim|sunday)\b/i, 6],
];

const HOUR_TOKEN = "(\\d{1,2})[:hH]?\\s*(\\d{2})?";
const SEP = "[\\-–—→~àa/]\\s*";
const TIME_RANGE_RE = new RegExp(`${HOUR_TOKEN}\\s*${SEP}\\s*${HOUR_TOKEN}`, "i");

function matchDay(line: string): number | null {
  const trimmed = line.trim().replace(/[:.\-_]+$/, "").trim();
  for (const [re, day] of DAYS_FR) {
    if (re.test(trimmed)) return day;
  }
  return null;
}

function normalizeTime(token: string): string | null {
  const cleaned = token.trim().toLowerCase().replace(/\s+/g, "");
  if (!cleaned) return null;
  let match = cleaned.match(/^(\d{1,2})[:hH](\d{2})$/);
  if (match) return `${match[1].padStart(2, "0")}:${match[2]}`;
  match = cleaned.match(/^(\d{1,2})[:hH]$/);
  if (match) return `${match[1].padStart(2, "0")}:00`;
  match = cleaned.match(/^(\d{2})(\d{2})$/);
  if (match && Number(match[2]) < 60 && Number(match[1]) < 24) return `${match[1]}:${match[2]}`;
  match = cleaned.match(/^(\d{3})$/);
  if (match) {
    const h = Number(match[1].slice(0, 1));
    const m = Number(match[1].slice(1));
    if (h < 24 && m < 60) return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }
  return null;
}

function cleanSubject(raw: string): string {
  const cleaned = raw.replace(/^(matière|cours|module|subject)\s*:\s*/i, "").replace(/[.!?;:]+$/, "").trim();
  if (!cleaned) return raw.trim();
  if (/^[A-Z0-9]{1,4}$/.test(cleaned)) return cleaned.toUpperCase();
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function parseLine(line: string, currentDay: number, lineIndex: number): ParsedSlot {
  const warnings: string[] = [];
  const rangeMatch = line.match(TIME_RANGE_RE);
  if (!rangeMatch) {
    return {
      dayOfWeek: currentDay >= 0 ? currentDay : null, startTime: null, endTime: null,
      subject: null, room: null, teacher: null, sourceLine: lineIndex + 1,
      confidence: "low", warnings: ["Aucun créneau horaire détecté"],
    };
  }
  const start = normalizeTime(`${rangeMatch[1]}${rangeMatch[2] ? ":" + rangeMatch[2] : ""}`);
  const end = normalizeTime(`${rangeMatch[3]}${rangeMatch[4] ? ":" + rangeMatch[4] : ""}`);
  if (!start) warnings.push("Heure de début ambiguë");
  if (!end) warnings.push("Heure de fin ambiguë");
  if (start && end && start >= end) warnings.push("La fin est avant le début");
  const after = line.slice(rangeMatch[0].length).trim().replace(/^[:\-–—→\s]+/, "").trim();
  let subject: string | null = null;
  let room: string | null = null;
  let teacher: string | null = null;
  if (after) {
    const parts = after.split(/[\t;|]/).map((p) => p.trim()).filter(Boolean);
    if (parts.length === 1) {
      subject = cleanSubject(parts[0]);
    } else if (parts.length >= 2) {
      subject = cleanSubject(parts[0]);
      const roomCandidate = parts.slice(1).find((p) => /^(B?\d{2,4}|AMPHI|LABO|CDI|GYM|EPS|SALLE)\b/i.test(p.replace(/\s+/g, "")));
      if (roomCandidate) {
        room = roomCandidate.trim();
        const tc = parts.slice(1).find((p) => /^M\.|Mme|Prof|Professeur/i.test(p));
        if (tc) teacher = tc.trim();
      } else {
        const tc = parts.slice(1).find((p) => /^M\.|Mme|Prof/i.test(p));
        if (tc) { teacher = tc.trim(); room = parts.slice(1).find((p) => p !== tc)?.trim() ?? null; }
        else subject = cleanSubject(parts.join(" "));
      }
    }
  }
  if (!subject) warnings.push("Matière ambiguë ou absente");
  return {
    dayOfWeek: currentDay >= 0 ? currentDay : null, startTime: start, endTime: end, subject, room, teacher,
    sourceLine: lineIndex + 1, confidence: warnings.length === 0 ? "high" : start && end && subject ? "medium" : "low", warnings,
  };
}

// ── Parseurs de formats -------------------------------------------------------
export function parseFreeText(text: string): ParsedSlot[] {
  const lines = text.split(/\r?\n/);
  let currentDay = -1;
  const slots: ParsedSlot[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line) continue;
    const day = matchDay(line);
    if (day !== null && line.length <= 24 && !TIME_RANGE_RE.test(line)) {
      currentDay = day;
      continue;
    }
    slots.push(parseLine(line, currentDay, index));
  }
  return slots;
}

export function parseCsv(text: string): ParsedSlot[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const sep = text.includes(";") ? ";" : text.includes("\t") ? "\t" : ",";
  const headers = lines[0].split(sep).map((h) => h.trim().toLowerCase());
  const hasHeader = headers.some((h) => /jour|day|debut|start|begin|heure/i.test(h));
  const rows = hasHeader ? lines.slice(1) : lines;
  const slots: ParsedSlot[] = [];
  rows.forEach((row, index) => {
    const cols = row.split(sep).map((c) => c.trim());
    let dayOfWeek: number | null = null;
    let startTime: string | null = null;
    let endTime: string | null = null;
    let subject: string | null = null;
    let room: string | null = null;
    let teacher: string | null = null;
    if (hasHeader) {
      const get = (pattern: RegExp) => { const i = headers.findIndex((h) => pattern.test(h)); return i >= 0 ? cols[i] : ""; };
      const dayRaw = get(/jour|day/i);
      const dayHit = DAYS_FR.find(([re]) => re.test(dayRaw));
      dayOfWeek = dayHit ? dayHit[1] : null;
      startTime = normalizeTime(get(/debut|start|début/i)) || null;
      endTime = normalizeTime(get(/fin|end/i)) || null;
      subject = cleanSubject(get(/matiere|subject|cours/i)) || null;
      room = get(/salle|room|lieu|location/i) || null;
      teacher = get(/prof|teacher|professeur/i) || null;
    } else {
      const dayHit = DAYS_FR.find(([re]) => re.test(cols[0] ?? ""));
      dayOfWeek = dayHit ? dayHit[1] : null;
      startTime = normalizeTime(cols[1] ?? "") || null;
      endTime = normalizeTime(cols[2] ?? "") || null;
      subject = cleanSubject(cols[3] ?? "") || null;
      room = cols[4] || null;
      teacher = cols[5] || null;
    }
    const warnings: string[] = [];
    if (dayOfWeek === null) warnings.push("Jour non reconnu");
    if (!startTime) warnings.push("Heure de début absente");
    if (!endTime) warnings.push("Heure de fin absente");
    if (startTime && endTime && startTime >= endTime) warnings.push("Fin avant début");
    if (!subject) warnings.push("Matière absente");
    slots.push({
      dayOfWeek, startTime, endTime, subject, room, teacher, sourceLine: index + 1,
      confidence: warnings.length === 0 ? "high" : startTime && endTime && subject ? "medium" : "low", warnings,
    });
  });
  return slots;
}

function icsTimeToHHMM(token: string): string {
  const match = token.match(/T(\d{2})(\d{2})/);
  return match ? `${match[1]}:${match[2]}` : token;
}

export function parseIcs(text: string): ParsedSlot[] {
  const slots: ParsedSlot[] = [];
  const events = text.split(/BEGIN:VEVENT/);
  const bydayMap: Record<string, number> = { MO: 0, TU: 1, WE: 2, TH: 3, FR: 4, SA: 5, SU: 6 };
  events.forEach((event, idx) => {
    if (!event.trim() || !event.includes("DTSTART")) return;
    const rrule = event.match(/RRULE:[^\r\n]*/)?.[0];
    const summary = event.match(/SUMMARY:[^\r\n]*/)?.[0]?.replace("SUMMARY:", "").trim() ?? null;
    const location = event.match(/LOCATION:[^\r\n]*/)?.[0]?.replace("LOCATION:", "").trim() ?? null;
    const dtstart = event.match(/DTSTART[^:]*:(\d{8}T\d{6}Z?)/)?.[1];
    const dtendMatch = event.match(/DTEND[^\r\n]*/)?.[0];
    const dtend = dtendMatch?.match(/:(\d{8}T\d{6}Z?)/)?.[1];
    if (!dtstart) return;
    const start = icsTimeToHHMM(dtstart);
    const end = dtend ? icsTimeToHHMM(dtend) : null;
    const byday = rrule?.match(/BYDAY=([A-Z,]+)/)?.[1];
    const isRecurring = rrule && /FREQ=WEEKLY/i.test(rrule);
    const days = byday ? byday.split(",").map((d) => bydayMap[d]).filter((d): d is number => d !== undefined) : [];
    if (!isRecurring && days.length === 0) {
      slots.push({
        dayOfWeek: null, startTime: start, endTime: end, subject: cleanSubject(summary ?? ""),
        room: location, teacher: null, sourceLine: idx + 1, confidence: "low",
        warnings: ["Événement ponctuel (non récurrent) — jour indéterminé"],
      });
      return;
    }
    days.forEach((day) => {
      const warnings: string[] = [];
      if (!end) warnings.push("Heure de fin absente");
      if (start && end && start >= end) warnings.push("Fin avant début");
      if (!summary) warnings.push("Matière absente");
      slots.push({
        dayOfWeek: day, startTime: start, endTime: end, subject: cleanSubject(summary ?? ""),
        room: location, teacher: null, sourceLine: idx + 1,
        confidence: warnings.length === 0 ? "high" : "medium", warnings,
      });
    });
  });
  return slots;
}

// ── Extraction de texte ------------------------------------------------------
async function extractTextFromFile(file: File): Promise<{ text: string; sourceType: string }> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const lower = file.name.toLowerCase();
  if (file.type === "application/pdf" || lower.endsWith(".pdf")) {
    const parser = new PDFParse({ data: buffer });
    try {
      const { text } = await parser.getText();
      if (!text.trim()) throw new Error("PDF sans texte extractible (document composé d'images ?)");
      return { text, sourceType: "pdf" };
    } finally {
      await parser.destroy();
    }
  }
  if (file.type === "text/csv" || lower.endsWith(".csv")) return { text: buffer.toString("utf8"), sourceType: "csv" };
  if (file.type === "text/calendar" || file.type === "application/ics" || lower.endsWith(".ics")) return { text: buffer.toString("utf8"), sourceType: "ics" };
  if (file.type.startsWith("image/") || lower.match(/\.(png|jpe?g)$/)) {
    const mime = lower.endsWith(".png") ? "image/png" : "image/jpeg";
    const result = await ocrImageToText(new File([new Uint8Array(buffer)], file.name, { type: mime }));
    if (!result || !result.text.trim()) throw new Error("OCR n'a rien extrait — image illisible ?");
    return { text: result.text, sourceType: "image" };
  }
  if (file.type.startsWith("text/") || lower.match(/\.(txt|md)$/)) return { text: buffer.toString("utf8"), sourceType: "text" };
  throw new Error("Format non supporté");
}

export function hashScheduleContent(slots: Array<{ dayOfWeek: number; startTime: string; endTime: string; subject: string }>): string {
  const canonical = slots.map((s) => `${s.dayOfWeek}|${s.startTime}|${s.endTime}|${s.subject}`).sort().join("\n");
  return createHash("sha256").update(canonical).digest("hex");
}

// ── Orchestration ------------------------------------------------------------
export async function buildImportPreview(file: File): Promise<ImportPreview> {
  const { text, sourceType } = await extractTextFromFile(file);
  const slots = sourceType === "csv" ? parseCsv(text) : sourceType === "ics" ? parseIcs(text) : parseFreeText(text);
  const subjects = Array.from(new Set(slots.map((s) => s.subject).filter((s): s is string => !!s)));
  const days = Array.from(new Set(slots.map((s) => s.dayOfWeek).filter((d): d is number => d !== null))).sort().map((d) => daysLabels[d]);
  const stats = { high: 0, medium: 0, low: 0, duplicates: 0, overlapping: 0, incoherent: 0 };
  const seen = new Set<string>();
  slots.forEach((slot) => {
    stats[slot.confidence] += 1;
    const key = `${slot.dayOfWeek}|${slot.startTime}|${slot.endTime}|${slot.subject}`;
    if (seen.has(key)) { stats.duplicates += 1; slot.warnings.push("Doublon détecté"); } else seen.add(key);
    if (slot.startTime && slot.endTime && slot.startTime >= slot.endTime) stats.incoherent += 1;
  });
  for (let day = 0; day < 7; day += 1) {
    const daySlots = slots.filter((s) => s.dayOfWeek === day && s.startTime && s.endTime).sort((a, b) => (a.startTime! < b.startTime! ? -1 : 1));
    for (let index = 1; index < daySlots.length; index += 1) {
      if (daySlots[index - 1].endTime! > daySlots[index].startTime!) {
        stats.overlapping += 1;
        daySlots[index].warnings.push("Chevauchement détecté avec un autre créneau");
      }
    }
  }
  return { sourceType, entryCount: slots.length, daysDetected: days, subjectsDetected: subjects, slots, stats };
}
