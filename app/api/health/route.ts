import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkStorage } from "@/services/storage";

const startedAt = Date.now();

export async function GET() {
  let database = "ok";
  try { await prisma.$queryRaw`SELECT 1`; } catch { database = "error"; }
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
    { headers: { "Cache-Control": "no-store", "X-Terminal-OS-Health": database === "ok" ? "ok" : "error" } },
  );
}