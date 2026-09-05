# ⚙️ Sécurité & robustesse — corrections (B43 à B46)

> Rate limiting, CSP, audit et qualité du contenu structuré.

---

## B43 — Rate limiter : buckets jamais purgés + clé mutualisant les ids + IP falsifiable
**Fichier modifié :** `proxy.ts`
- **Purge périodique** des buckets expirés (toutes les 5 min + si > 5000 clés) pour éviter la fuite mémoire sur longue durée.
- **Clé par chemin complet** `${ip}:${pathname}` (plus de normalisation `/:id` qui mutualisait le quota entre utilisateurs).
- **IP** : `x-real-ip` en priorité, `x-forwarded-for` seulement si `TRUST_PROXY=true` (car falsifiable sinon).

## B44 — CSP permissive (`unsafe-inline` + `unsafe-eval`)
**Fichiers modifiés :** `proxy.ts`, `next.config.ts`
- La CSP est maintenant générée dans `proxy.ts` avec un **nonce par requête** (conforme à la doc Next 16 lue dans `node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md`) : `script-src 'self' 'nonce-...' 'strict-dynamic'` (+ `'unsafe-eval'` en dev uniquement).
- Le nonce est injecté via l'en-tête `x-nonce` (Next l'applique automatiquement aux scripts).
- La CSP statique de `next.config.ts` est supprimée pour éviter un doublon d'en-tête.
- Le proxy s'applique à **toutes les routes** (`matcher: "/:path*"`) pour couvrir les pages.

## B45 — Purge du journal d'audit seulement probabiliste
**Fichier modifié :** `lib/audit.ts`
Le comportement probabiliste (5 % de chance, borne non déterministe) est désormais **documenté** dans le commentaire du service, avec la recommandation d'utiliser un cron pour une borne stricte.

## B46 — `structureCourseText` : heuristique de titres approximative
**Fichier modifié :** `services/course-processor.ts`
L'ancienne heuristique (toute ligne courte sans ponctuation finale = titre) produisait des plans aberrants. Une ligne n'est désormais considérée comme un titre que si elle :
- commence par une majuscule ou un chiffre,
- contient 2 à 12 mots,
- et est suivie d'une ligne de contenu (longue, une puce, ou un titre Markdown `#`).
