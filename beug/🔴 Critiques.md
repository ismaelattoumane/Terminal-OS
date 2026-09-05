# 🔴 Critiques — corrections (B01 à B05)

> Résumé simple des modifications faites pour régler les 5 bugs critiques du rapport d'audit.

---

## B01 — `AUTH_SECRET` jamais lu par next-auth v4 (session cassée en production)

**Fichiers modifiés :** `lib/auth.ts`, `.env`, `.env.example`, `README.md`, `DEPLOYMENT.md`

Le projet utilise next-auth **v4**, qui ne lit que `NEXTAUTH_SECRET`. La variable fournie s'appelait `AUTH_SECRET` (nom de la v5) → jamais utilisée.

**Modifs :**
- Ajout de `secret: process.env.NEXTAUTH_SECRET` dans `authOptions` (`lib/auth.ts`).
- Renommage `AUTH_SECRET` → `NEXTAUTH_SECRET` dans `.env` et `.env.example`.
- Mise à jour de la doc (README §installation et §variables, DEPLOYMENT §tableau).

---

## B02 — Devoirs et notes impossibles à créer (panneaux du dashboard vides)

**Fichiers créés :** `app/api/homework/route.ts`, `app/api/homework/[id]/route.ts`, `app/api/grades/route.ts`, `app/api/grades/[id]/route.ts`
**Fichiers modifiés :** `components/phase-one-workspace.tsx`, `app/page.tsx`

Il n'existait aucune route ni écran pour les modèles `Homework` et `Grade`, pourtant affichés sur le dashboard.

**Modifs :**
- Routes CRUD complètes `GET`/`POST` `/api/homework` et `/api/grades` + `PATCH`/`DELETE` sur `[id]` (même style que le reste : session obligatoire, validation Zod, vérification que la matière appartient à l'utilisateur, pagination `X-Total-Count`).
- Nouvel écran **« Devoirs & notes »** dans `PhaseOneWorkspace` : deux formulaires (devoir : intitulé, matière, échéance date+heure, durée, priorité ; note : matière, note, barème, coefficient, date, commentaire) et deux listes avec suppression et bouton « Terminer » (passe le devoir en `completed`).
- Nouvel item de navigation « Devoirs & notes » dans la sidebar.

---

## B03 — Changer la date d'une évaluation supprime le plan de révision sans le recréer

**Fichiers modifiés :** `services/automation.ts`, `app/api/evaluations/[id]/route.ts`

Le `PATCH` supprimait les sessions `planned` mais ne régénérait jamais le plan.

**Modifs :**
- Nouvelle fonction exportée `regenerateRevisionPlan(userId, evaluationId)` dans `services/automation.ts` (elle réutilise le même moteur de planification que la création).
- Dans `PATCH /api/evaluations/[id]`, après le `deleteMany`, le plan est **rejoué automatiquement** avec les chapitres liés à l'évaluation.

---

## B04 — Quiz : « Impossible de générer le quiz » dans des cas normaux

**Fichier modifié :** `components/learning-workspace.tsx`

L'écran Quiz laissait choisir n'importe quel cours de la matière, mais l'API exige un cours du chapitre choisi → 404.

**Modifs :**
- `filteredCourses` du QuizManager filtre maintenant les cours **par chapitre** (en plus de la matière) : impossible de choisir un cours que l'API refusera.

---

## B05 — Flashcards : aucune façon d'en créer depuis l'interface

**Fichier modifié :** `components/learning-workspace.tsx`

`POST /api/flashcards` n'était jamais appelé : l'écran était en lecture seule.

**Modifs :**
- `FlashcardManager` a maintenant un formulaire « Nouvelles flashcards » : matière → chapitre → cours (optionnel) + question/réponse (optionnelles).
- Si question + réponse sont saisies → création manuelle ; sinon → génération automatique depuis le cours choisi (le point d'entrée IA existant).
- Validations côté client avec messages clairs, état `busy` sur le bouton.

---

## C01 — Flashcards liées à un chapitre externe ou à un mauvais cours

**Fichier modifié :** `app/api/flashcards/route.ts`

La route acceptait n'importe quel `chapterId` CUID sans vérifier son propriétaire. Elle acceptait aussi un cours de n'importe quel chapitre pour générer des cartes. Cela permettait de créer des relations incohérentes, voire une carte pointant vers le chapitre d'un autre compte.

**Correctif :**

- le chapitre est maintenant chargé avec `id` **et** `userId` avant toute création ;
- le cours de génération doit appartenir au même utilisateur **et** au chapitre choisi ;
- les créations manuelles et générées renseignent systématiquement `subjectId` depuis le chapitre validé.
