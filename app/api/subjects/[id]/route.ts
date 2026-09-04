import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const updateSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  shortName: z.string().trim().min(1).max(12).optional(),
  color: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
  teacher: z.string().trim().max(120).nullable().optional(),
  coefficient: z.number().positive().max(20).optional(),
}).strict();

async function currentUserId() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return null;
  return (await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } }))?.id ?? null;
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  const { id } = await context.params;
  const parsed = updateSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Données invalides", details: parsed.error.flatten() }, { status: 400 });
  const existing = await prisma.subject.findFirst({ where: { id, userId } });
  if (!existing) return NextResponse.json({ error: "Matière introuvable" }, { status: 404 });
  const subject = await prisma.subject.update({ where: { id }, data: parsed.data });
  return NextResponse.json(subject);
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  const { id } = await context.params;
  const existing = await prisma.subject.findFirst({ where: { id, userId }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: "Matière introuvable" }, { status: 404 });
  await prisma.subject.delete({ where: { id } });
  return new NextResponse(null, { status: 204 });
}