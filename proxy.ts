import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

function rateLimit(key: string, limit: number, windowMs: number): { allowed: boolean; retryAfter: number } {
  const now = Date.now();
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfter: 0 };
  }
  current.count += 1;
  if (current.count > limit) return { allowed: false, retryAfter: Math.max(1, Math.ceil((current.resetAt - now) / 1000)) };
  return { allowed: true, retryAfter: 0 };
}

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Ne protège que l'API ; les assets et pages publiques passent sans filtre.
  if (!pathname.startsWith("/api")) return NextResponse.next();

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? request.headers.get("x-real-ip") ?? "unknown";

  // Limites par défaut : 300 requêtes / 60 s. Les routes sensibles sont plus strictes.
  const limits: Array<{ match: RegExp; limit: number; windowMs: number }> = [
    { match: /^\/api\/courses\/upload/, limit: 20, windowMs: 60_000 },
    { match: /^\/api\/auth\//, limit: 60, windowMs: 60_000 },
    { match: /^\/api\/automation\/worker/, limit: 120, windowMs: 60_000 },
    { match: /.*/, limit: 300, windowMs: 60_000 },
  ];
  const rule = limits.find((entry) => entry.match.test(pathname)) ?? limits[limits.length - 1];
  const { allowed, retryAfter } = rateLimit(`${ip}:${pathname.replace(/\/[^/]+$/, "/:id")}`, rule.limit, rule.windowMs);
  if (!allowed) {
    return NextResponse.json({ error: "Trop de requêtes, réessaie dans quelques secondes" }, { status: 429, headers: { "Retry-After": String(retryAfter), "Cache-Control": "no-store" } });
  }
  const response = NextResponse.next();
  response.headers.set("X-RateLimit-Limit", String(rule.limit));
  response.headers.set("X-RateLimit-Remaining", String(Math.max(0, rule.limit - (buckets.get(`${ip}:${pathname.replace(/\/[^/]+$/, "/:id")}`)?.count ?? 0))));
  return response;
}

export const config = {
  matcher: ["/api/:path*"],
};