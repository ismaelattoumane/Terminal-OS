import { prisma } from "@/lib/prisma";

export type Reminder = {
  id: string;
  type: "evaluation" | "homework" | "revision" | "flashcards";
  severity: "high" | "normal";
  title: string;
  detail: string;
  dueAt: string;
};

function startOfDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function endOfDay(value: Date) {
  const next = startOfDay(value);
  next.setDate(next.getDate() + 1);
  return next;
}

/**
 * Calcule les rappels d'un utilisateur à partir des données PostgreSQL réelles :
 * contrôle proche, devoir urgent/en retard, révision du jour ou en retard, cartes
 * à réviser. Aucune donnée fictive : un rappel n'existe que si une ligne en base
 * le justifie. Calcule à la volée → toujours frais et idempotent (aucune table,
 * aucune écriture parasite). Le worker `generate_reminders` journalise le résultat
 * pour l'observabilité du cron.
 */
export async function collectReminders(userId: string): Promise<Reminder[]> {
  const now = new Date();
  const todayStart = startOfDay(now);

  const [evaluations, homework, revisions, flashcardCount] = await Promise.all([
    prisma.evaluation.findMany({
      where: { userId, status: "planned", date: { gte: todayStart, lt: endOfDay(new Date(todayStart.getTime() + 7 * 86_400_000)) } },
      include: { subject: { select: { name: true } } },
      orderBy: { date: "asc" },
    }),
    prisma.homework.findMany({
      where: { userId, status: { not: "completed" }, dueDate: { lt: endOfDay(new Date(todayStart.getTime() + 8 * 86_400_000)) } },
      include: { subject: { select: { name: true } } },
      orderBy: { dueDate: "asc" },
    }),
    prisma.revisionSession.findMany({
      where: {
        userId,
        status: { in: ["planned", "in_progress"] },
        date: { lt: endOfDay(now) },
      },
      include: { subject: { select: { name: true } } },
      orderBy: { date: "asc" },
    }),
    prisma.flashcard.count({ where: { userId, nextReview: { lte: now } } }),
  ]);

  const reminders: Reminder[] = [];
  const daysUntil = (value: Date) => Math.max(0, Math.ceil((startOfDay(value).getTime() - todayStart.getTime()) / 86_400_000));

  for (const evaluation of evaluations) {
    const days = daysUntil(evaluation.date);
    const label = days === 0 ? "aujourd'hui" : days === 1 ? "demain" : `dans ${days} jours`;
    reminders.push({
      id: `eval-${evaluation.id}`,
      type: "evaluation",
      severity: days <= 2 ? "high" : "normal",
      title: `Contrôle : ${evaluation.title}`,
      detail: `${evaluation.subject.name} · ${label}`,
      dueAt: evaluation.date.toISOString(),
    });
  }

  for (const item of homework) {
    const overdue = item.dueDate < now;
    reminders.push({
      id: `hw-${item.id}`,
      type: "homework",
      severity: overdue ? "high" : "normal",
      title: overdue ? `Devoir en retard : ${item.title}` : `Devoir à rendre : ${item.title}`,
      detail: `${item.subject.name} · échéance ${item.dueDate.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}`,
      dueAt: item.dueDate.toISOString(),
    });
  }

  for (const revision of revisions) {
    const overdue = revision.date < now;
    reminders.push({
      id: `rev-${revision.id}`,
      type: "revision",
      severity: overdue ? "high" : "normal",
      title: overdue ? `Révision en retard : ${revision.title}` : `Révision du jour : ${revision.title}`,
      detail: `${revision.subject.name} · ${revision.duration} min`,
      dueAt: revision.date.toISOString(),
    });
  }

  if (flashcardCount > 0) {
    reminders.push({
      id: "flashcards",
      type: "flashcards",
      severity: "normal",
      title: `${flashcardCount} carte(s) à réviser`,
      detail: "Répétition espacée en attente",
      dueAt: now.toISOString(),
    });
  }

  reminders.sort((a, b) => (a.severity === "high" ? 0 : 1) - (b.severity === "high" ? 0 : 1) || a.dueAt.localeCompare(b.dueAt));
  return reminders.slice(0, 12);
}