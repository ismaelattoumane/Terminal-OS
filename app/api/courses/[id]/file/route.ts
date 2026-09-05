import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { downloadCourseFile } from "@/services/storage";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  const user = await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } });
  if (!user) return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 401 });
  const { id } = await context.params;
  const course = await prisma.course.findFirst({ where: { id, userId: user.id }, select: { title: true, fileUrl: true } });
  if (!course?.fileUrl) return NextResponse.json({ error: "Fichier introuvable" }, { status: 404 });
  const file = await downloadCourseFile(course.fileUrl);
  if (!file) return NextResponse.json({ error: "Fichier indisponible" }, { status: 404 });
  const filename = course.title.replace(/[\\r\\n\\"]/g, "_") || "cours";
  return new NextResponse(new Uint8Array(file), { headers: { "Content-Type": "application/octet-stream", "Content-Disposition": `attachment; filename="${filename}"`, "Cache-Control": "private, no-store" } });
}
