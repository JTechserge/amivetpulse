# PROMPT — Nouveau rôle : vétérinaire non associé (salarié)

> À coller dans Claude Code à la racine de `CalendrierAmivet`.
> Feature RBAC indépendante du chantier SaaS (peut se faire avant). Note : en multi-tenant, ce rôle devra exister **par clinique** — rien à faire de spécial maintenant, juste à garder en tête.

---

Tu es le développeur senior d'Amivet PULSE. Tu ajoutes un **nouveau rôle utilisateur** : le **vétérinaire non associé** (salarié), distinct des **associés** (Stéphane, David) et des ASV.

## Modèle de rôles actuel (vérifié)

- `user_profiles.role` contraint à **`('admin','vet','asv')`** (migration `20240401000001_auth_user_profiles.sql`).
- Côté front (`src/app.js`) : `effectiveRole()`, `canAccessDashboard()` (= vet/admin), `canAccessSettings()` (= admin/vet), `canEditSlot(personId)` ; flags existants `can_edit_vet_calendar`, `can_edit_all_asv`.
- Flux d'approbation des congés (aujourd'hui **ASV uniquement**) : `src/leave-requests.js` (`collectAllLeaveGroups`, `decideLeaveGroup`, `pending`/`approved`/`rejected`) + décisions stockées par `getLeaveDecision/setLeaveDecision` (`src/slots.js`). L'approbation se fait dans le **tableau de bord**.

## Phase 0 — Note de conception (→ STOP avant code)

Présente-moi d'abord, brièvement :
1. **Qui est « associé »** dans le modèle actuel : vérifie si les comptes de Stéphane et David sont en rôle `admin` ou `vet`, et propose la correspondance retenue (ex. **associé = `admin`**, vétérinaire non associé = nouveau rôle **`vet_employe`**, ASV = `asv`). Garde les rôles existants intacts.
2. Le **nom du nouveau rôle** (`vet_employe` recommandé) et l'impact sur la contrainte SQL + le front.
Attends ma validation avant d'implémenter.

## Comportement attendu du rôle « vétérinaire non associé »

1. **Édition du planning vétérinaire uniquement** (dans un premier temps) : il peut modifier le calendrier des vétérinaires, comme un `vet`, **mais pas** le planning ASV. Prévois un **flag futur** `can_edit_asv_calendar` (défaut `false`) pour ouvrir plus tard l'édition ASV sans nouveau chantier.
2. **Ses demandes de congé passent par la validation des associés** — même mécanique `pending → approuvé/refusé` que les ASV, mais appliquée à ses absences **sur le calendrier vétérinaire**. **Cette validation ne concerne QUE les vétérinaires non associés** : les associés (`admin`) posent leurs congés **sans** validation. Quand un vétérinaire non associé peint une absence sur sa propre ligne, elle devient **« en attente »** et apparaît dans le tableau de bord des associés pour approbation/refus (réutilise `collectAllLeaveGroups`/`decideLeaveGroup` en les étendant aux personnes vétérinaires non associées).
3. **Pas d'accès au tableau de bord ni aux paramètres** (exactement comme une ASV) : `canAccessDashboard()` et `canAccessSettings()` doivent **exclure** ce rôle.

## Ce qu'il faut implémenter

1. **Migration SQL** (⚠️ présentée pour validation) : étendre la contrainte `role` de `user_profiles` pour inclure le nouveau rôle (`vet_employe`), ajouter la colonne flag `can_edit_asv_calendar boolean not null default false`. Adapter les policies RLS et l'Edge Function `manage-users` (invitation avec ce rôle) en conséquence. Vérifie que les **écritures de planning** (Edge Function `save-planning` / `_shared/planning-auth.ts`) autorisent ce rôle sur les clés du calendrier vétérinaire uniquement (et refusent les clés ASV tant que le flag est `false`) — répercute front + Deno + test de contrat.
2. **Front (`app.js`)** :
   - `effectiveRole()` / permissions : le nouveau rôle édite le calendrier vét (`canEditSlot` sur les personnes vétérinaires), n'accède ni au dashboard ni aux réglages, navigation par défaut = onglet Vétérinaires.
   - Masquer les onglets/boutons Tableau de bord et ⚙️ Réglages pour ce rôle (comme pour ASV).
3. **Flux congé associés** (`leave-requests.js`) :
   - Étendre la collecte des demandes pour inclure les **absences des vétérinaires non associés** (en plus des ASV), avec le même cycle `pending/approved/rejected` et les mêmes libellés.
   - Les **associés** (`admin`) sont les approbateurs ; l'approbation reste dans le tableau de bord (auquel seuls admin/associés accèdent).
   - Les absences des **associés** ne génèrent **jamais** de demande (pas de validation requise).
   - Comme pour les ASV, **maladie/accident** restent sans approbation (réutilise `isSickOrAccidentLabel`).
4. **Affichage** : dans le calendrier vétérinaire, une absence en attente d'un non-associé s'affiche « en attente » (repère visuel cohérent avec l'existant ASV), approuvée = repère validé.

## Règles de la mission

- Branche `feature/role-vet-non-associe`. Commits atomiques, messages en français.
- Après chaque lot : `npm run lint` (0/0), `npm run build`, `npm run test:unit`, `npm test`. Rouge = tu répares.
- **Ne casse pas les rôles existants** (`admin`, `vet`, `asv`) ni le flux d'approbation ASV.
- **Tout SQL / Edge Function m'est présenté pour validation** avant exécution/déploiement.
- Répercute toute modif d'autorisation d'écriture (`planning-auth`) sur front **et** Deno **et** le test de contrat.

## Tests & vérification

- Tests unitaires : un vétérinaire non associé peut éditer le calendrier vét, pas l'ASV (tant que `can_edit_asv_calendar=false`) ; ses absences deviennent `pending` ; celles d'un associé restent sans validation ; maladie/accident sans approbation ; il n'accède ni au dashboard ni aux réglages.
- Vérif manuelle `vite preview` : se connecter en vétérinaire non associé (poser un congé → « en attente »), puis en associé (le valider depuis le tableau de bord). Vérifier que les rôles existants sont inchangés.
- TNR vert.

## Définition de « terminé »

- Rôle **vétérinaire non associé** opérationnel : édition planning vét uniquement (flag ASV prêt pour plus tard), congés soumis à validation **des associés seulement**, aucun accès dashboard/réglages.
- Rôles existants intacts ; flux d'approbation ASV inchangé ; autorisations d'écriture cohérentes (front + Deno + contrat).
- Lint 0/0, build, tests unitaires + TNR verts.
- Bilan final : correspondance des rôles retenue, migration à exécuter, et mes actions restantes (déploiement SQL + Edge Functions, attribution du rôle aux comptes concernés).
