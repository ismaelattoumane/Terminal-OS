import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function currentUserId() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return null;
  return (await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } }))?.id ?? null;
}

const slotSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  subject: z.string().trim().min(1).max(120),
  room: z.string().trim().max(120).nullish(),
  teacher: z.string().trim().max(120).nullish(),
}).refine((v) => v.endTime > v.startTime, { message: "La fin doit être après le début", path: ["endTime"] });

const confirmSchema = z.object({
  slots: z.array(slotSchema).min(1, "Au moins un créneau est requis"),
  mode: z.enum(["replace", "merge"]).default("replace"),
});

function normalizeSubjectKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ");
}

// POST : confirmation de l'import → écriture en base.
// mode "replace" : supprime les créneaux existants de l'utilisateur qui ne sont
// pas présents dans la nouvelle liste, puis upsert les autres (préserve les IDs
// des créneaux inchangés). mode "merge" : ajoute seulement les créneaux absents.
// Quand le nom de matière correspond à une matière de l'utilisateur (nom,
// abréviation ou alias insensible aux accents), le créneau est relié via
// subjectId. Sans correspondance, le créneau reste exploitable par le planner
// comme créneau protégé sans matière (le nom détecté reste affiché dans
// l'aperçu de validation et dans la réponse de confirmation).
export async function POST(request: Request) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  const parsed = confirmSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Données invalides", details: parsed.error.flatten() }, { status: 400 });

  const { slots, mode } = parsed.data;

  // Relie les matières importées aux matières existantes de l'utilisateur.
  const subjects = await prisma.subject.findMany({ where: { userId }, select: { id: true, name: true, shortName: true } });
  const subjectsByKey = new Map<string, string>();
  for (const subject of subjects) {
    subjectsByKey.set(normalizeSubjectKey(subject.name), subject.id);
    if (subject.shortName) subjectsByKey.set(normalizeSubjectKey(subject.shortName), subject.id);
  }
  const subjectIdFor = (value: string | null | undefined) => (value ? subjectsByKey.get(normalizeSubjectKey(value)) ?? null : null);

  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.schedule.findMany({
      where: { userId },
      select: {
        id: true,
        dayOfWeek: true,
        startTime: true,
        endTime: true,
        subjectId: true,
        location: true,
      },
    });
    // Conserver les IDs existants : un créneau est identifié par son jour et sa
    // plage horaire. La matière peut évoluer (liaison créée après l'import),
    // elle n'est donc pas un critère de doublon mais est mise à jour en place.
    const sameDayTimeKey = (dayOfWeek: number, startTime: string, endTime: string) =>
      `${dayOfWeek}|${startTime}|${endTime}`;
    const existingByDayTime = new Map<string, (typeof existing)[number][]>();
    for (const existingEntry of existing) {
      const key = sameDayTimeKey(existingEntry.dayOfWeek, existingEntry.startTime, existingEntry.endTime);
      const group = existingByDayTime.get(key);
      if (group) group.push(existingEntry);
      else existingByDayTime.set(key, [existingEntry]);
    }
    let preserved = 0;
    let created = 0;
    let deleted = 0;

    const parsedSlots = slots.map((slot) => ({
      slot,
      subjectId: subjectIdFor(slot.subject),
      location: slot.room ?? null,
      dayTimeKey: sameDayTimeKey(slot.dayOfWeek, slot.startTime, slot.endTime),
    }));

    if (mode === "replace") {
      // Supprimer les créneaux existants qui ne sont plus dans la nouvelle liste.
      const remainingByDayTime = new Map<string, (typeof existing)[number][]>();
      for (const existingEntry of existing) {
        const key = sameDayTimeKey(existingEntry.dayOfWeek, existingEntry.startTime, existingEntry.endTime);
        const group = remainingByDayTime.get(key);
        if (group) group.push(existingEntry);
        else remainingByDayTime.set(key, [existingEntry]);
      }
      const toDeleteIds = new Set<string>();
      for (const entry of parsedSlots) {
        const group = remainingByDayTime.get(entry.dayTimeKey) ?? [];
        const index = group.findIndex((row) => (row.location ?? "") === (entry.location ?? ""));
        if (index >= 0) group.splice(index, 1);
      }
      for (const group of remainingByDayTime.values()) {
        for (const row of group) toDeleteIds.add(row.id);
      }
      if (toDeleteIds.size) {
        await tx.schedule.deleteMany({ where: { id: { in: [...toDeleteIds] } } });
        deleted = toDeleteIds.size;
      }
    }

    let linked = 0;
    let unlinked = 0;
    for (const entry of parsedSlots) {
      const group = existingByDayTime.get(entry.dayTimeKey) ?? [];
      const matchIndex = group.findIndex((row) => (row.location ?? null) === entry.location);
      const match = matchIndex >= 0 ? group[matchIndex] : undefined;
      if (match) {
        group.splice(matchIndex, 1);
        preserved += 1;
        if ((match.subjectId ?? null) !== entry.subjectId || (match.location ?? null) !== entry.location) {
          await tx.schedule.update({ where: { id: match.id }, data: { subjectId: entry.subjectId ?? null, location: entry.location } });
        }
      } else {
        await tx.schedule.create({
          data: {
            userId,
            dayOfWeek: entry.slot.dayOfWeek,
            startTime: entry.slot.startTime,
            endTime: entry.slot.endTime,
            subjectId: entry.subjectId,
            location: entry.location,
          },
        });
        created += 1;
      }
      if (entry.subjectId) linked += 1;
      else unlinked += 1;
    }
    const total = await tx.schedule.count({ where: { userId } });
    const confirmedSlots = parsedSlots.map((entry) => ({
      dayOfWeek: entry.slot.dayOfWeek,
      startTime: entry.slot.startTime,
      endTime: entry.slot.endTime,
      subjectId: entry.subjectId,
      detectedSubject: entry.slot.subject,
      room: entry.location,
      teacher: entry.slot.teacher ?? null,
    }));
    return { created, preserved, deleted, linked, unlinked, total, slots: confirmedSlots };
  });

  return NextResponse.json({ ok: true, mode, ...result });
}
