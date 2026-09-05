# 🟠 Majeurs — corrections (B06 à B22)

> Faux raccords UI, boutons HS, et retours d'erreur manquants.

---

## B06 — « Paramètres » de la sidebar affiche l'écran Matières
**Fichier :** `app/page.tsx`
Suppression de l'item « Paramètres » dans la sidebar (aucun écran Paramètres n'existe). L'item menait à `PhaseOneWorkspace section="Paramètres"` qui tombait dans le `return` par défaut = Matières.

## B07 — Action rapide : « Un devoir » → Révisions, « Une note » → Cours
**Fichier :** `app/page.tsx`
Le mapping du QuickAdd envoyait « Un devoir » et « Une note » vers de mauvaises sections. Corrigé : les deux mènent au nouvel écran **« Devoirs & notes »** (B02).

## B08 — Bouton décoratif mort PanelLeft dans la topbar
**Fichier :** `app/page.tsx`
Suppression du `<button><PanelLeft/></button>` sans `onClick` ni `aria-label` (et de l'import inutilisé).

## B09 — Bouton ✓ du dashboard actif sur les sessions « aperçu »
**Fichier :** `app/page.tsx`
Le bouton « marquer comme terminé » n'est plus rendu quand `authStatus !== "authenticated"` (mode aperçu), évitant un `PATCH` silencieux sur un id `preview-N`.

## B10 — Révisions : création manuelle impossible
**Fichier :** `components/phase-one-workspace.tsx`
Ajout d'un formulaire « Ajouter une session manuelle » (matière, chapitre optionnel, intitulé, date, heure, durée) appelant `POST /api/revisions` via `queuedFetch`.

## B11 — Calendrier : impossible de supprimer un événement
**Fichiers :** `app/api/calendar/[id]/route.ts` (créé), `components/calendar-workspace.tsx`
Nouvelle route `DELETE /api/calendar/[id]` + bouton corbeille sur chaque événement de la liste « Cette semaine ».

## B12 — « Cette semaine » liste tout l'historique
**Fichier :** `components/calendar-workspace.tsx`
L'appel `GET /api/calendar` passe maintenant `?from=<lundi de la semaine>` (l'API le supportait déjà).

## B13 — Emploi du temps : matière et salle manquants
**Fichier :** `components/calendar-workspace.tsx`
Le formulaire « Ajouter un cours » propose maintenant un select matière (optionnel) et un champ salle, transmis à `POST /api/schedule`.

## B14 — Fiches : changer de matière garde les cours cochés → 404
**Fichier :** `components/learning-workspace.tsx`
`changeSubject` (partagé avec le QuizManager) vide `chapterId` ET `courseIds` quand la matière change.

## B15 — « Terminer » une évaluation ne clôt pas ses sessions
**Fichier :** `app/api/evaluations/[id]/route.ts`
Quand le statut passe à `completed`, les sessions `planned` liées passent à `completed` ; à `cancelled`, à `skipped`.

## B16 — Upload : double soumission + input fichier non réinitialisé
**Fichier :** `components/phase-one-workspace.tsx`
État `uploading` (bouton désactivé pendant l'import) + `useRef` sur l'`input[type=file]` pour vider sa valeur après succès.

## B17 — Suppressions sans confirmation
**Fichiers :** `components/phase-one-workspace.tsx` (DataList), `components/learning-workspace.tsx` (deleteSheet), `components/calendar-workspace.tsx` (créneau + événement)
Ajout de `window.confirm()` avant chaque suppression.

## B18 — Actions de révision sans retour d'erreur
**Fichiers :** `app/page.tsx` (completeRevision), `components/learning-workspace.tsx` (reviewCard)
Affichage d'un message d'échec (et prise en compte du code 202 hors-ligne).

## B19 — Quiz : correction stricte + réponses vides
**Fichiers créés :** `lib/answer-matching.ts`
**Fichiers modifiés :** `app/api/quizzes/attempt/route.ts`, `components/learning-workspace.tsx`
Comparaison normalisée (accents, ponctuation, articles, inclusion) partagée front/back. Avertissement avant validation si des réponses sont vides.

## B20 — Calendrier : pas de validation end > start, message générique
**Fichier :** `components/calendar-workspace.tsx`
Validation client (fin après début) + affichage du message d'erreur détaillé renvoyé par l'API (Zod `flatten()`).

## B21 — Page de connexion : pas d'état « Google non configuré »
**Fichiers :** `app/login/page.tsx`, `app/login/login-button.tsx` (créé)
La page (serveur) détecte `GOOGLE_CLIENT_ID/SECRET` et affiche un message explicite si absent, au lieu d'un bouton mort. Le bouton de connexion est délégué à un composant client séparé.

## B22 — Labels d'audit « sheet.generate » et « calendar.sync » jamais émis
**Fichiers :** `app/api/study-sheets/route.ts`, `app/api/calendar/sync/route.ts`
Ajout des appels `auditLog(...)` correspondants aux actions de la légende.

---

## M01 à M06 — intégrité métier, calendrier et fichiers

**Fichiers modifiés :** routes Évaluations, Fiches et Calendrier, `services/automation.ts`, espace Cours, `proxy.ts`.

- Les chapitres d'une évaluation doivent appartenir à sa matière.
- Une fiche valide maintenant son chapitre dans le bon compte et la bonne matière, y compris lorsqu'elle est générée par un job.
- Les événements importés de Google ne sont plus supprimables localement : l'interface indique leur origine et l'API répond 409 pour empêcher leur réapparition silencieuse.
- Une erreur de régénération de plan après déplacement d'une évaluation est maintenant renvoyée au client, au lieu d'être ignorée.
- Les documents importés ont une route de téléchargement authentifiée et un lien « Fichier » dans la liste des cours.

> M06 (rate limit) reste à traiter séparément : `proxy.ts` contient une modification non committée préexistante qui doit être préservée.
