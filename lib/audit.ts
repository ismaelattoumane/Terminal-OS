import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

type AuditMeta = Record<string, unknown>;

const MAX_ENTRIES_PER_USER = 300;
const PRUNE_CHANCE = 0.05;

/**
 * Journal d'audit persisté dans PostgreSQL (table `AuditLog`) : les entrées
 * survivent aux redémarrages et sont cohérentes en multi-instances.
 * L'écriture est best-effort — un échec de journalisation ne doit jamais faire
 * échouer la requête métier qui l'a déclenché.
 */
export async function auditLog(actorId: string, action: string, meta: AuditMeta = {}) {
  if (!actorId || !action) return;
  try {
    await prisma.auditLog.create({ data: { userId: actorId, action, meta: meta as Prisma.InputJsonValue } });
    // Élagage occasionnel pour borner la table sans coût à chaque écriture.
    if (Math.random() < PRUNE_CHANCE) {
      const cutoff = await prisma.auditLog.findFirst({
        where: { userId: actorId },
        orderBy: { createdAt: "desc" },
        skip: MAX_ENTRIES_PER_USER - 1,
        select: { createdAt: true },
      });
      if (cutoff) await prisma.auditLog.deleteMany({ where: { userId: actorId, createdAt: { lt: cutoff.createdAt } } });
    }
  } catch (error) {
    console.error("[audit] Journalisation impossible", action, error);
  }
}

export async function getAuditEntries(actorId: string, limit = 100) {
  const safeLimit = Math.min(Math.max(1, Number.isFinite(limit) ? Math.floor(limit) : 100), 300);
  return prisma.auditLog.findMany({
    where: { userId: actorId },
    orderBy: { createdAt: "desc" },
    take: safeLimit,
  });
}