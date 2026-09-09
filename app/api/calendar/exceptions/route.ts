import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const exceptionSchema = z.object({
  date: z.coerce.date(),
  type: z.enum(["holiday", "vacation", "no_class", "exceptional"]),
  label: z.string().trim().max(120).optional(),
});

async function currentUserId() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return null;
  return (await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } }))?.id ?? null;
}

export async function GET() {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  const exceptions = await prisma.calendarException.findMany({ where: { userId }, orderBy: { date: "asc" } });
  return NextResponse.json(exceptions);
}

export async function POST(request: Request) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  const parsed = exceptionSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Données invalides", details: parsed.error.flatten() }, { status: 400 });
  // Un seul exception par jour : upsert sur la contrainte unique (userId, date).
  const dateOnly = new Date(Date.UTC(parsed.data.date.getUTCFullYear(), parsed.data.date.getUTCMonth(), parsed.data.date.getUTCDate()));
  const exception = await prisma.calendarException.upsert({
    where: { userId_date: { userId, date: dateOnly } },
    update: { type: parsed.data.type, label: parsed.data.label ?? null },
    create: { userId, date: dateOnly, type: parsed.data.type, label: parsed.data.label ?? null },
  });
  return NextResponse.json(exception, { status: 201 });
}
