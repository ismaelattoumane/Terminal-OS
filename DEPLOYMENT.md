# Déploiement — Terminal OS

Ce document décrit la mise en production de Terminal OS sur une plateforme cloud
(Vercel, Render, Railway ou un conteneur Node). L'architecture est configurée pour
rester indépendante du poste de développement.

## Prérequis

- Compte Node.js ≥ 20.
- Une base PostgreSQL **managée** : Neon, Supabase, AWS RDS, Railway Postgres…
- (Optionnel) Un bucket S3 compatible : Scaleway, Cloudflare R2, AWS S3, MinIO.
- (Optionnel) Des identifiants OAuth Google Cloud.

## Variables d'environnement

Toutes les variables à fournir sont documentées dans [`.env.example`](.env.example).

Sur un fournisseur cloud :

| Variable | Obligatoire | But |
| --- | --- | --- |
| `DATABASE_URL` | oui | Connexion PostgreSQL managée (SSL recommandé). |
| `NEXTAUTH_SECRET` | oui | Secret de session lu par next-auth v4 (générer avec `openssl rand -base64 32`). `AUTH_SECRET` n'est pas lu par next-auth v4. |
| `NEXTAUTH_URL` | oui | URL publique de l'application. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | si Google | Connexion Google + Calendar. |
| `GOOGLE_REDIRECT_URI` | si Google | URI de callback, déclarée dans la Google Cloud Console. |
| `CALENDAR_TIMEZONE` | non | Fuseau des événements Google (défaut `Europe/Paris`). |
| `S3_ENDPOINT` / `S3_ACCESS_KEY` / `S3_SECRET_KEY` / `S3_BUCKET` | non | Stockage S3 des fichiers de cours ; vide = stockage désactivé. |
| `AI_API_KEY` | non | Provider IA distant optionnel (mode local fonctionnel sans clé). |
| `CRON_SECRET` | non | Secret du cron `/api/automation/worker` (Bearer token). |

## Pipeline de déploiement

### 1. Migrations de production

Les migrations sont appliquées de façon déclarative (jamais `prisma migrate dev` en prod) :

```bash
npm run db:deploy   # équivalent à prisma migrate deploy
```

Injecter cette commande dans le lifecycle du déploiement (pré-deploy). Exemples :

- **Vercel** : script de build `npm run db:generate && npm run build`, puis sur un
  environnement de production exécuter `npx prisma migrate deploy` (post-deploy
  via un job manuel ou une GitHub Action).
- **Render / Railway** : commande de démarrage
  `npm run db:deploy && npm start`, `predeploy` équivalent.

### 2. Observabilité

- `GET /api/health` : endpoint public minimal (statut, base, horodatage), adapté
  à UptimeRobot / Better Stack. Le diagnostic détaillé (uptime, mémoire, stockage,
  environnement) exige `?detailed=1` et le header `x-health-secret: $CRON_SECRET`.
- `GET /api/storage/health` : vérifie l'accès au bucket S3 (connecté requis).
- Journal applicatif : les erreurs de jobs sont stockées sur `AutomationJob.error`
  et visibles dans l'écran Automatisations ; le journal d'audit (`GET /api/audit`)
  est persisté dans la table PostgreSQL `AuditLog` (bornée à 300 événements par
  utilisateur via un élagage occasionnel) et reste cohérent en multi-instances.

### 3. Cron cloud

Configurer un cron (Vercel Cron, Render Cron, GitHub Actions, etc.) toutes les
5–15 minutes vers :

```
POST https://<url-app>/api/automation/worker
Authorization: Bearer $CRON_SECRET
```

Ce endpoint traite un job « pending/failed » par utilisateur (max 3 tentatives),
puis passe à l'utilisateur suivant. Les jobs sont idempotents
(`@@unique([userId, idempotencyKey])`).

## Plateformes

### Vercel

1. Importer le dépôt GitHub.
2. Renseigner les variables d'environnement de production.
3. Build : `npm run db:generate && npm run build`.
4. Base de données managée externe (Neon/Supabase) + `prisma migrate deploy` au deploy.

### Render

1. Créer un « Web Service » depuis le dépôt.
2. Build : `npm install && npm run build`.
3. Start : `npm run db:deploy && npm start`.
4. Ajouter un PostgreSQL managé Render et copier son `DATABASE_URL`.

### Railway

1. Déployer depuis le dépôt (Nixpacks).
2. Attacher un PostgreSQL Railway.
3. Variables identiques ; start : `npm run db:deploy && npm start`.

### Docker / autohébergé

```bash
docker build -t terminal-os .
docker run -p 3000:3000 --env-file .env terminal-os
```

Un `Dockerfile` peut être généré avec `npx @railway/cli` ou `next start`
recommandé derrière un reverse proxy (Caddy/Nginx). Les headers de sécurité sont
déjà appliqués par `next.config.ts`.

## Notes de sécurité en production

- Le `rate limiting` est appliqué par `proxy.ts` (mémoire par instance) : pour une
  scalabilit horizontale, prévoir des limites Redis ou un WAF.
- Les secrets ne sont jamais exposés au navigateur ; seuls les jetons Google
  restent côté session serveur.
- Renforcer la CSP (`next.config.ts`) avec des nonces quand le contenu dynamique
  externe l'exige.
- L'OCR (tesseract.js) télécharge les données linguistiques au premier appel :
  les plateformes serverless doivent autoriser les requêtes sortantes vers le CDN
  tesseract, ou prévoir un bucket local des `.traineddata`.
