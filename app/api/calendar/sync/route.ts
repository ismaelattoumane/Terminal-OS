import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { syncRevisionToGoogleCalendar } from "@/services/calendar";

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  if (!session.googleAccessToken) return NextResponse.json({ error: "Google Calendar n'est pas connecté" }, { status: 412 });
  const user = await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } });
  if (!user) return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 401 });
  const revisions = await prisma.revisionSession.findMany({ where: { userId: user.id, status: { not: "skipped" } }, select: { id: true } });
  const synced: string[] = [];
  for (const revision of revisions) synced.push(await syncRevisionToGoogleCalendar(session.googleAccessToken, revision.id, user.id));
  return NextResponse.json({ synced: synced.length, eventIds: synced });
}