# PROJECT_AUDIT — Terminal OS

> Audit complet réalisé le 06/09/2026 (base `27d95c1`) avant la refonte. Baseline
> vérifiée au départ : `npm run lint` ✅ · `npx tsc --noEmit` ✅ · `npm run build` ✅.
> PostgreSQL local (`terminal_os`) connecté ✅.

---

## 1. Architecture actuelle

Monolithe Next.js **16.3.4** (App Router) + React 19 + TypeScript 5 + Tailwind 4,
rendu côté client après authentification, avec :

- **Pages** : `/` (application complète en client-side), `/login` (serveur),
  `/manifest.webmanifest` (serveur).
- **Proxy Next 16** (`proxy.ts`) : rate limiting mémoire + CSP à nonce/requête.
- **Auth** : Auth.js (next-auth **v4**, `NEXTAUTH_SECRET`), provider Google optionnel,
  scope `calendar.events` + consentement offline, tokens Google stockés dans le
  jeton de session (refresh automatique dans le callback `jwt`).
- **Base** : Prisma 6 + PostgreSQL. Pas de cache applicatif, pas de queue externe
  (jobs dans la table `AutomationJob`, traités par le worker `/api/automation/worker`).
- **Stockage** : S3 compatible (optionnel, `@aws-sdk/client-s3`), désactivé sans config.
- **PWA** : `public/sw.js` (cache du shell, background sync), file de mutations hors
  ligne côté client (`lib/offline-queue.ts`), manifest généré.

### Stack

| Couche | Technologie |
|---|---|
| UI | React 19.2.8, lucide-react, CSS custom + import Tailwind |
| Framework | Next.js 16.3.4 (App Router, Proxy) |
| API | Route handlers Next (`app/api/**/route.ts`), validation Zod 4 |
| ORM | Prisma 6.19 (`prisma-client-js`) |
| Base | PostgreSQL 16 |
| Auth | next-auth 4.24.15 (Google OAuth) |
| Services | calendar, automation (jobs), mastery, revision-planner, spaced-repetition, ai (local), course-processor, ocr (tesseract.js), grades, storage, audit |
| PWA | service worker custom + manifest |

## 2. Pages et navigation actuelles

Une seule page applicative `/` pilotée par un état `active` (client) avec 11 sections :

**Dashboard · Cours · Évaluations · Révisions · Calendrier · Fiches · Flashcards ·
Quiz · Statistiques · Automatisations · Devoirs & notes**

Sidebar desktop sombre + bottom-nav mobile (5 premiers items) + menu mobile,
modale « Action rapide ». Il n'existe **pas** d'écran Paramètres, pas d'écran
Planning dédié (le calendrier en tient lieu), pas de page par ressource.

## 3. Composants importants

- `app/page.tsx` — shell applicatif, navigation, dashboard, modales quick-add/nav.
- `components/phase-one-workspace.tsx` — Matières/chapitres, Cours, Évaluations,
  Révisions, Devoirs & notes (5 gestionnaires dans un seul fichier).
- `components/learning-workspace.tsx` — Fiches, Flashcards, Quiz (3 gestionnaires).
- `components/calendar-workspace.tsx` — événements internes, emploi du temps,
  bannière Google (connexion/sync).
- `components/statistics-workspace.tsx`, `components/automation-workspace.tsx`.
- `components/pwa-register.tsx`, `components/auth-provider.tsx`.

## 4. API disponibles (toutes 401 sans session, isolées par `userId`)

| Méthode | Route | Rôle |
|---|---|---|
| GET/POST | `/api/subjects` · `/api/subjects/:id` (PATCH/DELETE) | Matières |
| GET/POST | `/api/chapters` · `/api/chapters/:id` (PATCH/DELETE) | Chapitres |
| GET/POST | `/api/courses` · `:id` (PATCH/DELETE) · `:id/file` · `/upload` | Cours + import |
| GET/POST | `/api/evaluations` · `:id` (PATCH/DELETE) | Évaluations + plan auto |
| GET/POST | `/api/revisions` · `:id` (PATCH) | Sessions de révision |
| GET/POST | `/api/homework` · `:id` (PATCH/DELETE) | Devoirs |
## 6. Fonctionnalités existantes (dites fonctionnelles)

- CRUD sujets/chapitres (API complète ; UI : création + suppression uniquement).
- Cours : CRUD + import PDF/DOCX/TXT/PNG/JPG (extraction + structuration Markdown,
  OCR image, stockage S3 optionnel, téléchargement authentifié).
- Évaluations : création → sessions générées par `RevisionPlanner` (évite les
  créneaux protégés et les événements existants), changement de date → régénération,
  terminer/annuler → clôture des sessions.
- Révisions : liste, terminer, ignorer, création manuelle.
- Calendrier interne : événements personnels, emploi du temps protégé.
- Google Calendar : connexion OAuth, sync aller-retour idempotente, import sans
  doublons (contrainte `@@unique([userId, source, externalId])`), refresh token.
- Fiches générées localement, flashcards + répétition espacée, quiz + maîtrise.
- Statistiques, automatisations (jobs retry), audit, health, PWA + file hors ligne.
- Dashboard alimenté `/api/dashboard` (données réelles).

## 7. Problèmes bloquants identifiés (P0)

- **Aucun état « révision en cours / reportée »** : l'enum `RevisionStatus` ne
  connaît que `planned/completed/skipped`, alors que le workflow demandé est
  `planned / in_progress / completed / skipped / postponed`. Impossible de
  « Commencer » ou « Reporter » une session.
- **Impossible de modifier ou supprimer une révision** : pas de `PATCH` complet ni
  de `DELETE` sur `/api/revisions/:id`, pas de boutons dans l'UI.
- **Événements Google orphelins au déplacement d'une évaluation** : la régénération
  du plan supprime les sessions (`deleteMany`) sans retirer leurs événements Google ;
  à la prochaine sync, les anciens événements réapparaissent/dupliquent côté Google.
- **Suppression d'une révision / annulation d'évaluation ne nettoie pas Google.**
- **Flashcards : aucune modification ni suppression** (API et UI).
## 10. Problèmes responsive

- Fontes < 12 px fréquentes (illisibles sur mobile), zones tactiles parfois < 40 px,
  modales et formulaires surchargés sur petit écran.
- Bottom-nav limitée à 5 items + menu modal (fonctionnel mais peu pratique).
- Pas de validation documentée sur les largeurs 320 → 1920 px.

## 11. Problèmes d'accessibilité

- Boutons icônes : `aria-label` présents ✅ ; actions de liste sans labels.
- `:focus-visible` global présent ; champs/boutons sans états d'erreur distincts ;
  erreurs reposant sur `window.confirm()`.
- Hiérarchie de titres approximative selon l'écran.

## 12. Problèmes de sécurité (traités → à surveiller)

- Secrets jamais dans le code ; `.env` ignoré ✅ ; `.env.example` complet ✅.
- Rate limiting mémoire uniquement (Redis/WAF en multi-instances).
- Uploads contrôlés (magic bytes, 15 Mo, MIME/extension) ✅ ; CSP nonce ✅ ; HSTS ✅.
- Points de vigilance : nettoyage S3 best-effort ; pas de rate limit spécifique
  `/api/auth` au niveau application.

## 13. Problèmes de performance

- `Promise.all` sur GET initiaux ✅ mais rechargements complets après chaque mutation.
- Pas de skeleton ; pas de pagination UI réelle au-delà de la limite par défaut.
- OCR/PDF exécutés en requête (jobs) — acceptable pour 1 utilisateur.

## 14. Problèmes de production

- `npm start` repose sur `next start` ; Dockerfile présent ✅.
- Cron cloud documenté (`/api/automation/worker` + `CRON_SECRET`) ✅.
- `TRUST_PROXY` utilisé par `proxy.ts` mais **absent** de `.env.example`/README.
- Pas de commande de test (`npm test` absent).

## 15. Variables d'environnement nécessaires

| Variable | Statut |
|---|---|
| `DATABASE_URL` | ✅ exemple présent |
| `NEXTAUTH_SECRET` / `NEXTAUTH_URL` | ✅ |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI` | ✅ |
| `CALENDAR_TIMEZONE` | ✅ |
| `S3_*` | ✅ (optionnel) |
| `AI_API_KEY` | ✅ (optionnel) |
| `CRON_SECRET` | ✅ |
| `TRUST_PROXY` | ❌ à documenter |

---

# TODO priorisé

## P0 — bloque le fonctionnement
- [ ] Statuts `in_progress` / `postponed` (migration Prisma).
- [ ] `PATCH /api/revisions/:id` complet (édition + Commencer/Reporter) et
      `DELETE /api/revisions/:id` (+ nettoyage Google event).
- [ ] Nettoyage Google events orphelins au déplacement d'évaluation, à la
      suppression d'une révision et à l'annulation d'une évaluation.
- [ ] Flashcards : PATCH + DELETE (API + UI).
- [ ] Fiches : PATCH (édition + sauvegarde réelle) (API + UI).

## P1 — fonctionnalité importante incomplète
- [ ] Rappels réels : service + API `/api/reminders` + worker `generate_reminders`
      + panneau dashboard.
- [ ] Cours : recherche, filtres matière/chapitre, lecture du cours.
- [ ] Sujets/Chapitres : bouton Modifier (PATCH) dans l'UI.
- [ ] Notes/Devoirs : bouton Modifier (PATCH) dans l'UI.
- [ ] Dashboard sans données factices pour les visiteurs (états vides + CTA).
- [ ] `GET /api/flashcards?scope=all` pour la gestion des cartes futures.

## P2 — gros problème UX / UI
- [ ] Refonte complète du design (tokens, typographie, espacements, lisibilité).
- [ ] Navigation simplifiée (Accueil/Planning/Révisions/Cours/Matières/Notes +
      secondaire) + écran Paramètres.
- [ ] États Loading / Error / Empty / Success cohérents partout.
- [ ] Supprimer les labels « PHASE x », hiérarchiser les en-têtes.

## P3 — améliorations secondaires
- [ ] Responsive 320→1920 px (tailles tactiles, fontes, modales, tableaux).
- [ ] Accessibilité : labels d'actions de liste, focus, contrastes.
- [ ] `TRUST_PROXY` documenté ; commande `npm test` + tests unitaires.
- [ ] README/DEPLOYMENT à jour (rappels, statuts de révision, tests).
- **Fiches : aucune modification après génération** (API et UI).

## 8. Problèmes fonctionnels / P1

- **Cours** : pas de recherche, pas de filtre matière/chapitre dans l'UI, pas de
  lecture du contenu (pas de vue détail).
- **Sujets/Chapitres** : pas de bouton « Modifier » dans l'UI (PATCH API existe).
- **Notes/Devoirs** : pas d'édition dans l'UI (PATCH API existe) ; moyenne réelle OK.
- **Aucun système de rappels** (contrôle proche, révision en retard, devoir urgent).
- **Dashboard** : données d'aperçu factices pour les visiteurs non connectés
  (contraire à « aucune statistique fictive ») → états vides + CTA.
- **Révisions en retard non affichées** (sessions passées non terminées).
- **`GET /api/flashcards` ne renvoie que les cartes échues** : impossible de gérer
  les cartes futures depuis l'UI.

## 9. Problèmes UX / UI (P2)

- Typographie minuscule (9–12 px), police « Trebuchet MS », espacement serré.
- Sidebar de 11 items sans hiérarchie claire ; pas d'écran Paramètres ; pas d'onglet
  actif fort sur mobile.
- Étiquettes « PHASE x · … » dans les en-têtes d'écran (inutiles pour l'utilisateur).
- États de chargement quasi absents, états d'erreur hétérogènes.
- Dashboard : bandeau de jours statique, « Focus du moment » peu exploité.
- Formulaires empilés dans un même écran (« Tout sur une page »).
| GET/POST | `/api/grades` · `:id` (PATCH/DELETE) | Notes |
| GET/POST | `/api/calendar` · `:id` (DELETE) · `/status` · `/sync` | Calendrier + Google |
| GET/POST | `/api/schedule` · `:id` (DELETE) | Créneaux protégés |
| GET/POST/DELETE | `/api/study-sheets` · `:id` (GET/DELETE) | Fiches |
| GET/POST | `/api/flashcards` · `:id/review` (POST) | Flashcards |
| POST | `/api/quizzes` · `/api/quizzes/attempt` | Quiz + persistance |
| GET | `/api/dashboard` · `/api/statistics` · `/api/audit` | Agrégats |
| GET/POST | `/api/automation` · `:id/retry` · `/worker` | Jobs + cron |
| GET | `/api/health` · `/api/storage/health` | Observabilité |

## 5. Modèles Prisma

`User`, `Subject`, `Chapter`, `Course`, `Evaluation`, `RevisionSession`, `Homework`,
`Grade`, `Schedule`, `Event`, `AutomationJob`, `StudySheet`, `Flashcard`,
`QuizAttempt`, `AuditLog`. Enums : `Difficulty`, `Importance`, `RevisionType`,
`RevisionStatus` (**planned/completed/skipped**), `HomeworkStatus`, `EventType`,
`EventSource`, `AutomationJobType/Status`, `FlashcardDifficulty`, `CourseSourceType`,
`EvaluationStatus`. Index et cascades raisonnables (détail dans `prisma/schema.prisma`).