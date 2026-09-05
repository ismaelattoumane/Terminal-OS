# 🟡 Données & API — corrections (B23 à B34)

> Incohérences entre le dashboard et les statistiques, données manquantes, et
> synchronisation Google Calendar.

---

## B23 — Deux « moyennes générales » différentes (pondérée vs simple)
**Fichier créé :** `services/grades.ts`
**Fichiers modifiés :** `app/api/dashboard/route.ts`, `app/api/statistics/route.ts`
Service partagé `weightedAverageOn20(grades)` (note/barème × 20 × coef / somme coefs) utilisé par le dashboard ET les statistiques → un seul chiffre cohérent.

## B24 — `workloadBySubject` factice (toujours 0)
**Fichiers modifiés :** `app/api/statistics/route.ts`
La charge par matière est calculée à partir des sessions `planned` réelles groupées par `subjectId` (ajout de `subjectId` au `select` des révisions).

## B25 — `quizAttempt.subjectId` jamais renseigné
**Fichier modifié :** `app/api/quizzes/attempt/route.ts`
Le `subjectId` du chapitre est désormais écrit à la création de la tentative.

## B26 — `subjectStats` renvoyé par le dashboard mais jamais consommé
**Fichier modifié :** `app/api/dashboard/route.ts`
Suppression du champ mort `subjectStats` (et du `grades` inutile dans l'include des matières).

## B27 — Pagination jamais exploitée (`X-Total-Count` ignoré)
**Fichier créé :** `lib/api-client.ts`
**Fichier modifié :** `components/phase-one-workspace.tsx`
Utilitaire `fetchJsonWithLimit` qui expose `items`, `total` et `truncated`. L'écran Phase 1 affiche un avertissement quand une liste dépasse 200 éléments.

## B28 — Relancer un job ne traite pas forcément CE job
**Fichiers modifiés :** `services/automation.ts`, `app/api/automation/[id]/retry/route.ts`, `app/api/courses/upload/route.ts`
`processNextJob(userId, jobId?)` peut cibler un job précis (relance) ; utilisé par la route retry et l'upload.

## B29 — File hors ligne : head-of-line blocking + `navigator.onLine` peu fiable
**Fichier modifié :** `lib/offline-queue.ts`
- Une requête 5xx/408/429 est replacée en fin de file au lieu de tout bloquer.
- Mise en file sur échec réseau même si `navigator.onLine === true`.

## B30 — La structuration du cours écrase le contenu original
**Fichiers modifiés :** `prisma/schema.prisma`, `services/automation.ts`
- Ajout du champ `rawContent String?` au modèle `Course` (migration Prisma appliquée).
- `handleProcessCourse` sauvegarde le contenu brut dans `rawContent` avant de le remplacer par la version structurée.

## B31 — Import `.md` : MIME non garanti → 415
**Fichiers modifiés :** `services/course-processor.ts`, `app/api/courses/upload/route.ts`
Acceptation des `.txt/.md/.markdown` par extension (comme pour `.pdf/.docx`), car certains navigateurs envoient `application/octet-stream` ou `""`.

## B32 — Sync Google : fuseau du serveur au lieu de `CALENDAR_TIMEZONE`
**Fichier modifié :** `services/calendar.ts`
Construction des dates via `Intl.DateTimeFormat` + un helper `zonedTimeToUtc` pour interpréter les heures dans `CALENDAR_TIMEZONE` (pas le fuseau du serveur).

## B33 — Événements Google « journées entières » décalés
**Fichier modifié :** `services/calendar.ts`
Les événements `all-day` (champ `date`) sont stockés à minuit/23h59 dans `CALENDAR_TIMEZONE` au lieu d'être calés en UTC (ce qui les décalait d'un cran).

## B34 — Refresh token Google jamais mis à jour
**Fichier modifié :** `lib/auth.ts`
Le `refresh_token` renvoyé par Google lors du rafraîchissement est persisté s'il est présent, pour éviter la perte de connexion.
