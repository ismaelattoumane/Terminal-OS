# Rapport d'audit — état courant

> Audit statique réalisé le 05/09/2026 sur le code, les routes API, Prisma, PWA et la documentation. Vérifications : `npm run build` ✅, `npx tsc --noEmit` ✅, `npm run db:validate` ✅. `npm run lint` réussit avec 6 avertissements. Les 46 défauts de la version précédente ont été corrigés par les commits `83ab8ab` à `57c64bb`; seuls les défauts restants sont consignés ici.

**Gravité :** 🔴 critique · 🟠 majeur · 🟡 modéré · 🔵 mineur

| Gravité | Nombre |
|---|---:|
| 🔴 | 0 |
| 🟠 | 0 |
| 🟡 | 1 |
| 🔵 | 4 |
| **Total** | **5** |

## 🔴 Critique

Aucun défaut critique ouvert. C01 a été corrigé dans le commit `fix(critique): sécuriser les relations des flashcards`.

## 🟠 Majeurs — corrigés

Les points M01 à M06 ci-dessous sont conservés pour traçabilité. Ils sont corrigés dans les commits dédiés aux gravités critique et majeure.

### M01 — Une évaluation accepte des chapitres d'une autre matière

- **Où :** `app/api/evaluations/route.ts:28-30`.
- **Preuve :** les chapitres sont filtrés par utilisateur mais pas par `subjectId`.
- **Impact :** le planner calcule avec la maîtrise d'une autre matière, tandis que les sessions créées sont rattachées à la matière de l'évaluation.
- **Correctif :** filtrer les chapitres aussi par `subjectId: data.subjectId`.

### M02 — Une fiche peut référencer un chapitre incohérent ou externe

- **Où :** `app/api/study-sheets/route.ts`, `services/automation.ts` (`handleGenerateStudySheet`).
- **Preuve :** `chapterId` est écrit sans contrôle d'appartenance ni cohérence avec `subjectId`; le handler de job répète le défaut.
- **Impact :** relations incohérentes et fiches détachées lors de la suppression d'un chapitre non lié.
- **Correctif :** valider le chapitre par `{ id, userId, subjectId }` dans un validateur partagé.

### M03 — Supprimer un événement Google local ne le supprime pas chez Google

- **Où :** `components/calendar-workspace.tsx`, `app/api/calendar/[id]/route.ts`.
- **Preuve :** la corbeille est offerte aux événements `source: "google"`; la route supprime seulement la ligne PostgreSQL. L'import suivant recrée l'événement avec le même `externalId`.
- **Impact :** la suppression paraît réussie puis l'événement réapparaît.
- **Correctif :** empêcher la suppression d'un événement importé, ou supprimer d'abord l'événement distant via l'API Google.

### M04 — Déplacer une évaluation peut effacer son planning sans signaler l'échec

- **Où :** `app/api/evaluations/[id]/route.ts:20-24`.
- **Preuve :** les sessions planifiées sont supprimées avant `regenerateRevisionPlan`; l'exception est avalée et la route répond 200.
- **Impact :** après incident DB/planner, l'évaluation reste sans révisions et l'utilisateur croit la mise à jour réussie.
- **Correctif :** transaction ou réponse explicite `planRegenerated: false`, traitée par l'UI.

### M05 — Les documents importés sont stockés mais inaccessibles à l'utilisateur

- **Où :** `services/storage.ts`, upload de cours et UI Cours.
- **Preuve :** `Course.fileUrl` reçoit une URI `s3://…`; aucune route de téléchargement, URL présignée ou lien UI n'existe. `publicFileUrl` n'est jamais appelé.
- **Impact :** impossible de relire/récupérer le PDF ou DOCX original.
- **Correctif :** route authentifiée de téléchargement (stream ou URL présignée) et lien dans le détail du cours.

### M06 — Le rate limit est partagé ou falsifiable selon l'hébergeur

- **Où :** `proxy.ts:35-42,77`.
- **Preuve :** sans `x-real-ip`, la clé est `unknown:pathname` pour tous les visiteurs. Avec cet en-tête, sa valeur est acceptée sans chaîne de proxy de confiance.
- **Impact :** faux 429 globaux et contournement/usurpation de bucket.
- **Correctif :** WAF/Redis ou proxy explicitement approuvé; ne faire confiance qu'aux en-têtes injectés par lui.

## 🟡 Modérés — majoritairement corrigés

D01, D02, D04 et D05 sont corrigés dans `fix(modéré): fiabiliser les données et l'observabilité`. D03 reste ouvert : la file différée ne peut pas stocker un fichier `FormData` sans une implémentation IndexedDB dédiée.

### D01 — Une note peut être reliée à une évaluation d'une autre matière

- **Où :** `app/api/grades/route.ts:39-40`.
- **Preuve :** l'évaluation est contrôlée par utilisateur, pas par matière.
- **Correctif :** ajouter `subjectId: parsed.data.subjectId` au filtre.

### D02 — Au-delà de 200 éléments, l'interface perd des données sans le dire

- **Où :** `lib/pagination.ts` et chargements initiaux des workspaces.
- **Preuve :** les GET sont limités à 200; la plupart des `fetch` initiaux ignorent `X-Total-Count`, n'envoient pas `offset` et ne montrent aucun contrôle de pagination.
- **Impact :** cours, révisions, fiches et événements anciens deviennent invisibles.
- **Correctif :** pagination/infinite scroll avec `fetchJsonWithLimit` partout.

### D03 — La synchronisation hors ligne ne couvre pas les imports de fichiers

- **Où :** `components/phase-one-workspace.tsx:70`, `lib/offline-queue.ts:82-90`.
- **Preuve :** la file ne sérialise que les corps texte; l'import `FormData` utilise un `fetch` ordinaire.
- **Impact :** import perdu sans réseau, contrairement aux promesses PWA appliquées aux mutations JSON.
- **Correctif :** l'indiquer clairement ou implémenter une file IndexedDB de blobs/FormData.

### D04 — La suppression de cours peut désynchroniser base et S3

- **Où :** `app/api/courses/[id]/route.ts:30-31`.
- **Preuve :** S3 est effacé avant la ligne DB, sans compensation; l'échec S3 est ignoré.
- **Impact :** original perdu si la DB échoue, ou objet S3 orphelin si S3 échoue.
- **Correctif :** nettoyage asynchrone idempotent via job/outbox, journalisé et rejouable.

### D05 — La documentation de santé est obsolète

- **Où :** `README.md`, `DEPLOYMENT.md` vs `app/api/health/route.ts`.
- **Preuve :** les docs promettent uptime, mémoire et S3 en public, mais la route publique ne renvoie plus que statut/base/timestamp. Le détail requiert `detailed=1` et `CRON_SECRET`.
- **Correctif :** documenter les deux réponses et recommander le header `x-health-secret`, pas le secret dans l'URL.

## 🔵 Mineurs

### Q01 — Six avertissements ESLint

- **Où :** `app/api/statistics/route.ts`, `app/login/page.tsx`, `app/login/login-button.tsx`, `components/phase-one-workspace.tsx`, `services/grades.ts`.
- **Preuve :** imports/paramètres inutilisés : `weightedAverageOn20`, `signIn`, `ArrowRight`, `Terminal`, `create`, `prisma`.
- **Correctif :** les supprimer pour garder une CI sans bruit.

### Q02 — La procédure Docker ne peut pas fonctionner

- **Où :** `DEPLOYMENT.md` et racine du dépôt.
- **Preuve :** le guide donne `docker build -t terminal-os .`, mais il n'existe aucun `Dockerfile`.
- **Correctif :** ajouter/tester un Dockerfile multi-stage ou supprimer l'instruction.

### Q03 — `workloadBySubject` est calculé mais jamais rendu

- **Où :** `app/api/statistics/route.ts:49-53`, `components/statistics-workspace.tsx`.
- **Impact :** calcul et payload morts.
- **Correctif :** afficher la charge par matière ou retirer ce champ.

### Q04 — `GET /api/calendar/sync` a un effet de bord sans audit

- **Où :** `app/api/calendar/sync/route.ts:23-30`.
- **Preuve :** le GET importe Google mais seul le POST écrit `calendar.sync` dans l'audit.
- **Correctif :** auditer les deux voies ou réserver l'import au POST.

## Vérifié conforme

- Build Next 16.3.4, TypeScript et schéma Prisma valides; Proxy détecté comme middleware.
- Les 46 défauts précédemment documentés (secret next-auth, devoirs/notes, création de révision et flashcards, planning, fuseaux, CSP, PWA, etc.) sont corrigés dans l'état audité.
- Les routes API vérifiées isolent bien leurs lectures et suppressions principales par `userId`; les défauts ci-dessus concernent les relations créées à partir d'identifiants fournis par le client.
