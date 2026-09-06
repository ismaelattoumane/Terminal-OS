import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { enqueueJob, processNextJob } from "@/services/automation";

const jobSchema = z.object({ type: z.enum(["create_revision_plan", "sync_google_calendar", "process_course", "generate_study_sheet", "generate_flashcards", "generate_quiz", "update_mastery", "recalculate_workload", "generate_reminders"]), payload: z.record(z.string(), z.unknown()).default({}), idempotencyKey: z.string().trim().min(1).max(200).optional() });

async function currentUserId() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return null;
  return (await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } }))?.id ?? null;
}

export async function GET() {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  return NextResponse.json(await prisma.automationJob.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 50 }));
}

export async function POST(request: Request) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  const parsed = jobSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Données invalides", details: parsed.error.flatten() }, { status: 400 });
  const job = await enqueueJob(userId, parsed.data.type, parsed.data.payload, parsed.data.idempotencyKey);
  const processed = new URL(request.url).searchParams.get("process") === "true" ? await processNextJob(userId) : null;
  return NextResponse.json({ job, processed }, { status: 201 });
}