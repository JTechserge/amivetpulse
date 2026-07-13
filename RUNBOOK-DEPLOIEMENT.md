# Runbook de déploiement — Amivet PULSE (Phase 6 + 7)

Procédure ordonnée pour passer l'ensemble des correctifs de sécurité en production.
Durée estimée : **20–30 minutes** (hors communication aux vétérinaires).

> **Règle générale** : chaque étape doit être vérifiée avant de passer à la suivante.
> En cas d'échec, ne pas continuer — diagnostiquer et corriger d'abord.

---

## État au moment de la rédaction

| Élément | Statut |
|---|---|
| Migration `20260713000001_tighten_rls.sql` | ⏳ Non déployée |
| Migration `20260713000002_rate_limits_and_token_hash.sql` | ⏳ Non déployée — **invalide les tokens calendar existants** |
| Migration `20260714000001_lock_planning_writes.sql` | ✅ Déployée (Phase 7 Lot 1) |
| Edge Function `save-planning` | ✅ Déployée (Phase 7 Lot 1) |
| Edge Function `request-signature` | ✅ Redéployée (Phase 7 Lot 2 — module `asv-hours` partagé) |
| Edge Function `manage-users` (CORS) | ⏳ À redéployer |
| Edge Function `confirm-signature` (CORS) | ⏳ À redéployer |
| Edge Function `send-leave-recap` (CORS) | ⏳ À redéployer |
| Edge Function `push-server` (CORS) | ⏳ À redéployer |
| Branche `hardening/2026-07-phase7` → `main` | ⏳ À merger |

---

## Pré-requis

- [ ] Supabase CLI installé (`supabase --version`)
- [ ] Accès au Supabase Dashboard (projet `ubowqtowyqmpraoxbaoo`)
- [ ] Accès GitHub (pour le merge final)
- [ ] Prévenir les vétérinaires : **leurs liens de synchronisation calendrier seront invalidés** à l'étape 2b (ils devront régénérer un lien dans ⚙️ Paramètres)

---

## Étape 1 — Migration RLS restrictive

**Fichier** : `supabase/migrations/20260713000001_tighten_rls.sql`

**Ce que ça fait** : reserre les politiques RLS sur 8 tables — `monthly_signatures`, `email_settings`, `cp_adjustments`, `announcements`, `announcement_reads`, `push_subscriptions`, `medical_visits`, `app_security`. Remplace des politiques `USING (true)` par des contrôles basés sur `auth.uid()` et `auth.jwt() ->> 'role'`.

**⚠️ Impact** : les comptes ASV (rôle non-admin) perdent l'accès en écriture sur les réglages email et la possibilité de supprimer des signatures d'autres personnes. Comportement attendu.

**Procédure** :
1. Supabase Dashboard → SQL Editor → New query
2. Coller le contenu de `supabase/migrations/20260713000001_tighten_rls.sql`
3. Cliquer **Run**
4. Vérifier qu'aucune erreur ne s'affiche

**Vérification** :
- Se connecter avec un compte ASV (non admin)
- Tenter de modifier les réglages email → doit retourner une erreur RLS
- Tenter de voir les feuilles de présence des autres → accès limité à la sienne

---

## Étape 2a — Migration rate limiting + hash token (préparation)

**Fichier** : `supabase/migrations/20260713000002_rate_limits_and_token_hash.sql`

**Ce que ça fait** :
- Crée la table `rate_limit_log` et la fonction SQL `check_rate_limit()` (appelée par les Edge Functions)
- Remplace `generate_calendar_sync_token()` et `verify_calendar_sync_token()` par des versions qui stockent et comparent uniquement le SHA-256 du token
- Met à NULL la colonne `token` en clair des tokens existants → **invalide tous les liens de synchronisation calendrier actuels**

**⚠️ Ce qui se passe si on déploie sans prévenir les vétérinaires** : leurs liens iCal dans Apple Calendrier / Google Agenda cesseront de fonctionner silencieusement. L'OS continuera de tenter des syncs qui retourneront 401.

**Procédure** :
1. Supabase Dashboard → SQL Editor → New query
2. Coller le contenu de `supabase/migrations/20260713000002_rate_limits_and_token_hash.sql`
3. Cliquer **Run**
4. Vérifier qu'aucune erreur ne s'affiche

---

## Étape 2b — Communication aux vétérinaires (immédiatement après l'étape 2a)

Envoyer le message suivant aux vétérinaires (David, Stéphane) :

> Bonjour, suite à une mise à jour de sécurité, votre lien de synchronisation calendrier a été réinitialisé. Pour rétablir la synchronisation sur votre iPhone/Android :
> 1. Ouvrir Amivet PULSE → ⚙️ Paramètres → Synchronisation calendrier
> 2. Cliquer **Révoquer et générer un nouveau lien**
> 3. Ajouter le nouveau lien à votre application Calendrier

---

## Étape 2c — Vérification migration rate limiting

- Dans l'app, générer un nouveau token calendar-feed (⚙️ Paramètres → Synchronisation calendrier)
- Ouvrir le lien iCal dans un navigateur → doit retourner du contenu `.ics` (non une erreur 401)
- Vérifier que `rate_limit_log` existe : SQL Editor → `SELECT COUNT(*) FROM rate_limit_log;` → doit retourner 0 (table vide)

---

## Étape 3 — Redéploiement des Edge Functions (CORS)

Ces 4 fonctions ont été modifiées pour restreindre le CORS de `*` à `https://jtechserge.github.io`. Elles nécessitent également la fonction `check_rate_limit()` créée à l'étape 2 (pour 3 d'entre elles).

**Pré-requis** : étape 2a complétée (sinon `manage-users`, `request-signature`, `send-leave-recap` planteront au démarrage avec une erreur fonction SQL manquante).

```bash
# Depuis la racine du projet :
supabase functions deploy manage-users      --project-ref ubowqtowyqmpraoxbaoo
supabase functions deploy confirm-signature --project-ref ubowqtowyqmpraoxbaoo
supabase functions deploy send-leave-recap  --project-ref ubowqtowyqmpraoxbaoo
supabase functions deploy push-server       --project-ref ubowqtowyqmpraoxbaoo
```

**Vérification CORS** (depuis un terminal, pas depuis `jtechserge.github.io`) :

```bash
curl -si -X OPTIONS \
  -H "Origin: https://example.com" \
  "https://ubowqtowyqmpraoxbaoo.supabase.co/functions/v1/manage-users" \
  | grep -i "access-control-allow-origin"
# Doit retourner : Access-Control-Allow-Origin: https://jtechserge.github.io
# (pas "https://example.com", pas "*")
```

**Vérification rate limiting** (test du seuil sur `manage-users` — 10 req/h) :

Depuis un script ou Postman, envoyer 11 requêtes `POST` à `manage-users` avec un token valide. La 11e doit retourner `HTTP 429 Too Many Requests`.

---

## Étape 4 — Merge de la branche et déploiement frontend

La branche `hardening/2026-07-phase7` contient 5 commits au-dessus de `main` (fast-forward propre) :
- Lot 1 : `save-planning` Edge Function + migration lock planning
- Lot 2 : suppression `openConfirmModalHtml` + module `asv-hours` partagé + tests de contrat
- Lot 3 : découpage `dashboard.js` → `dashboard-stats.js` + `leave-requests.js`
- Lot 4 : `SECURITE.md` + `supabase/README.md` + `README.md`
- Lot 5 : ce runbook

```bash
git checkout main
git merge hardening/2026-07-phase7   # fast-forward, pas de conflit
git push origin main
```

Le push déclenche automatiquement via GitHub Actions :
- Le build Vite + déploiement sur GitHub Pages (`gh-pages`)
- Le workflow de sécurité (`security.yml` : CodeQL + gitleaks + npm audit)

**Durée estimée** : 2–3 minutes pour que le déploiement GitHub Pages soit actif.

---

## Étape 5 — Smoke test production

Ouvrir https://jtechserge.github.io/amivetpulse/ dans un onglet de navigation privée (pas de cache).

**Checklist** :

- [ ] La page se charge sans erreur console (F12 → Console)
- [ ] L'écran de connexion s'affiche (pas de données résiduelles du cache SW)
- [ ] Se connecter avec un compte admin → accès au tableau de bord
- [ ] Tableau de bord → onglet "Suivi ASV" → les cartes heures s'affichent
- [ ] Tableau de bord → onglet "Feuilles signées" → tableau des signatures visible
- [ ] Tableau de bord → onglet "Demandes de congé" → pas d'erreur JS
- [ ] (Admin) Aller dans ⚙️ Paramètres → Synchronisation calendrier → générer un lien → tester le lien iCal
- [ ] Vérifier dans l'onglet Réseau (DevTools) que les requêtes Supabase retournent 200 (pas 401/403)

**Vérification CSP** :
```
F12 → Console → chercher "Content Security Policy" ou "Refused to"
→ Aucun blocage CSP ne doit apparaître lors de l'utilisation normale
```

---

## En cas de problème

### Rollback migrations SQL

Les migrations RLS et rate limiting ne peuvent pas être rollbackées automatiquement. En cas de régression :

- **RLS trop restrictive** : identifier la politique concernée dans `20260713000001_tighten_rls.sql` et la DROP/recréer avec les paramètres de la migration précédente via SQL Editor.
- **Rate limiting bloquant un usage légitime** : `DELETE FROM rate_limit_log WHERE endpoint = '<endpoint>' AND identifier = '<ip>';` pour réinitialiser le compteur d'une IP spécifique.

### Rollback frontend (GitHub Pages)

```bash
# Revenir au commit précédent sur main :
git revert HEAD --no-edit
git push origin main
```

GitHub Pages sera mis à jour en 2–3 minutes.

### Edge Function qui ne répond plus

```bash
# Redéployer la version précédente depuis l'historique git :
git stash  # si des changements locaux existent
supabase functions deploy <nom-function> --project-ref ubowqtowyqmpraoxbaoo
```

---

## Post-déploiement — Actions facultatives

- [ ] Archiver les branches `hardening/2026-07-phase6` et `hardening/2026-07-phase7` (ou les supprimer si le travail est terminé)
- [ ] Vérifier que le premier run CodeQL (déclenché par le push sur `main`) s'est terminé sans finding critique — GitHub → Actions → Security
- [ ] Mettre à jour le statut des migrations dans `supabase/README.md` (passer ⏳ → ✅ pour les deux migrations déployées)
