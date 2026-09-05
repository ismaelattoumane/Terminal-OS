import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function currentUserId() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return null;
  return (await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } }))?.id ?? null;
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  const { id } = await context.params;
  const sheet = await prisma.studySheet.findFirst({ where: { id, userId }, include: { subject: true, chapter: true } });
  if (!sheet) return NextResponse.json({ error: "Fiche introuvable" }, { status: 404 });
  return NextResponse.json(sheet);
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  const { id } = await context.params;
  const existing = await prisma.studySheet.findFirst({ where: { id, userId }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: "Fiche introuvable" }, { status: 404 });
  await prisma.studySheet.delete({ where: { id } });
  return new NextResponse(null, { status: 204 });
}