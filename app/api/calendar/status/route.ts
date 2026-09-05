import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  const configured = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  const redirectUri = process.env.GOOGLE_REDIRECT_URI ?? `${process.env.NEXTAUTH_URL ?? ""}/api/auth/callback/google`;
  return NextResponse.json({
    connected: Boolean(session.googleAccessToken),
    configured,
    redirectUri,
    callbackMatchesNextAuth: redirectUri.endsWith("/api/auth/callback/google"),
    scopes: ["openid", "email", "profile", "https://www.googleapis.com/auth/calendar.events"],
    offlineAccess: true,
    timezone: process.env.CALENDAR_TIMEZONE ?? "Europe/Paris",
    hint: configured ? "Le consentement Google se déroule dans le navigateur au premier connexion." : "Renseigne GOOGLE_CLIENT_ID et GOOGLE_CLIENT_SECRET pour activer la connexion.",
  });
}