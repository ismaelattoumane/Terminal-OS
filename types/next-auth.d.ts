import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session { googleAccessToken?: string; }
}

declare module "next-auth/jwt" {
  interface JWT { googleAccessToken?: string; googleRefreshToken?: string; googleAccessTokenExpiresAt?: number; }
}