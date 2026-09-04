import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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
  const events = await prisma.event.findMany({ where: { userId, ...(url.searchParams.get("from") ? { start: { gte: new Date(url.searchParams.get("from")!) } } : {}) }, orderBy: { start: "asc" } });
  return NextResponse.json(events);
}

export async function POST(request: Request) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  const parsed = eventSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Données invalides", details: parsed.error.flatten() }, { status: 400 });
  const event = await prisma.event.create({ data: { ...parsed.data, userId } });
  return NextResponse.json(event, { status: 201 });
}