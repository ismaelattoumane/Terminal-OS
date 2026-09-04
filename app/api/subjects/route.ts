import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const subjectSchema = z.object({
  name: z.string().trim().min(1).max(80),
  shortName: z.string().trim().min(1).max(12),
  color: z.string().regex(/^#[0-9a-f]{6}$/i).default("#f27645"),
  teacher: z.string().trim().max(120).optional(),
  coefficient: z.number().positive().max(20).default(1),
});

async function getUserId() {
  const session = await getServerSession(authOptions);
  return session?.user?.email ? (await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } }))?.id : null;
}

export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  const subjects = await prisma.subject.findMany({ where: { userId }, include: { chapters: true }, orderBy: { name: "asc" } });
  return NextResponse.json(subjects);
}

export async function POST(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  const parsed = subjectSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Données invalides", details: parsed.error.flatten() }, { status: 400 });
  const subject = await prisma.subject.create({ data: { ...parsed.data, userId } });
  return NextResponse.json(subject, { status: 201 });
}