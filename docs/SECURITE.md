# Sécurité — Amivet PULSE

Document de référence unique. Dernière mise à jour : Phase PDF (juillet 2026).

---

## Règles immuables

| Règle | Raison |
|---|---|
| La clé `anon` Supabase **reste dans `src/config.js`** — ne pas la déplacer | Elle est publique par design (protégée par RLS), présente dans le bundle de toute façon |
| Aucun secret (`service_role`, `BREVO_API_KEY`, `VAPID_PRIVATE_KEY`…) dans le code ou les commits | Secrètes = côté serveur uniquement, dans les variables d'environnement Supabase |
| Toute modification SQL ou Edge Function est **présentée à l'admin avant application** | Risque d'interruption de service si la migration est incorrecte |
| Tout déploiement vers Supabase est manuel — jamais automatisé depuis les scripts | Les Edge Functions et migrations ne sont pas déployées automatiquement par CI |

---

## Architecture de défense (Phase 6 + 7)

### 1. Contrôle d'accès (RLS)

- **`planning_data`** : lecture publique (anon), écriture bloquée côté REST — toutes les écritures passent par `save-planning` (service_role vérifié côté Edge Function). Migration `20260714000001` (corrigée Phase 8 : `CREATE POLICY IF NOT EXISTS` invalide → `DROP + CREATE`).
  - **Vérification requise** : après tout rejeu de `20260714000001`, confirmer la présence de la policy via `select policyname, cmd, permissive, qual, with_check from pg_policies where tablename = 'planning_data';` — doit afficher `block direct writes`, type RESTRICTIVE, `with_check = false`. ✅ *Vérifié le 2026-07-14 via pg_policies — `block direct writes` RESTRICTIVE, with_check = false. PATCH direct ASV → `Marqueur écrit ? false` confirmé.*
- **8 tables sensibles** (`monthly_signatures`, `email_settings`, `cp_adjustments`, `announcements`, `announcement_reads`, `push_subscriptions`, `medical_visits`, `app_security`) : RLS restrictive — accès en lecture limité à l'utilisateur concerné ou aux admins. Migration `20260713000001`.
- **`monthly_signatures` (Phase PDF)** : migration `20260714000004` — PK `id uuid`, index unique partiel `(person_id, year, month) WHERE status='signed'`. **INSERT / UPDATE / DELETE** réservés exclusivement au `service_role` (Edge Functions `confirm-signature`, `upload-signed-pdf`, `reject-signature`) — aucune policy client pour ces opérations. Soft-delete : les feuilles rejetées (`status='rejected'`) sont conservées en historique.
- **Bucket Storage `signed-sheets`** (Phase PDF) : privé, PDF uniquement (5 Mo max). Lecture : vétérinaires et admins uniquement via `auth.jwt() ->> 'role' IN ('vet', 'admin')`. Upload : `service_role` exclusivement (Edge Function `upload-signed-pdf`).

- **`feedback`** (signalements utilisateurs, migration `20260816000001`) : RLS **inverse** de celle d'`announcements` — chacun insère la sienne (`WITH CHECK reported_by = auth.uid() AND status = 'nouveau' AND admin_note IS NULL`), chacun relit les siennes, **l'admin seul** lit tout et modifie. Le front écrit en PostgREST direct avec le JWT utilisateur : sans ce `WITH CHECK`, n'importe qui pourrait signaler au nom d'un collègue ou s'auto-classer « corrigé ». `clinic_id` existe pour le portage VetPulse mais **n'est référencé par aucune policy** — l'isolation inter-cliniques n'est donc **pas** acquise.
  - `tests/unit/feedback-rls.test.js` verrouille le texte des prédicats contre un affaiblissement ; il ne prouve pas que Postgres les applique.
  - **Vérification structurelle, automatisée** : `verify_security_invariants()` (migration `20260816000002`) porte cinq contrôles `feedback` — RLS activée, 5 politiques toutes limitées à `authenticated`, aucune politique inconditionnelle, `WITH CHECK` d'insertion lié à `auth.uid()` et au statut `nouveau`, purge réservée au `service_role`. Lancés par `node scripts/verify-prod.mjs`. ✅ *Passé le 2026-08-16 — 9 invariants verts, dont le `WITH CHECK` d'insertion relu en base : `((reported_by = auth.uid()) AND (status = 'nouveau') AND (admin_note IS NULL) AND (resolved_at IS NULL))`.*
  - **Vérification comportementale** : coller `scripts/feedback-rls-check.sql` dans le SQL Editor. Le script choisit lui-même une ASV et l'admin parmi les comptes existants, tente l'usurpation d'auteur, l'auto-classement, la lecture croisée et la modification par un non-admin, puis affiche un tableau — les 8 lignes doivent être `ok = true`. Encadré par `BEGIN … ROLLBACK` : rien n'est écrit en base. ✅ *Passé le 2026-08-16 — les 8 contrôles verts : usurpation d'auteur refusée, naissance en « corrigé » refusée, insertion légitime acceptée, aucune ligne d'autrui visible, aucune modification possible par un non-admin, lecture complète pour l'admin.*
  - **Chemin anonyme** : `GET /rest/v1/feedback` avec la clé `anon` renvoie `[]` et `content-range: */0`. ✅ *Vérifié le 2026-08-16 — un appelant non authentifié ne voit aucun signalement.*
  - **Données personnelles** : un signalement contient un texte libre écrit par un salarié, plus son rôle, l'écran consulté et son user-agent. Lisible de l'auteur et de l'admin seuls. **Rétention : 15 jours** (décision du 16/08/2026), appliquée par `purge_old_feedback()` via `scripts/feedback-purge.mjs`. La purge porte sur `created_at`, donc elle emporte aussi les signalements non traités.

> **Piège critique** : ne **jamais** référencer `user_profiles` dans ses propres politiques RLS. Cela provoque une récursion infinie qui bloque toutes les connexions. Voir migration `20240515000001_fix_rls_recursion.sql`.

### 2. Content Security Policy

Meta-tag dans `index.html` :
- `script-src 'self'` — aucun script inline non noncé, aucun CDN JS
- `connect-src 'self' https://*.supabase.co` — API Supabase uniquement
- `font-src 'self'` — Inter auto-hébergé dans `public/fonts/` (woff2)
- `object-src 'none'` — pas de plugin Flash/PDF embarqué
- Limite : `frame-ancestors` impossible en meta-CSP (limitation GitHub Pages) — le clickjacking ne peut pas être bloqué sans hébergement dédié (voir § Limites)

### 3. CORS

Toutes les Edge Functions exposées retournent `Access-Control-Allow-Origin: https://jtechserge.github.io` — jamais `*`. Phase 6 Lot 4.

### 4. Rate limiting

Fonction SQL `check_rate_limit()` (SECURITY DEFINER) + table `rate_limit_log`. Seuils par IP + endpoint :

| Edge Function | Fenêtre | Seuil |
|---|---|---|
| `manage-users` | 1 heure | 10 req |
| `request-signature` | 1 heure | 20 req |
| `send-leave-recap` | 1 heure | 5 req |

### 5. Tokens calendar-feed

Stockage SHA-256 uniquement depuis la migration `20260713000002`. Le plain text n'est jamais en base. La fonction SQL `verify_calendar_sync_token` compare les hashs. **Les tokens existants au moment de la migration ont été invalidés** — les vétérinaires doivent régénérer leur lien.

### 6. Sécurité frontend

- `ui.js` réécrit sans `innerHTML` pour les données utilisateurs (`showToast`, `openConfirmModal`) — Phase 6 Lot 2
- 53 sinks `innerHTML` audités et annotés `// eslint-disable-next-line no-unsanitized/property`
- ESLint + plugin `no-unsanitized` configurés — 0 warning autorisé (`--max-warnings=0`)
- Cache Service Worker purgé au logout (`PURGE_DYNAMIC_CACHE`) — évite la fuite de données sensibles en fin de session

---

## CI sécurité (`.github/workflows/security.yml`)

| Outil | Fréquence | Ce qu'il vérifie |
|---|---|---|
| **CodeQL** | push + PR + lundi 03h00 | Analyse statique JS/TS (injections, flux non sûrs) |
| **gitleaks** | push + PR | Secrets dans l'historique git complet |
| **npm audit** | push + PR | Dépendances npm à haut risque (`--audit-level=high`) |
| **Dependabot** | hebdomadaire | Mises à jour npm et GitHub Actions |

---

## Vérification post-déploiement

Après tout déploiement SQL ou Edge Function, lancer :
```bash
SUPABASE_SERVICE_ROLE_KEY="..." node scripts/verify-prod.mjs
```
Ou depuis GitHub → Actions → **"Vérification invariants de sécurité (prod)"** → Run workflow.

Le script appelle `rpc/verify_security_invariants()` (migration `20260714000003`) et vérifie :
- ✅ Policy `block direct writes` présente et RESTRICTIVE sur `planning_data`
- ✅ Fonction `check_rate_limit` présente
- ✅ Fonction `get_calendar_feed_access` présente
- ✅ `calendar_sync_tokens.token = NULL` partout

---

## État des migrations (Phase 6–8)

Toutes les migrations sont déployées en production. Voir `supabase/README.md` pour l'inventaire complet.

| Fichier | Statut |
|---|---|
| `20260713000001_tighten_rls.sql` | ✅ Déployé |
| `20260713000002_rate_limits_and_token_hash.sql` | ✅ Déployé |
| `20260714000001_lock_planning_writes.sql` | ✅ Déployé — **à rejouer** (correction Phase 8 : `IF NOT EXISTS` invalide supprimé) |
| `20260714000002_fix_calendar_hash_functions.sql` | ✅ Déployé |
| `20260714000004_monthly_signatures_v2.sql` | ✅ Déployé (Phase PDF) |

---

## Edge Functions (état Phase PDF)

| Fonction | Rôle | Déployée |
|---|---|---|
| `manage-users` | Gestion utilisateurs (admin) | ✅ |
| `confirm-signature` | Valide le token, insère la signature, renvoie `signature_id` | ✅ |
| `upload-signed-pdf` | Reçoit le PDF base64, upload dans `signed-sheets`, stocke `pdf_path` | ✅ |
| `reject-signature` | Soft-delete d'une signature (vet/admin) — status → `rejected` | ✅ |
| `request-signature` | Génère le lien d'email de signature | ✅ |
| `send-leave-recap` | Récapitulatif congés hebdomadaire | ✅ |
| `push-server` | Notifications push PWA | ✅ |
| `save-planning` | Sauvegarde le planning (service_role) | ✅ |

Toutes les fonctions retournent `Access-Control-Allow-Origin: https://jtechserge.github.io` (jamais `*`).

Pour redéployer une fonction :
```bash
npx supabase functions deploy <nom> --project-ref ubowqtowyqmpraoxbaoo
```

---

## Chantier « surfaces anon » (05/09/2026) — ✅ DÉPLOYÉ le 06/09/2026

Fermeture des surfaces atteignables avec la seule clé publique `anon`. **Les
quatre migrations sont appliquées, les trois Edge Functions et le front sont
déployés** (06/09/2026, ~07h40). La procédure suivie et son ordre imposé sont
dans `docs/RUNBOOK-DEPLOIEMENT.md`, section « Chantier surfaces anon ».

Vérifié en production après application : aucune policy réellement ouverte à
`anon`, RLS active sur toutes les tables, `anon = false` sur les dix fonctions
CalDAV et calendrier, flux ICS toujours servi (HTTP 400 sur jeton invalide, pas
502), `caldav-push` et `push-server` en **401 sur appel anonyme**, les six
fonctions du mot de passe absentes, `app_security` réduite à `id`/`updated_at`.

| Lot | Livrable | Ce qui était ouvert |
|---|---|---|
| 0 | `20260905000001_close_anon_policies.sql` | 27 policies RLS ouvertes à `anon` sur 10 tables, dont `medical_visits` (données de santé) |
| 1 | `20260905000002_caldav_owner_guard.sql` | Les identifiants CalDAV s'écrivaient avec un `person_id` fourni par l'appelant : un associé pouvait écraser le mot de passe d'application Apple de l'autre |
| 2 | `20260905000003_calendar_token_guard.sql` + `calendar-feed` | Le lien ICS de n'importe quel vétérinaire se générait ou se révoquait avec la clé publique — donc son planning se lisait sans compte |
| 3 | `caldav-push`, `push-server` | Les deux seules Edge Functions sans aucune vérification : un POST anonyme effaçait le calendrier iCloud d'un associé ou notifiait tous les collaborateurs |
| 4 | `20260905000004_drop_password_functions.sql` | Six fonctions du mot de passe partagé, toutes `GRANT` à `anon`, sans appelant depuis le passage aux comptes individuels |

**Modèle d'autorisation retenu (option C).** Les identifiants CalDAV sont réservés
au **propriétaire strict** — le mot de passe d'application Apple est un secret
personnel. Le lien ICS, lui, est ouvert au **propriétaire OU à vet/admin** : c'est
un jeton de lecture d'un planning déjà partagé entre les deux associés, et ce choix
aligne les fonctions sur la policy « owner or vet reads token » que
`calendar_sync_tokens` porte depuis `20240515000001`.

**Un compte de gestion n'a pas de `person_id`, et cela ne doit pas l'enfermer
dehors.** Le compte `admin` de la clinique ne figure pas au planning : aucun
collaborateur ne lui correspond, et lui en attribuer un de complaisance mettrait
dans la colonne un identifiant qui ne désigne personne. Les cinq fonctions
« propriétaire OU vet/admin » consultent donc le **rôle en premier**, et ne
retombent sur le `person_id` que pour les comptes sans rôle de gestion. Écrit
dans l'autre sens — `v_caller IS NULL` d'abord — le court-circuit refusait à ce
compte l'écran de synchronisation entier ; c'était l'état des migrations jusqu'au
pré-vol du déploiement, qui l'a révélé et fait corriger avant application.

Le `coalesce(get_my_role(), '')` de ces gardes n'est pas une coquetterie :
`get_my_role()` rend `NULL` pour un JWT sans profil, `NULL NOT IN (…)` vaut
`NULL`, et un `IF` qui reçoit `NULL` n'exécute pas sa branche. Sans lui, la garde
s'ouvrirait au lieu de se fermer. Les deux fonctions d'écriture CalDAV, elles,
gardent le refus sec sur un appelant sans `person_id` : sans calendrier, rien à
enregistrer.

**Deux fonctions ont échappé au chantier, et c'est instructif.** Le lendemain du
déploiement, `npx supabase functions list` a révélé **15 fonctions déployées pour
13 sources au dépôt**. `send-leave-recap` et `send-password-reset` avaient été
déployées depuis l'ancien emplacement iCloud et leurs sources n'ont pas suivi le
déménagement. **Les deux étaient appelables avec la seule clé publique** — un
`verify_jwt: true` ne protège de rien, puisque la clé `anon` est un JWT valide.
Le chantier n'a pu fermer que ce dont il voyait le code : un audit qui ne lit que
le dépôt manque tout ce que le dépôt a perdu. Détail, code archivé et geste
restant : `supabase/functions-retirees/README.md` et `docs/DETTE.md`.

**Exceptions assumées, à ne pas « corriger » par erreur :**

- `calendar-feed` **reste public**. Le flux ICS est un lien porteur, consulté par un
  téléphone qui n'a aucune session Supabase. Un garde JWT y couperait tous les
  abonnements. Sa protection est le token, pas l'authentification.
- `push-server` **accepte tous les rôles**, ASV compris : ce sont eux qui déclenchent
  les notifications de demande de congé. Un filtre vet/admin couperait la chaîne
  sans erreur visible.
- L'action `clear` de `caldav-push` est réservée au **propriétaire**, y compris pour
  un admin. Conséquence consignée en dette : le calendrier Apple d'un collaborateur
  parti ne peut plus être purgé après la suppression de son compte.

**Preuve.** `tests/unit/anon-surface.test.js` — 46 tests de contrat qui lisent les
migrations et les Edge Functions. Ils constatent l'intention du code, pas le
comportement de Postgres : il n'existe pas de compte de test Supabase.

---

## Suppression définitive d'un collaborateur (action `purge`)

Chantier « suppression définitive d'un collaborateur » (16/08/2026). Procédure
d'exploitation et liste exacte de ce qui est détruit : `docs/EXPLOITATION.md`.

**Contrôle d'accès.** L'action `purge` de `manage-users` vérifie le jeton de
l'appelant, puis lit son rôle dans `user_profiles` : tout ce qui n'est pas
`admin` est refusé avant la moindre suppression
(`supabase/functions/manage-users/index.ts`). L'interface ne fait qu'afficher le
bouton — **le contrôle est côté serveur, pas côté écran**.

**Le RLS est contourné, par conception.** La purge s'exécute avec la
`SUPABASE_SERVICE_ROLE_KEY` : elle traverse toutes les policies. C'est
nécessaire — supprimer les lignes d'autrui dans neuf tables, puis un compte
`auth` — et c'est précisément pourquoi le contrôle de rôle ci-dessus est le seul
rempart réel.

**Irréversibilité assumée.** Aucune corbeille, aucun `undo`, **aucun journal
d'audit** : rien ne trace qui a supprimé qui, ni quand. Les garde-fous sont en
amont — double palier de confirmation dès qu'un mois est signé (preuve
juridique), et la sauvegarde chiffrée quotidienne comme unique voie de retour.

**Vérification.** `scripts/verif-purge-collaborateur.sql`, à rejouer après toute
migration touchant une table purgée. C'est la seule preuve d'effet réel : le
test de contrat prouve l'intention du code, pas le comportement de la base.

---

## Limites connues (points acceptés)

| Limite | Raison | Mitigation |
|---|---|---|
| `frame-ancestors` impossible | Limitation structurelle GitHub Pages (meta-CSP ne couvre pas cet en-tête) | Évaluer lors d'une migration vers Cloudflare Pages ou Netlify |
| Aucun journal d'audit des suppressions | Décision du 16/08/2026 (§6 de la note) : pas de corbeille, pas d'`undo`, pas de trace | Double palier de confirmation si un mois est signé + sauvegarde quotidienne |
| La purge n'a pas de preuve d'effet automatisée | Aucun compte de test Supabase (`CLAUDE.md`) : ni vitest ni Playwright ne franchissent le login | `scripts/verif-purge-collaborateur.sql` en manuel ; depuis le lot B, un échec de purge est bruyant et bloquant |
| `sessionStorage` pour les tokens Supabase | Défaut du SDK Supabase JS, lisible par un XSS résiduel | Acceptable avec la CSP et `no-unsanitized` en place ; à reconsidérer si le périmètre XSS s'étend |

---

## Routine de correction automatique des signalements (chantier 08/2026)

Périmètre écrit au lot 4 du chantier ; les règles d'exploitation complètes
arriveront avec l'ouverture (lot 6, `EXPLOITATION.md`).

### Ce que la routine a le droit de faire

- **Écrire dans `feedback` uniquement**, et uniquement via
  `scripts/feedback-mark.mjs` : transitions gardées par le statut de départ
  (compare-and-set), idempotentes, sans écrasement des statuts terminaux ni
  des prises en charge humaines. Elle ne touche jamais une ligne dont
  l'`admin_note` ne porte pas son marqueur `[routine <horodatage>]`.
- **Modifier du code uniquement dans la frontière** de
  `scripts/feedback-frontier.mjs` (refus par défaut ; liste blanche :
  `src/config.js`, `src/style.css`), et uniquement via branche + PR — jamais
  de push sur `main` (ruleset `protection-main`, check `tests` requis).

### Ce qui lui est interdit, même si l'outillage le permet

Le connecteur Supabase des sessions Claude a des pouvoirs d'administration
(SQL direct, migrations, déploiement d'Edge Functions) très supérieurs au
besoin de la routine. **Consigné comme risque assumé, borné par la règle :
la routine n'utilise jamais `execute_sql`, `apply_migration` ni
`deploy_edge_function` en écriture.** Restreindre le connecteur (mode
lecture seule, scope) dès que l'interface le permet.

### Arrêt d'urgence

Créer le fichier **`ARRET-CORRECTIONS.md`** à la racine du dépôt sur `main`
— depuis l'interface web GitHub, téléphone compris : *Add file → Create new
file*, avec le motif en contenu. Toute routine qui démarre lit ce fichier
avant la moindre écriture (`readEmergencyStop`) et s'arrête en remontant le
motif. Supprimer le fichier rouvre la voie. **À essayer une fois avant le
premier run à blanc du lot 5** — l'essai fait partie de la définition de
« terminé » du chantier.
