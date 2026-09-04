import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { deleteRevisionFromGoogleCalendar, syncRevisionToGoogleCalendar } from "@/services/calendar";
import { prisma } from "@/lib/prisma";

async function contextUser() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return null;
  const user = await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } });
  return user && session.googleAccessToken ? { id: user.id, accessToken: session.googleAccessToken } : null;
}

export async function DELETE(_request: Request, context: { params: Promise<{ revisionId: string }> }) {
  const user = await contextUser();
  if (!user) return NextResponse.json({ error: "Authentification ou Google Calendar requis" }, { status: 412 });
  const { revisionId } = await context.params;
  await deleteRevisionFromGoogleCalendar(user.accessToken, revisionId, user.id);
  return new NextResponse(null, { status: 204 });
}

export async function POST(_request: Request, context: { params: Promise<{ revisionId: string }> }) {
  const user = await contextUser();
  if (!user) return NextResponse.json({ error: "Authentification ou Google Calendar requis" }, { status: 412 });
  const { revisionId } = await context.params;
  const eventId = await syncRevisionToGoogleCalendar(user.accessToken, revisionId, user.id);
  return NextResponse.json({ eventId });
}