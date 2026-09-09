import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function currentUserId() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return null;
  return (await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } }))?.id ?? null;
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  const { id } = await params;
  const deleted = await prisma.calendarException.deleteMany({ where: { id, userId } });
  if (deleted.count === 0) return NextResponse.json({ error: "Exception introuvable" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
