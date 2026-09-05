# 🔵 Mineurs — corrections (B35 à B42)

> Polish, UX, accessibilité et robustesse mineure.

---

## B35 — Faute de frappe dans l'API calendrier
**Fichier :** `app/api/calendar/status/route.ts`
« au premier connexion » → « à la première connexion ».

## B36 — Fichier parasite `.envv.example`
Supprimé (doublon avec faute de `.env.example`).

## B37 — Manifest PWA : un seul icône SVG
**Fichiers créés :** `public/icon-192.png`, `public/icon-512.png`, `scripts/generate-icons.js`
**Fichier modifié :** `app/manifest.ts`
Ajout d'icônes PNG 192 et 512 (couleur brand) en plus du SVG, pour un rendu correct à l'installation sur Android/iOS.

## B38 — Évaluation sans chapitre / le jour même : 0 révisions sans avertissement
**Fichier modifié :** `components/phase-one-workspace.tsx`
Le formulaire de création d'évaluation lit `revisionSessionsCreated` et affiche un message explicite quand aucune révision n'a pu être planifiée.

## B39 — Accessibilité incomplète
**Fichier modifié :** `app/globals.css`
Ajout d'un style `:focus-visible` global (outline orange) pour la navigation clavier et d'une media query `prefers-reduced-motion`. (Les selects sont déjà associés à des `<label>`, les boutons icônes ont des `aria-label`.)

## B40 — `/api/health` publique expose trop d'infos
**Fichier modifié :** `app/api/health/route.ts`
La version détaillée (mémoire, config, uptime) n'est plus exposée publiquement : elle nécessite désormais un secret (`x-health-secret` ou `?secret=`) correspondant à `CRON_SECRET`. La version publique se limite à `{ status, database, timestamp }`.

## B41 — Écran Calendrier : actions non compatibles hors ligne
**Fichier modifié :** `components/calendar-workspace.tsx`
Les mutations du calendrier (créer/supprimer un événement, créer/supprimer un créneau) utilisent maintenant `queuedFetch` (comme les autres écrans), avec gestion du code 202 « synchronisé à la reconnexion ».

## B42 — Dates d'édition d'évaluation : `date.slice(0,10)` dépend du fuseau
**Fichier modifié :** `components/phase-one-workspace.tsx`
Ajout d'un helper `toLocalDateInput(iso)` qui formate en `YYYY-MM-DD` **local** (pas UTC) pour les `<input type="date">`, évitant le décalage d'un jour dans les fuseaux négatifs.

---

## Q01 à Q04 — qualité finale

- Les six imports/paramètres inutilisés ESLint ont été retirés.
- Un Dockerfile multi-stage rend la procédure `docker build` documentée réellement exécutable.
- Le payload `workloadBySubject`, jamais consommé, est supprimé de l'API Statistiques.
- Les imports déclenchés par `GET /api/calendar/sync` sont maintenant journalisés.
