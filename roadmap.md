# Terminal OS — Roadmap

Dernière mise à jour : 5 septembre 2026

Ce document suit l'avancement réel du projet. Une fonctionnalité est marquée **Terminée** uniquement lorsque sa base technique et son usage principal sont disponibles. Une fonctionnalité **Partielle** existe dans le schéma, l'API ou le prototype d'interface, mais nécessite encore une intégration ou une validation complète.

## Légende

- [x] **Terminé** : disponible et validé techniquement.
- [~] **Partiel** : fondation présente, implémentation incomplète.
- [ ] **À faire** : non commencé.

## Phase 1 — Socle applicatif

- [x] Next.js — App Router initialisé, build de production validé.
- [x] TypeScript — configuration active et vérification TypeScript au build.
- [x] Tailwind CSS — installé et intégré au style de l'application.
- [x] PostgreSQL — instance de développement Docker provisionnée et migration initiale appliquée.
- [x] Prisma — schéma multi-utilisateur et client Prisma généré.
- [x] Auth — Auth.js/NextAuth, `SessionProvider`, écran `/login`, connexion/déconnexion Google, création automatique du compte Prisma et routes protégées.
- [x] Layout — layout Terminal OS avec sidebar desktop, navigation mobile et responsive design.
- [x] Dashboard — interface responsive alimentée par `/api/dashboard`, prochain contrôle calculé, charge/progression réelles, états sans session et actions de complétion des révisions.
- [x] Subjects — modèle Prisma, CRUD API sécurisé et écran de création/liste avec suppression.
- [x] Chapters — modèle Prisma, CRUD API sécurisé et écran de création/liste avec suppression.
- [x] Courses — modèle Prisma, CRUD API sécurisé et écran de création/liste de cours texte ; import de fichiers réservé à la phase 4.
- [x] Evaluations — modèle, CRUD API, validation de propriété matière/chapitres, création automatique des sessions, édition titre/date, annulation, terminaison et suppression.
- [x] RevisionSessions — modèle, création/liste/mise à jour API et écran de liste avec actions `Terminée` et `Ignorer`.

### Validation phase 1

- [x] `npm run lint`
- [x] `npm run build`
- [x] `npm run db:generate`
- [x] `DATABASE_URL="..." npm run db:validate`
- [x] Première migration PostgreSQL avec une base réelle de développement
- [x] Build après branchement du dashboard dynamique
- [x] Build après ajout de l'authentification et des écrans CRUD
- [x] Build après ajout des actions de statut des révisions
- [x] Build après ajout de l'action de statut des évaluations
- [x] Build après finalisation Auth, Dashboard et Evaluations
- [x] Migration et build après ajout de l’idempotence AutomationJob

## Phase 2 — Automatisation et calendrier interne

- [x] RevisionPlanner — calcul des étapes selon date du contrôle, difficulté, importance, maîtrise, jours disponibles et charge existante.
- [x] Automatisations — `AutomationJob` idempotent, API `/api/automation`, déclenchement automatique des recalculs après évaluation, revendication atomique, limite de trois tentatives, journalisation, handlers locaux et endpoint cron protégé `/api/automation/worker`.
- [x] Calendrier interne — modèles `Schedule` et `Event`, routes `/api/calendar` et `/api/schedule`, vue calendrier, création d'événements, suppression de créneaux et intégration des périodes occupées dans le planner.

## Phase 3 — Google Calendar

- [x] Connexion OAuth Google Calendar — scope `calendar.events`, consentement offline, refresh token et jeton transmis côté serveur ; configuration locale détectée (`/api/calendar/status`) et callback vérifié, bouton « Connecter » et synchronisation dans l'interface calendrier ; consentement réel restant à valider dans le navigateur avec un compte Google.
- [x] Service `CalendarService` séparé dans `services/calendar.ts`.
- [x] Création d'événements pour les `RevisionSession` via `/api/calendar/sync`.
- [x] Modification sans doublons via `calendarEventId` et suppression individuelle via `/api/calendar/sync/:revisionId`.
- [x] Synchronisation aller-retour et gestion des erreurs — synchronisation sortante et import Google idempotent via `GET/POST /api/calendar/sync`, avec réponses d'erreur explicites ; test réel du flux complet à poursuivre selon les événements du compte.

### Tests phase 3

- [x] `/login` répond `200`.
- [x] Le fournisseur Google et son callback sont exposés par Auth.js.
- [x] Le endpoint CSRF Auth.js répond `200`.
- [x] Les routes protégées répondent `401` sans session.
- [x] Consentement OAuth et connexion Google testés dans le navigateur.
- [ ] Test de synchronisation avec un événement Google réel.

## Phase 4 — Import et stockage des cours

- [x] Upload PDF, PNG, JPG, DOCX et TXT avec limite de 15 Mo et validation serveur.
- [x] Stockage S3 compatible — adaptateur S3 renforcé (upload, lecture, suppression, existence, health) et activé par variables d'environnement ; test local MinIO documenté ; validation avec un bucket réel à faire dans un environnement cloud.
- [x] Extraction de texte pour PDF, DOCX et TXT.
- [x] OCR pour les images — `tesseract.js` embarqué (`services/ocr.ts`), rejoué par le job `process_course` via le fichier relu depuis S3.
- [x] Pipeline `UPLOAD -> EXTRACTION -> STRUCTURATION -> COURS` — upload, extraction, structuration Markdown et création du cours en place ; OCR pour les images branché sur le job de traitement.
- [x] Jobs relançables pour les traitements longs — le traitement multipart est branché aux `AutomationJob` (handler `process_course`) ; `POST /api/automation/:id/retry`, écran Automatisations et traitements planifiés (`create_revision_plan`, fiches, flashcards, maîtrise) exécutés par le worker cron.

## Phase 5 — IA et apprentissage actif

- [x] Abstraction `AIProvider` avec provider local configurable et remplaçable.
- [x] Mode fonctionnel sans clé IA.
- [x] Génération locale de fiches basée uniquement sur les cours sélectionnés.
- [x] Modèle et interface `StudySheet` — modèle et API présents ; écran dédié (création multi-cours, détail, suppression) dans l'espace Fiches.
- [x] Modèle et répétition espacée `Flashcard` via `POST /api/flashcards/:id/review`.
- [x] Générateur de quiz à réponse courte local depuis un cours via `/api/quizzes`.
- [x] `QuizAttempt` et mise à jour de la maîtrise via `/api/quizzes/attempt`.
- [x] `MasteryService` — maîtrise alimentée par les tentatives de quiz, sessions et flashcards avec pondération et récence ; branchement dans les routes quiz/flashcards ; écran Quiz d'auto-évaluation.

### Validation phase 5

- [x] Migration Prisma `study_learning` appliquée.
- [x] API fiches et flashcards compilées et protégées par utilisateur.
- [x] Migration Prisma `quiz_attempts` appliquée et API quiz compilée.

## Phase 6 — PWA et expérience mobile

- [x] Manifest PWA et icône d'installation.
- [x] Service worker et offline fallback.
- [x] Cache limité au shell et exclusion explicite des routes `/api/` sensibles.
- [x] Synchronisation différée à la reconnexion — file d'attente locale des mutations (`lib/offline-queue.ts`, 50 requêtes max, TTL 24 h), rejeu automatique à la reconnexion (`online`, retour d'onglet, Background Sync `os-sync` du service worker) et rafraîchissement des écrans via l'événement `os:online` ; les écrans Dashboard, Cours, Évaluations et Révisions rejouent leurs actions hors ligne.
- [x] Branchement complet du dashboard mobile aux API — échéances (évaluations + devoirs) et chapitre « focus » alimentées par `/api/dashboard` (nouveau champ `focus` calculé côté serveur), date et prénom réels, bandeau de jours dynamique, liens des panneaux fonctionnels, action rapide connectée aux sections et menu mobile listant toutes les sections.
- [ ] Tests sur iPhone, Android, tablette et desktop — build et responsive validés, tests sur appareils réels restant à effectuer manuellement.

### Validation phase 6

- [x] Manifest généré par `/manifest.webmanifest`.
- [x] Service worker enregistré côté client.
- [x] Build PWA validé.
- [x] Build après file de synchronisation PWA et branchement complet du dashboard mobile.

## Phase 7 — Statistiques, robustesse et déploiement

- [x] Statistiques — moyenne générale, maîtrise moyenne et charge calculées dans `/api/dashboard` ; `/api/statistics` (tendances, sessions par semaine, quiz récents) et écran graphiques par matière.
- [x] Optimisation — build optimisé et architecture de services en place ; pagination (`limit`/`offset`, `X-Total-Count`), cache `no-store` sur les données, `/api/health` pour le monitoring ; performance mobile à mesurer sur appareils réels.
- [x] Sécurité — sessions, isolation par `userId`, validation Zod et secrets hors du code en place ; rate limiting `proxy.ts`, contrôle des fichiers par magic bytes, journal d'audit et headers (CSP, HSTS, COOP) renforcés.
- [x] Déploiement — architecture cloud-ready et `DEPLOYMENT.md` (Vercel, Render, Railway, Docker) ; `npm run db:deploy` pour les migrations ; PostgreSQL managé et observabilité `/api/health` à configurer sur le compte cloud.

### Validation phase 7

- [x] Migration `20260905090000_audit_log` appliquée — journal d'audit persisté dans la table `AuditLog` (écriture best-effort, élagage à 300 événements/utilisateur), `/api/audit` lu en base, test de fumée validé sur la base locale.

## Prochain jalon recommandé

1. Fournir les identifiants OAuth Google et valider le consentement réel dans le navigateur, puis tester la synchronisation avec un événement Google réel.
2. Configurer un cron cloud vers `/api/automation/worker` et un PostgreSQL managé ; appliquer `npm run db:deploy` en production.
3. Tester le stockage S3 avec un bucket réel (MinIO local déjà documenté) et brancher `AI_API_KEY` sur un provider distant.
4. Mesurer la performance mobile sur iPhone/Android/tablette et réaliser les tests d'appareils de la phase 6.

## Références techniques

- Schéma et relations : [`prisma/schema.prisma`](prisma/schema.prisma)
- Planner : [`services/revision-planner.ts`](services/revision-planner.ts)
- Pipeline cours : [`services/course-processor.ts`](services/course-processor.ts), [`services/ocr.ts`](services/ocr.ts), [`services/automation.ts`](services/automation.ts)
- Maîtrise : [`services/mastery.ts`](services/mastery.ts)
- Stockage : [`services/storage.ts`](services/storage.ts)
- File de synchronisation hors ligne : [`lib/offline-queue.ts`](lib/offline-queue.ts)
- Journal d'audit : [`lib/audit.ts`](lib/audit.ts)
- API dashboard : [`app/api/dashboard/route.ts`](app/api/dashboard/route.ts)
- API statistiques : [`app/api/statistics/route.ts`](app/api/statistics/route.ts)
- API révisions : [`app/api/revisions/route.ts`](app/api/revisions/route.ts)
- API calendrier : [`app/api/calendar/route.ts`](app/api/calendar/route.ts)
- Recherche de l'avancement réel : [`roadmap.md`](roadmap.md)
- Déploiement : [`DEPLOYMENT.md`](DEPLOYMENT.md)
- Configuration locale : [`README.md`](README.md)
