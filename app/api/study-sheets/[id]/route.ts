import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function currentUserId() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return null;
  return (await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } }))?.id ?? null;
}

const stringArray = z.array(z.string().max(1000)).max(50);
const contentSchema = z.object({
  summary: z.string().max(4000).optional(),
  keyIdeas: stringArray.optional(),
  definitions: stringArray.optional(),
  formulas: stringArray.optional(),
  methods: stringArray.optional(),
  commonMistakes: stringArray.optional(),
  examples: stringArray.optional(),
  takeaways: stringArray.optional(),
});
const updateSchema = z.object({ title: z.string().trim().min(1).max(160).optional(), content: contentSchema.optional() }).strict();

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  const { id } = await context.params;
  const sheet = await prisma.studySheet.findFirst({ where: { id, userId }, include: { subject: true, chapter: true } });
  if (!sheet) return NextResponse.json({ error: "Fiche introuvable" }, { status: 404 });
  return NextResponse.json(sheet);
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  const { id } = await context.params;
  const parsed = updateSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Données invalides", details: parsed.error.flatten() }, { status: 400 });
  const existing = await prisma.studySheet.findFirst({ where: { id, userId }, select: { id: true, content: true } });
  if (!existing) return NextResponse.json({ error: "Fiche introuvable" }, { status: 404 });
  // Contenu fusionné (édition partielle) puis réellement persisté en base.
  const merged = { ...(existing.content as object), ...(parsed.data.content ?? {}) };
  const sheet = await prisma.studySheet.update({ where: { id }, data: { title: parsed.data.title, content: merged as object } });
  return NextResponse.json(sheet);
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  const { id } = await context.params;
  const existing = await prisma.studySheet.findFirst({ where: { id, userId }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: "Fiche introuvable" }, { status: 404 });
  await prisma.studySheet.delete({ where: { id } });
  return new NextResponse(null, { status: 204 });
}