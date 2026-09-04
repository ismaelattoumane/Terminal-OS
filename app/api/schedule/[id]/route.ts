import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions); if (!session?.user?.email) return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  const user = await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } }); if (!user) return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 401 });
  const { id } = await context.params; const schedule = await prisma.schedule.findFirst({ where: { id, userId: user.id }, select: { id: true } });
  if (!schedule) return NextResponse.json({ error: "Créneau introuvable" }, { status: 404 }); await prisma.schedule.delete({ where: { id } }); return new NextResponse(null, { status: 204 });
}