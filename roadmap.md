- [x] Evaluations — modèle, CRUD API, écran de création, édition du titre/date, annulation, action `Terminer` et création automatique des sessions.
- [x] Build après édition et annulation des évaluations
# Terminal OS — Roadmap

Dernière mise à jour : 4 septembre 2026

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

- [~] Connexion OAuth Google Calendar — scope `calendar.events`, consentement offline, refresh token et jeton transmis côté serveur ; configuration locale détectée et callback vérifié, consentement réel à tester dans le navigateur.
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
- [~] Stockage S3 compatible — adaptateur S3 présent et activé par variables d'environnement ; test avec un bucket réel à faire.
- [x] Extraction de texte pour PDF, DOCX et TXT.
- [ ] OCR pour les images.
- [~] Pipeline `UPLOAD -> EXTRACTION -> STRUCTURATION -> COURS` — upload, extraction et création du cours en place ; structuration/OCR à ajouter.
- [~] Jobs relançables pour les traitements longs — l’upload/extraction synchrone est disponible ; le branchement du traitement multipart aux `AutomationJob` reste à faire.

## Phase 5 — IA et apprentissage actif

- [x] Abstraction `AIProvider` avec provider local configurable et remplaçable.
- [x] Mode fonctionnel sans clé IA.
- [x] Génération locale de fiches basée uniquement sur les cours sélectionnés.
- [~] Modèle et interface `StudySheet` — modèle et API présents ; écran dédié à créer.
- [x] Modèle et répétition espacée `Flashcard` via `POST /api/flashcards/:id/review`.
- [x] Générateur de quiz à réponse courte local depuis un cours via `/api/quizzes`.
- [x] `QuizAttempt` et mise à jour de la maîtrise via `/api/quizzes/attempt`.
- [~] `MasteryService` — maîtrise alimentée par les tentatives de quiz et sessions ; fusion flashcards/auto-évaluation à approfondir.

### Validation phase 5

- [x] Migration Prisma `study_learning` appliquée.
- [x] API fiches et flashcards compilées et protégées par utilisateur.
- [x] Migration Prisma `quiz_attempts` appliquée et API quiz compilée.

## Phase 6 — PWA et expérience mobile

- [x] Manifest PWA et icône d'installation.
- [x] Service worker et offline fallback.
- [x] Cache limité au shell et exclusion explicite des routes `/api/` sensibles.
- [ ] Synchronisation différée à la reconnexion.
- [ ] Branchement complet du dashboard mobile aux API.
- [ ] Tests sur iPhone, Android, tablette et desktop.

### Validation phase 6

- [x] Manifest généré par `/manifest.webmanifest`.
- [x] Service worker enregistré côté client.
- [x] Build PWA validé.

## Phase 7 — Statistiques, robustesse et déploiement

- [~] Statistiques — moyenne générale, maîtrise moyenne et charge calculées dans `/api/dashboard` ; graphiques, tendances et vues par matière à ajouter.
- [~] Optimisation — build optimisé et architecture de services en place ; cache, pagination, monitoring et performance mobile à mesurer.
- [~] Sécurité — sessions, isolation par `userId`, validation Zod et secrets hors du code en place ; rate limiting, contrôle des fichiers, audit et headers à renforcer.
- [~] Déploiement — architecture cloud-ready et documentation présentes ; PostgreSQL managé, variables cloud, migrations de production et observabilité restent à configurer.

## Prochain jalon recommandé

1. Ajouter l'édition du titre/date et l'annulation des évaluations dans l'interface.
1. Fournir les identifiants OAuth Google et finaliser la connexion utilisateur en environnement réel.
2. Configurer un cron cloud vers `/api/automation/worker` et ajouter les handlers Google/IA au fil des phases concernées.
3. Ajouter les handlers métier spécialisés au worker `AutomationJob` et planifier son exécution.

## Références techniques

- Schéma et relations : [`prisma/schema.prisma`](prisma/schema.prisma)
- Planner : [`services/revision-planner.ts`](services/revision-planner.ts)
- API dashboard : [`app/api/dashboard/route.ts`](app/api/dashboard/route.ts)
- API révisions : [`app/api/revisions/route.ts`](app/api/revisions/route.ts)
- API calendrier : [`app/api/calendar/route.ts`](app/api/calendar/route.ts)
- Configuration locale : [`README.md`](README.md)
