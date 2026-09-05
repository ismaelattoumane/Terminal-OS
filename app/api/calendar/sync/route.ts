import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { importGoogleCalendarEvents, syncRevisionToGoogleCalendar } from "@/services/calendar";
import { auditLog } from "@/lib/audit";

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  if (!session.googleAccessToken) return NextResponse.json({ error: "Google Calendar n'est pas connecté" }, { status: 412 });
  const user = await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } });
  if (!user) return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 401 });
  const revisions = await prisma.revisionSession.findMany({ where: { userId: user.id, status: { not: "skipped" } }, select: { id: true } });
  const synced: string[] = [];
  for (const revision of revisions) synced.push(await syncRevisionToGoogleCalendar(session.googleAccessToken, revision.id, user.id));
  const imported = await importGoogleCalendarEvents(session.googleAccessToken, user.id, new Date());
  // B22 : l'action « calendar.sync » de la légende du journal d'audit existe désormais réellement.
  await auditLog(user.id, "calendar.sync", { synced: synced.length, imported });
  return NextResponse.json({ synced: synced.length, imported, eventIds: synced });
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  if (!session.googleAccessToken) return NextResponse.json({ error: "Google Calendar n'est pas connecté" }, { status: 412 });
  const user = await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } });
  if (!user) return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 401 });
  const imported = await importGoogleCalendarEvents(session.googleAccessToken, user.id, new Date());
  await auditLog(user.id, "calendar.sync", { synced: 0, imported, trigger: "get" });
  return NextResponse.json({ imported });
}
