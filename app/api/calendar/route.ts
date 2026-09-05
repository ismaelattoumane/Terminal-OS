import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPagination, totalHeader } from "@/lib/pagination";

const eventSchema = z.object({ title: z.string().trim().min(1).max(160), start: z.coerce.date(), end: z.coerce.date(), type: z.enum(["school", "personal", "exam", "homework", "revision"]), source: z.enum(["internal", "google", "notion"]).default("internal"), externalId: z.string().max(255).optional() }).refine((value) => value.end > value.start, { message: "La fin doit être après le début", path: ["end"] });

async function currentUserId() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return null;
  return (await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } }))?.id ?? null;
}

export async function GET(request: Request) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  const url = new URL(request.url);
  const where = { userId, ...(url.searchParams.get("from") ? { start: { gte: new Date(url.searchParams.get("from")!) } } : {}) };
  const { take, skip } = getPagination(url);
  const [events, total] = await Promise.all([
    prisma.event.findMany({ where, orderBy: { start: "asc" }, take, skip }),
    prisma.event.count({ where }),
  ]);
  return NextResponse.json(events, { headers: totalHeader(total) });
}

export async function POST(request: Request) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  const parsed = eventSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Données invalides", details: parsed.error.flatten() }, { status: 400 });
  const event = await prisma.event.create({ data: { ...parsed.data, userId } });
  return NextResponse.json(event, { status: 201 });
}