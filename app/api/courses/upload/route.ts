import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { allowedCourseMimeTypes, extractCourseText, MAX_COURSE_FILE_SIZE, sourceTypeFor } from "@/services/course-processor";
import { uploadCourseFile } from "@/services/storage";
import { enqueueJob } from "@/services/automation";

const metadataSchema = z.object({ subjectId: z.string().cuid(), chapterId: z.string().cuid().optional(), title: z.string().trim().min(1).max(160).optional() });

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  const user = await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } });
  if (!user) return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 401 });
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Fichier manquant" }, { status: 400 });
  if (file.size > MAX_COURSE_FILE_SIZE) return NextResponse.json({ error: "Fichier trop volumineux (15 Mo maximum)" }, { status: 413 });
  if (!allowedCourseMimeTypes.has(file.type)) return NextResponse.json({ error: "Format non supporté" }, { status: 415 });
  const metadata = metadataSchema.safeParse({ subjectId: form.get("subjectId"), chapterId: form.get("chapterId") || undefined, title: form.get("title") || undefined });
  if (!metadata.success) return NextResponse.json({ error: "Métadonnées invalides", details: metadata.error.flatten() }, { status: 400 });
  const subject = await prisma.subject.findFirst({ where: { id: metadata.data.subjectId, userId: user.id }, select: { id: true } });
  if (!subject) return NextResponse.json({ error: "Matière introuvable" }, { status: 404 });
  if (metadata.data.chapterId && !(await prisma.chapter.findFirst({ where: { id: metadata.data.chapterId, subjectId: subject.id, userId: user.id }, select: { id: true } }))) return NextResponse.json({ error: "Chapitre introuvable" }, { status: 404 });
  const content = await extractCourseText(file);
  const key = `${user.id}/courses/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  const fileUrl = await uploadCourseFile(key, file);
  const course = await prisma.course.create({ data: { userId: user.id, subjectId: metadata.data.subjectId, chapterId: metadata.data.chapterId, title: metadata.data.title ?? file.name, content, fileUrl, sourceType: sourceTypeFor(file) } });
  const job = await enqueueJob(user.id, "process_course", { courseId: course.id }, `course-process:${course.id}`);
  return NextResponse.json({ course, jobId: job.id, extracted: Boolean(content), stored: Boolean(fileUrl) }, { status: 201 });
}