# Terminal OS

Terminal OS est le cockpit personnel de gestion de Terminale : cours, chapitres, controles, revisions et progression. Cette premiere tranche pose une base cloud-ready avec Next.js, TypeScript, Prisma/PostgreSQL et Auth.js.

## Etat du projet

La phase 1 contient :

- dashboard responsive avec sidebar desktop, bottom navigation mobile et action rapide ;
- modele Prisma multi-utilisateur pour sujets, chapitres, cours, evaluations, revisions, devoirs et notes ;
- validation serveur Zod ;
- Auth.js avec fournisseur Google optionnel ;
- API securisee pour les sujets et la creation d'evaluations ;
- `RevisionPlanner` deterministe qui cree des sessions learning, memorization, practice et final_review selon la date du controle, la difficulte et la maitrise ;
- scripts de validation et de migration Prisma.

Les prochaines tranches pourront ajouter stockage S3, uploads/OCR, calendrier Google, fiches, flashcards, quiz, jobs et PWA offline sans remettre en cause ces frontieres.

## Installation locale

Prerequis : Node.js 20+, npm, Docker et Docker Compose (ou une instance PostgreSQL 14+).

```bash
npm install
cp .env.example .env
# renseigner DATABASE_URL et AUTH_SECRET dans .env
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
- `AUTH_SECRET` : secret de session aleatoire en production.
- `NEXTAUTH_URL` : URL publique de l'application utilisée par Auth.js.
- `GOOGLE_CLIENT_ID` et `GOOGLE_CLIENT_SECRET` : activent la connexion Google.
- `GOOGLE_REDIRECT_URI` : URI de callback OAuth, à déclarer exactement dans Google Cloud Console.
- `CALENDAR_TIMEZONE` : fuseau utilisé pour les événements Google, par défaut `Europe/Paris`.
- `S3_*` : reserve pour le stockage des fichiers de cours.
- `AI_API_KEY` : reserve pour un provider IA optionnel.
- `CRON_SECRET` : secret du cron cloud, à générer aléatoirement et à ne jamais exposer au navigateur.

Pour Google OAuth, declarer `http://localhost:3000/api/auth/callback/google` comme URI de redirection locale.

Quand Google OAuth est configuré, `POST /api/calendar/sync` synchronise les sessions de révision vers le calendrier principal. Le service réutilise `calendarEventId` pour mettre à jour l'événement existant au lieu de créer un doublon. Les jetons restent côté session serveur.

## Commandes utiles

```bash
npm run lint
npm run build
npm run db:validate
npm run db:format
npm run db:migrate
```

## API phase 1

- `GET /api/subjects` : liste les matieres de l'utilisateur connecte.
- `POST /api/subjects` : cree une matiere validee par Zod.
- `POST /api/evaluations` : cree un controle et ses sessions de revision planifiees.
- `GET /api/revisions` et `POST /api/revisions` : consulte ou cree une session.
- `PATCH /api/revisions/:id` : termine, saute ou re-priorise une session.
- `GET /api/calendar` et `POST /api/calendar` : gere les evenements internes.
- `GET /api/dashboard` : calcule les indicateurs du dashboard depuis PostgreSQL.
- `GET/POST /api/automation` : journalise un job utilisateur et peut traiter le prochain job avec `?process=true`.
- `POST /api/automation/worker` : traite un job par utilisateur avec `Authorization: Bearer $CRON_SECRET`, pour un cron cloud.
- `POST /api/courses/upload` : importe un PDF, DOCX, TXT, PNG ou JPG et crée un cours après extraction quand elle est disponible.
- `GET/POST /api/calendar/sync` : importe les événements Google et synchronise les révisions.

Les routes renvoient `401` sans session Auth.js et ne permettent pas de lire un autre compte.

## Deploiement

Le projet est compatible avec Vercel, Render, Railway ou un conteneur Node. Fournir les variables d'environnement au fournisseur cloud, une base PostgreSQL persistante et executer `prisma migrate deploy` pendant le deploiement. Le serveur cloud reste independant du PC local.

## Architecture

```text
app/          pages, layout et route handlers Next.js
components/   composants UI reutilisables (prochaines tranches)
lib/          client Prisma et configuration Auth.js
prisma/       schema et migrations PostgreSQL
services/     logique metier, dont RevisionPlanner
public/       assets et manifest PWA (phase suivante)
```