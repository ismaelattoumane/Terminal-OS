# Terminal OS

Terminal OS est le cockpit personnel de gestion de Terminale : cours, chapitres, controles, revisions et progression. Cette premiere tranche pose une base cloud-ready avec Next.js, TypeScript, Prisma/PostgreSQL et Auth.js.

## Etat du projet

Les phases 1 à 5 sont en place, et couvrent :

- dashboard responsive avec sidebar desktop, bottom navigation mobile et action rapide ;
- modèle Prisma multi-utilisateur pour sujets, chapitres, cours, évaluations, révisions, devoirs et notes ;
- validation serveur Zod et isolation par utilisateur ;
- Auth.js avec fournisseur Google optionnel et jeton Google Calendar côté serveur (refresh automatique) ;
- `RevisionPlanner` déterministe qui crée des sessions learning, memorization, practice et final_review selon la date du contrôle, la difficulté et la maîtrise ;
- imports de fichiers (PDF, DOCX, TXT, PNG, JPG) avec extraction, **structuration Markdown et OCR images**, pipeline relançable via `AutomationJob` ;
- fiches de révision et flashcards générées localement (sans clé IA), quiz d'auto-évaluation qui alimentent la maîtrise (`MasteryService`) ;
- calendrier interne + synchronisation Google Calendar ;
- écrans Statistiques (tendances, maîtrise par matière) et Automatisations (jobs relançables, audit) ;
- PWA installable : cache du shell, écran de secours hors ligne et **synchronisation différée des modifications à la reconnexion** (`lib/offline-queue.ts`) ;
- rate limiting (proxy Next.js), headers de sécurité, contrôle des fichiers par magic bytes ;
- scripts de validation, migration Prisma et `db:deploy` pour la production.

## Installation locale

Prerequis : Node.js 20+, npm, Docker et Docker Compose (ou une instance PostgreSQL 14+).

```bash
npm install
cp .env.example .env
# renseigner DATABASE_URL et NEXTAUTH_SECRET dans .env
npm run db:up
npm run db:generate
npm run db:migrate
npm run dev
```

Application locale : http://localhost:3000

`npm run db:up` démarre la PostgreSQL de développement décrite dans `docker-compose.yml`. Pour l'arrêter : `npm run db:down`.

## Variables d'environnement

Voir `.env.example`. Les secrets ne doivent jamais etre commits.

- `DATABASE_URL` : connexion PostgreSQL.
- `NEXTAUTH_SECRET` : secret de session aleatoire en production (lu par next-auth v4 ; `AUTH_SECRET` n'est pas utilisé).
- `NEXTAUTH_URL` : URL publique de l'application utilisée par Auth.js.
- `GOOGLE_CLIENT_ID` et `GOOGLE_CLIENT_SECRET` : activent la connexion Google.
- `GOOGLE_REDIRECT_URI` : URI de callback OAuth, à déclarer exactement dans Google Cloud Console.
- `CALENDAR_TIMEZONE` : fuseau utilisé pour les événements Google, par défaut `Europe/Paris`.
- `S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET`, `S3_REGION` : stockage S3 compatible (MinIO, Scaleway, R2, AWS). Vides => stockage désactivé.
- `S3_PUBLIC_URL` : URL publique du bucket (optionnel, pour les liens de consultation).
- `AI_API_KEY` : reserved pour un provider IA optionnel ; sans clé, la génération locale reste fonctionnelle.
- `CRON_SECRET` : secret du cron cloud, à générer aléatoirement et à ne jamais exposer au navigateur.

Pour Google OAuth, declarer `http://localhost:3000/api/auth/callback/google` comme URI de redirection locale.

Quand Google OAuth est configuré, `POST /api/calendar/sync` synchronise les sessions de révision vers le calendrier principal. Le service réutilise `calendarEventId` pour mettre à jour l'événement existant au lieu de créer un doublon. Les jetons restent côté session serveur et sont rafraîchis automatiquement.

## Commandes utiles

```bash
npm run lint
npm run build
npm run db:validate
npm run db:format
npm run db:migrate
```

## API

- `GET /api/subjects` : liste les matieres de l'utilisateur connecte (paginé).
- `POST /api/subjects` : cree une matiere validee par Zod.
- `POST /api/evaluations` : cree un controle et ses sessions de revision planifiees.
- `GET /api/revisions` et `POST /api/revisions` : consulte ou cree une session (paginé).
- `PATCH /api/revisions/:id` : termine, saute ou re-priorise une session.
- `GET /api/calendar` et `POST /api/calendar` : gere les evenements internes (paginé).
- `GET /api/calendar/status` : état de la connexion Google Calendar (connecté, configuré, timezone).
- `GET /api/dashboard` : calcule les indicateurs du dashboard depuis PostgreSQL.
- `GET /api/statistics` : tendances, maîtrise par matière, sessions par semaine, quiz récents.
- `GET/POST /api/automation` : journalise un job utilisateur et peut traiter le prochain job avec `?process=true`.
- `POST /api/automation/:id/retry` : relance un job en échec puis le traite immédiatement.
- `POST /api/automation/worker` : traite un job par utilisateur avec `Authorization: Bearer $CRON_SECRET`, pour un cron cloud.
- `POST /api/courses/upload` : importe un PDF, DOCX, TXT, PNG ou JPG ; extraction + structuration + OCR (images), stockage S3 optionnel.
- `GET/POST /api/study-sheets` et `DELETE /api/study-sheets/:id` : fiches de révision générées depuis un ou plusieurs cours.
- `GET/POST /api/flashcards` et `POST /api/flashcards/:id/review` : répétition espacée.
- `POST /api/quizzes` et `POST /api/quizzes/attempt` : quiz à réponse courte et auto-évaluation (met à jour la maîtrise).
- `POST /api/calendar/sync` et `GET /api/calendar/sync` : synchronisation aller-retour Google Calendar.
- `GET /api/storage/health` : état du bucket S3 (connecté requis).
- `GET /api/health` : observabilité publique (uptime, base de données, mémoire, stockage).
- `GET /api/audit` : journal d'audit récent de l'utilisateur (persisté dans la table PostgreSQL `AuditLog`, borné à 300 événements par utilisateur).

Les routes renvoient `401` sans session Auth.js et ne permettent pas de lire un autre compte.
Les routes de consultation sont paginées via `?limit=` / `?offset=` avec l'entête `X-Total-Count`.

## Stockage S3 (test local recommandé)

```bash
docker run -d --name minio -p 9000:9000 -p 9001:9001 \
  -e MINIO_ROOT_USER=minioadmin -e MINIO_ROOT_PASSWORD=minioadmin \
  minio/minio server /data --console-address ":9001"
```

Puis renseigner dans `.env` :

```
S3_ENDPOINT="http://localhost:9000"
S3_ACCESS_KEY="minioadmin"
S3_SECRET_KEY="minioadmin"
S3_BUCKET="terminal-os"
S3_REGION="auto"
```

Créer le bucket `terminal-os` dans la console MinIO (http://localhost:9001),
puis vérifier via `GET /api/storage/health`.

## Deploiement

Le projet est compatible avec Vercel, Render, Railway ou un conteneur Node.
Fournir les variables d'environnement au fournisseur cloud, une base PostgreSQL
persistante et executer `npm run db:deploy` (`prisma migrate deploy`) pendant le
deploiement. Le guide complet (plateformes, migrations, cron, observabilité)
est dans [`DEPLOYMENT.md`](DEPLOYMENT.md).

## Architecture

```text
app/          pages, layout et route handlers Next.js
components/   composants UI reutilisables (prochaines tranches)
lib/          client Prisma et configuration Auth.js
prisma/       schema et migrations PostgreSQL
services/     logique metier, dont RevisionPlanner
public/       assets et manifest PWA (phase suivante)
```