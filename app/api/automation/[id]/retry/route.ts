import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { auditLog } from "@/lib/audit";
import { processNextJob, retryJob } from "@/services/automation";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  const user = await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } });
  if (!user) return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 401 });
  const { id } = await context.params;
  try {
    await auditLog(user.id, "job.retry", { jobId: id });
    await retryJob(user.id, id);
    const processed = await processNextJob(user.id);
    return NextResponse.json({ processed: processed ? { id: processed.id, status: processed.status } : null });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Relance impossible" }, { status: 400 });
  }
}