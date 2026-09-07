import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { prisma } from "@/lib/prisma";

/**
 * Persiste les jetons Google sur la ligne Utilisateur (best effort) pour que le
 * worker/cron puisse synchroniser le calendrier sans session navigateur. Ne
 * contient aucune donnée sensible exposée au client : le callback `session` ne
 * renvoie que l'access token courant, jamais le refresh token.
 */
async function persistGoogleTokens(email: string | null | undefined, data: { accessToken?: string; refreshToken?: string; expiresAt?: number }) {
  if (!email) return;
  try {
    await prisma.user.updateMany({
      where: { email },
      data: {
        ...(data.accessToken ? { googleAccessToken: data.accessToken } : {}),
        ...(data.refreshToken ? { googleRefreshToken: data.refreshToken } : {}),
        ...(data.expiresAt ? { googleAccessTokenExpiresAt: new Date(data.expiresAt) } : {}),
      },
    });
  } catch {
    // Best effort : la session reste fonctionnelle même si la persistance échoue.
  }
}

export const authOptions: NextAuthOptions = {
  // next-auth v4 lit uniquement NEXTAUTH_SECRET (pas AUTH_SECRET, nom v5) :
  // sans cette clé, MissingSecret est levée en production (B01).
  secret: process.env.NEXTAUTH_SECRET,
  session: { strategy: "jwt" },
  providers: process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
    ? [GoogleProvider({ clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET, authorization: { params: { scope: "openid email profile https://www.googleapis.com/auth/calendar.events", access_type: "offline", prompt: "consent" } } })]
    : [],
  pages: { signIn: "/login" },
  callbacks: {
    async jwt({ token, account }) {
      if (account?.access_token) {
        token.googleAccessToken = account.access_token;
        token.googleRefreshToken = account.refresh_token;
        token.googleAccessTokenExpiresAt = account.expires_at ? account.expires_at * 1000 : Date.now() + 3_600_000;
        await persistGoogleTokens(token.email, { accessToken: account.access_token, refreshToken: account.refresh_token ?? undefined, expiresAt: token.googleAccessTokenExpiresAt as number });
      }
      if (token.googleAccessToken && token.googleAccessTokenExpiresAt && Date.now() < token.googleAccessTokenExpiresAt - 60_000) return token;
      if (!token.googleRefreshToken) return token;
      const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID ?? "", client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "", grant_type: "refresh_token", refresh_token: token.googleRefreshToken }) });
      if (!response.ok) return { ...token, googleAccessToken: undefined, googleRefreshToken: undefined };
      const refreshed = await response.json() as { access_token: string; expires_in?: number; refresh_token?: string };
      token.googleAccessToken = refreshed.access_token;
      token.googleAccessTokenExpiresAt = Date.now() + (refreshed.expires_in ?? 3600) * 1000;
      // B34 : Google peut renouveler le refresh_token ; on le persiste s'il est
      // présent pour éviter la perte de connexion à terme.
      if (refreshed.refresh_token) token.googleRefreshToken = refreshed.refresh_token;
      await persistGoogleTokens(token.email, { accessToken: refreshed.access_token, refreshToken: refreshed.refresh_token ?? undefined, expiresAt: token.googleAccessTokenExpiresAt as number });
      return token;
    },
    async session({ session, token }) {
      session.googleAccessToken = token.googleAccessToken;
      return session;
    },
    async signIn({ user }) {
      if (!user.email) return false;
      await prisma.user.upsert({ where: { email: user.email }, update: { name: user.name, image: user.image }, create: { email: user.email, name: user.name, image: user.image } });
      return true;
    },
  },
};