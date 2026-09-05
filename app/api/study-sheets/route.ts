import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAIProvider } from "@/services/ai";
import { getPagination, totalHeader } from "@/lib/pagination";
import { auditLog } from "@/lib/audit";

const schema = z.object({ subjectId: z.string().cuid(), chapterId: z.string().cuid().optional(), courseIds: z.array(z.string().cuid()).min(1), title: z.string().trim().min(1).max(160) });
export async function POST(request: Request) {
  const session = await getServerSession(authOptions); if (!session?.user?.email) return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  const user = await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } }); if (!user) return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 401 });
  const parsed = schema.safeParse(await request.json()); if (!parsed.success) return NextResponse.json({ error: "Données invalides", details: parsed.error.flatten() }, { status: 400 });
  const courses = await prisma.course.findMany({ where: { id: { in: parsed.data.courseIds }, userId: user.id, subjectId: parsed.data.subjectId }, select: { id: true, content: true } });
  if (courses.length !== parsed.data.courseIds.length) return NextResponse.json({ error: "Cours introuvables" }, { status: 404 });
  const content = await getAIProvider().generateStudySheet(courses.map((course) => course.content ?? "").join("\n"));
  const sheet = await prisma.studySheet.create({ data: { userId: user.id, subjectId: parsed.data.subjectId, chapterId: parsed.data.chapterId, title: parsed.data.title, sourceCourseIds: parsed.data.courseIds, content } });
  // B22 : l'action « sheet.generate » de la légende du journal d'audit existe désormais réellement.
  await auditLog(user.id, "sheet.generate", { sheetId: sheet.id, courseCount: parsed.data.courseIds.length, title: sheet.title });
  return NextResponse.json(sheet, { status: 201 });
}

export async function GET(request: Request) { const session = await getServerSession(authOptions); if (!session?.user?.email) return NextResponse.json({ error: "Authentification requise" }, { status: 401 }); const user = await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } }); if (!user) return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 401 }); const { take, skip } = getPagination(new URL(request.url)); const [sheets, total] = await Promise.all([prisma.studySheet.findMany({ where: { userId: user.id }, orderBy: { updatedAt: "desc" }, take, skip }), prisma.studySheet.count({ where: { userId: user.id } })]); return NextResponse.json(sheets, { headers: totalHeader(total) }); }