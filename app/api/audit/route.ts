import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAuditEntries } from "@/lib/audit";

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  const user = await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } });
  if (!user) return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 401 });
  const limit = Math.min(Math.max(1, Number(new URL(request.url).searchParams.get("limit")) || 100), 300);
  const entries = await getAuditEntries(user.id, limit);
  return NextResponse.json(entries, { headers: { "Cache-Control": "private, no-store" } });
}