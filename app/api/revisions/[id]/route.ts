import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const updateSchema = z.object({ status: z.enum(["planned", "completed", "skipped"]).optional(), notes: z.string().max(2000).nullable().optional(), priority: z.enum(["low", "normal", "high", "critical"]).optional() }).strict();

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  const user = await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } });
  if (!user) return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 401 });
  const { id } = await context.params;
  const parsed = updateSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Données invalides", details: parsed.error.flatten() }, { status: 400 });
  const existing = await prisma.revisionSession.findFirst({ where: { id, userId: user.id } });
  if (!existing) return NextResponse.json({ error: "Révision introuvable" }, { status: 404 });
  const revision = await prisma.revisionSession.update({ where: { id }, data: parsed.data });
  return NextResponse.json(revision);
}