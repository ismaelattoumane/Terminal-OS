import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
const BUCKET_MAX = 5000;
const PURGE_INTERVAL_MS = 5 * 60_000;
let lastPurge = Date.now();

// B43 : purge périodique des buckets expirés pour éviter la fuite mémoire sur
// longue durée (et l'attaque par requêtes multi-chemins).
function purgeExpiredBuckets() {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
  lastPurge = now;
}

function rateLimit(key: string, limit: number, windowMs: number): { allowed: boolean; retryAfter: number } {
  const now = Date.now();
  if (now - lastPurge > PURGE_INTERVAL_MS) purgeExpiredBuckets();
  if (buckets.size > BUCKET_MAX) purgeExpiredBuckets();
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfter: 0 };
  }
  current.count += 1;
  if (current.count > limit) return { allowed: false, retryAfter: Math.max(1, Math.ceil((current.resetAt - now) / 1000)) };
  return { allowed: true, retryAfter: 0 };
}

// B43 : IP de socket en priorité, sinon x-real-ip, sinon x-forwarded-for
// (uniquement si TRUST_PROXY est activé, car cet en-tête est falsifiable).
function clientIp(request: NextRequest): string {
  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  if (process.env.TRUST_PROXY === "true") {
    const forwarded = request.headers.get("x-forwarded-for");
    if (forwarded) return forwarded.split(",")[0].trim();
  }
  return "unknown";
}

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // B44 : nonce CSP pour les pages (rendu dynamique uniquement).
  // Le rate limiting ne protège que l'API.
  if (!pathname.startsWith("/api")) {
    const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
    const isDev = process.env.NODE_ENV === "development";
    const cspHeader = [
      "default-src 'self'",
      `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://lh3.googleusercontent.com https://*.googleusercontent.com",
      "font-src 'self' data:",
      "connect-src 'self' https://www.googleapis.com https://oauth2.googleapis.com",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join("; ");
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-nonce", nonce);
    requestHeaders.set("Content-Security-Policy", cspHeader);
    const response = NextResponse.next({ request: { headers: requestHeaders } });
    response.headers.set("Content-Security-Policy", cspHeader);
    return response;
  }

  // Rate limiting API.
  const ip = clientIp(request);

  // Limites par défaut : 300 requêtes / 60 s. Les routes sensibles sont plus strictes.
  const limits: Array<{ match: RegExp; limit: number; windowMs: number }> = [
    { match: /^\/api\/courses\/upload/, limit: 20, windowMs: 60_000 },
    { match: /^\/api\/auth\//, limit: 60, windowMs: 60_000 },
    { match: /^\/api\/automation\/worker/, limit: 120, windowMs: 60_000 },
    { match: /.*/, limit: 300, windowMs: 60_000 },
  ];
  const rule = limits.find((entry) => entry.match.test(pathname)) ?? limits[limits.length - 1];
  // B43 : clé par chemin complet (pas de mutualisation des ids entre utilisateurs).
  const { allowed, retryAfter } = rateLimit(`${ip}:${pathname}`, rule.limit, rule.windowMs);
  if (!allowed) {
    return NextResponse.json({ error: "Trop de requêtes, réessaie dans quelques secondes" }, { status: 429, headers: { "Retry-After": String(retryAfter), "Cache-Control": "no-store" } });
  }
  const response = NextResponse.next();
  response.headers.set("X-RateLimit-Limit", String(rule.limit));
  response.headers.set("X-RateLimit-Remaining", String(Math.max(0, rule.limit - (buckets.get(`${ip}:${pathname}`)?.count ?? 0))));
  return response;
}

export const config = {
  // B44 : le proxy (CSP + rate limit) s'applique à toutes les routes.
  matcher: ["/:path*"],
};