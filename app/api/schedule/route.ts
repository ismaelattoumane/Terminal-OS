import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const scheduleSchema = z.object({ dayOfWeek: z.number().int().min(0).max(6), startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), subjectId: z.string().cuid().optional(), location: z.string().trim().max(120).optional() }).refine((value) => value.endTime > value.startTime, { message: "La fin doit être après le début", path: ["endTime"] });

async function currentUserId() { const session = await getServerSession(authOptions); if (!session?.user?.email) return null; return (await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } }))?.id ?? null; }

export async function GET() { const userId = await currentUserId(); if (!userId) return NextResponse.json({ error: "Authentification requise" }, { status: 401 }); return NextResponse.json(await prisma.schedule.findMany({ where: { userId }, include: { subject: true }, orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }] })); }
export async function POST(request: Request) {
  const userId = await currentUserId(); if (!userId) return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  const parsed = scheduleSchema.safeParse(await request.json()); if (!parsed.success) return NextResponse.json({ error: "Données invalides", details: parsed.error.flatten() }, { status: 400 });
  if (parsed.data.subjectId && !(await prisma.subject.findFirst({ where: { id: parsed.data.subjectId, userId }, select: { id: true } }))) return NextResponse.json({ error: "Matière introuvable" }, { status: 404 });
  return NextResponse.json(await prisma.schedule.create({ data: { ...parsed.data, userId } }), { status: 201 });
}