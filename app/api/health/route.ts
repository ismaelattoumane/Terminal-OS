import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkStorage } from "@/services/storage";

const startedAt = Date.now();

export async function GET(request: Request) {
  // B40 : la version détaillée (mémoire, config, uptime) n'est exposée qu'avec
  // un secret (header x-health-secret ou ?secret=) pour éviter la fuite d'infos
  // système en clair. La version publique reste légère.
  const url = new URL(request.url);
  const wantsDetailed = url.searchParams.get("detailed") === "1";
  const secret = request.headers.get("x-health-secret") ?? url.searchParams.get("secret");
  const detailedAllowed = Boolean(process.env.CRON_SECRET) && secret === process.env.CRON_SECRET;
  let database = "ok";
  try { await prisma.$queryRaw`SELECT 1`; } catch { database = "error"; }
  if (!wantsDetailed || !detailedAllowed) {
    return NextResponse.json(
      { status: database === "ok" ? "ok" : "degraded", database, timestamp: new Date().toISOString() },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
  const memory = process.memoryUsage();
  const storage = await checkStorage();
  return NextResponse.json(
    {
      status: database === "ok" ? "ok" : "degraded",
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
      timestamp: new Date().toISOString(),
      database,
      storage: { configured: storage.configured, reachable: storage.reachable, bucket: storage.bucket, region: storage.region },
      googleCalendarConfigured: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
      memory: { rss: memory.rss, heapUsed: memory.heapUsed, heapTotal: memory.heapTotal },
      environment: process.env.NODE_ENV,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}