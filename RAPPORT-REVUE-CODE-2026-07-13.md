# Rapport de revue — Amivet PULSE (13/07/2026)

Revue complète post-Phase 5 : 19 modules frontend (~7 900 lignes), 7 Edge Functions, 14 migrations SQL, SW, CI. Build, TNR (75 tests) et `npm audit` (0 vulnérabilité) verts au moment de la revue.

## Verdict global

La modularisation est une réussite : `app.js` est passé de 7 408 à 927 lignes, le pattern d'injection est appliqué proprement, les migrations sont organisées, les fichiers parasites (`.pptx`, SQL racine) ont été nettoyés. L'échappement XSS des contenus utilisateurs est **largement meilleur que ce que je craignais** : annonces (titre + contenu), commentaires de jour, motifs d'absence — tout ce que j'ai tracé est passé par `escapeHTML()`. En revanche, **la Phase 2 sécurité n'avait jamais été exécutée** : CSP, RLS, CORS, rate limiting étaient exactement dans l'état de l'audit initial. Ces points ont été traités en Phase 6 (Lots 1-6, branche `hardening/2026-07-phase6`).

---

## Statut des 11 points de sécurité après Phase 6

| # | Sévérité | Problème | Statut | Lot |
|---|----------|----------|--------|-----|
| 1 | Élevée | RLS permissive (`using (true)` sur planning, signatures, email_settings…) | ✅ Corrigé — migration SQL prête (`20260713000001_tighten_rls.sql`) — **À déployer** | Lot 3 |
| 2 | Élevée | Aucune CSP | ✅ Corrigé — `<meta http-equiv="Content-Security-Policy">` dans `index.html` | Lot 4 |
| 3 | Moyenne | Sinks XSS dans `ui.js` (`showToast`, `openConfirmModal`) + 53 sinks innerHTML | ✅ Corrigé — `ui.js` réécrit (createElement/textContent) ; 53 sinks audités et annotés | Lot 2 |
| 4 | Moyenne | CORS `Access-Control-Allow-Origin: '*'` sur les Edge Functions | ✅ Corrigé — restreint à `https://jtechserge.github.io` sur les 5 fonctions exposées — **À redéployer** | Lot 4 |
| 5 | Moyenne | Aucun rate limiting sur `manage-users`, `request-signature`, `send-leave-recap` | ✅ Corrigé — `check_rate_limit()` SQL + appel dans les 3 fonctions (10/20/5 par heure) — **À déployer** | Lot 5 |
| 6 | Moyenne | Tokens calendar-feed en clair dans la base | ✅ Corrigé — stockage SHA-256 uniquement, colonne `token` mise à NULL (`20260713000002`) — **À déployer** | Lot 5 |
| 7 | Moyenne | Cache SW non purgé au logout | ✅ Corrigé — `authSignOut()` envoie `PURGE_DYNAMIC_CACHE` au SW | Lot 5 |
| 8 | Faible | Aucune CI sécurité (CodeQL, gitleaks, npm audit, dependabot) | ✅ Corrigé — `security.yml` + `dependabot.yml` créés | Lot 6 |
| 9 | Faible | Google Fonts (CDN tiers bloquant une CSP stricte) | ✅ Corrigé — Inter v20 auto-hébergé (`public/fonts/`, 2 fichiers woff2) | Lot 4 |
| 10 | Faible | Session en `sessionStorage` — lisible par tout XSS | ✅ Accepté — le risque XSS est couvert par les points 2-3 ; `sessionStorage` est le défaut Supabase JS | — |
| 11 | Faible | `frame-ancestors` impossible en meta-CSP (clickjacking) | ✅ Accepté — limite structurelle de GitHub Pages, à documenter pour une future migration d'hébergement | — |

**Bug fonctionnel** : `CP_DAYS_PER_MONTH` non importé dans `dashboard.js` → corrigé au Lot 1 (import ajouté, ESLint 0 erreur, 0 warning).

---

## ✅ Ce que Phase 6 a livré (prêt à merger/déployer)

### Côté code (déjà commité sur `hardening/2026-07-phase6`)
- **ESLint** : plugin `no-unsanitized` configuré, 53 sinks innerHTML annotés, `ui.js` réécrit sans `innerHTML` pour les données utilisateurs. 0 warning, 0 erreur.
- **CSP** : meta-tag dans `index.html` couvrant script-src, connect-src (Supabase uniquement), font-src self, no object-src.
- **Fonts** : Inter variable (latin + latin-ext) auto-hébergé dans `public/fonts/`, Google Fonts supprimé.
- **CORS** : `'*'` → `'https://jtechserge.github.io'` sur les 5 Edge Functions modifiées.
- **SW** : `PURGE_DYNAMIC_CACHE` handler + appel dans `authSignOut()`.
- **Rate limiting** : `rate_limit_log` table, `check_rate_limit()` SECURITY DEFINER, intégré dans `manage-users`, `request-signature`, `send-leave-recap`.
- **Hash token** : `generate_calendar_sync_token` stocke SHA-256 uniquement, `verify_calendar_sync_token` compare le hash — le plain text n'est plus jamais en base.
- **CI** : CodeQL + gitleaks (historique complet) + npm audit (--audit-level=high) + dependabot npm & github-actions.

---

## ⚠️ Actions manuelles requises (à faire dans Supabase + re-déploiement)

> Ces actions ne peuvent pas être automatisées : elles modifient l'infrastructure de production.

### 1. Exécuter les migrations SQL dans le SQL Editor Supabase

**Migration 1** — `supabase/migrations/20260713000001_tighten_rls.sql`

Durcit les RLS sur 8 tables : `app_security`, `monthly_signatures`, `email_settings`, `cp_adjustments`, `announcements`, `announcement_reads`, `push_subscriptions`, `medical_visits`.

```
Supabase Dashboard → SQL Editor → coller le contenu du fichier → Run
```

**Vérification post-exécution** : se connecter en tant qu'ASV (non admin) et tenter de modifier des réglages email ou de supprimer la signature de quelqu'un — doit retourner une erreur RLS.

---

**Migration 2** — `supabase/migrations/20260713000002_rate_limits_and_token_hash.sql`

Crée `rate_limit_log`, `check_rate_limit()`, remplace `generate_calendar_sync_token()` et `verify_calendar_sync_token()` par des versions qui stockent SHA-256 uniquement. **Invalide les tokens calendar-feed existants** (colonne `token` mise à NULL).

```
Supabase Dashboard → SQL Editor → coller le contenu du fichier → Run
```

**⚠️ Communication requise** : prévenir les vétérinaires que leur lien de synchronisation calendrier est invalidé. Ils doivent régénérer leur lien dans l'app : `⚙️ Paramètres → Synchronisation calendrier → Révoquer et générer un nouveau lien`.

**Vérification post-exécution** :
1. Régénérer un token → vérifier que le lien iCal fonctionne dans Apple Calendrier
2. Tenter d'appeler `manage-users?action=invite` 11 fois en 1h → 11e appel doit retourner HTTP 429

---

### 2. Redéployer les 5 Edge Functions modifiées

Les Edge Functions ne sont pas déployées automatiquement depuis git. Exécuter depuis la racine du projet (Supabase CLI requis) :

```bash
supabase functions deploy manage-users --project-ref ubowqtowyqmpraoxbaoo
supabase functions deploy confirm-signature --project-ref ubowqtowyqmpraoxbaoo
supabase functions deploy send-leave-recap --project-ref ubowqtowyqmpraoxbaoo
supabase functions deploy request-signature --project-ref ubowqtowyqmpraoxbaoo
supabase functions deploy push-server --project-ref ubowqtowyqmpraoxbaoo
```

**Changements déployés par cette commande** : CORS restreint + rate limiting (3 fonctions) + hash token (calendar-feed, via la migration SQL qui modifie les fonctions SQL appelées par la function Edge).

**Vérification** : depuis un autre domaine que `jtechserge.github.io`, une requête OPTIONS doit retourner `Access-Control-Allow-Origin: https://jtechserge.github.io` (non `*`).

---

### 3. Merger la branche et activer la CI

```bash
git checkout main
git merge hardening/2026-07-phase6
git push origin main
```

**Puis dans GitHub** : Settings → Code security → activer CodeQL si demandé. Le premier run de `security.yml` se déclenche automatiquement au push.

---

## Ce qui reste ouvert (hors scope Phase 6)

- **`dashboard.js` (1 834 l.)** mélange stats, graphiques, demandes et visites médicales → candidat à une Phase 7 de découpage si le fichier continue de grossir.
- **Duplication règles ASV** entre `request-signature/index.ts` et `app.js` → risque de divergence lors de futures évolutions des règles légales. À couvrir par un test de contrat ou extraire dans un module partagé Deno.
- **`frame-ancestors`** impossible en meta-CSP (clickjacking) → nécessiterait un hébergement différent (Cloudflare Pages, Netlify) pour envoyer l'en-tête HTTP. À évaluer lors d'une future migration.
- **`sessionStorage`** pour les tokens Supabase → acceptable avec la CSP en place ; à reconsidérer si le périmètre XSS s'étend.
