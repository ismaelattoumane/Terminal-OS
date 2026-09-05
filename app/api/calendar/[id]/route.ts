import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// B11 : suppression d'un événement du calendrier par son id.
export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  const user = await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } });
  if (!user) return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 401 });
  const { id } = await context.params;
  const existing = await prisma.event.findFirst({ where: { id, userId: user.id }, select: { id: true, source: true } });
  if (!existing) return NextResponse.json({ error: "Événement introuvable" }, { status: 404 });
  await prisma.event.delete({ where: { id } });
  return new NextResponse(null, { status: 204 });
}
