import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildImportPreview, hashScheduleContent } from "@/services/schedule-import";

async function currentUserId() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return null;
  return (await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } }))?.id ?? null;
}

const MAX_IMPORT_FILE_SIZE = 5 * 1024 * 1024;
const allowedImportTypes = new Set(["application/pdf", "image/png", "image/jpeg", "text/csv", "text/calendar", "application/ics", "text/plain", "text/markdown"]);
const allowedImportExt = /\.(pdf|png|jpe?g|csv|ics|txt|md)$/i;

// POST : upload d'un fichier → aperçu parsé (aucune écriture en base).
export async function POST(request: Request) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Fichier manquant" }, { status: 400 });
  if (file.size === 0) return NextResponse.json({ error: "Fichier vide" }, { status: 400 });
  if (file.size > MAX_IMPORT_FILE_SIZE) return NextResponse.json({ error: "Fichier trop volumineux (5 Mo maximum)" }, { status: 413 });
  if (!allowedImportTypes.has(file.type) && !allowedImportExt.test(file.name)) {
    return NextResponse.json({ error: "Format non supporté (PDF, image, CSV, ICS, texte)" }, { status: 415 });
  }
  try {
    const preview = await buildImportPreview(file);
    const sanitized = {
      ...preview,
      slots: preview.slots.map((slot) => ({
        dayOfWeek: slot.dayOfWeek,
        startTime: slot.startTime,
        endTime: slot.endTime,
        subject: slot.subject,
        room: slot.room,
        teacher: slot.teacher,
        sourceLine: slot.sourceLine,
        confidence: slot.confidence,
        warnings: slot.warnings,
      })),
    };
    return NextResponse.json({ preview: sanitized, hash: hashScheduleContent(preview.slots.filter((s) => s.dayOfWeek !== null && s.startTime && s.endTime && s.subject).map((s) => ({ dayOfWeek: s.dayOfWeek as number, startTime: s.startTime as string, endTime: s.endTime as string, subject: s.subject as string }))) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Impossible d'analyser ce document" }, { status: 422 });
  }
}
