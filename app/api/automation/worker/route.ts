import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { processNextJob } from "@/services/automation";

export async function POST(request: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected || request.headers.get("authorization") !== `Bearer ${expected}`) return NextResponse.json({ error: "Accès refusé" }, { status: 401 });
  const users = await prisma.user.findMany({ where: { automationJobs: { some: { status: { in: ["pending", "failed"] }, attempts: { lt: 3 } } } }, select: { id: true } });
  const jobIds: string[] = [];
  for (const user of users) { const result = await processNextJob(user.id); if (result) jobIds.push(result.id); }
  return NextResponse.json({ processed: jobIds.length, jobIds });
}