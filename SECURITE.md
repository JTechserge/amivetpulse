# Sécurité — Amivet PULSE

Document de référence unique. Dernière mise à jour : Phase 8 (juillet 2026).

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
  - **Vérification requise** : après tout rejeu de `20260714000001`, confirmer la présence de la policy via `select policyname, cmd, permissive, qual, with_check from pg_policies where tablename = 'planning_data';` — doit afficher `block direct writes`, type RESTRICTIVE, `with_check = false`. ☐ *Vérifié le _______ via pg_policies*
- **8 tables sensibles** (`monthly_signatures`, `email_settings`, `cp_adjustments`, `announcements`, `announcement_reads`, `push_subscriptions`, `medical_visits`, `app_security`) : RLS restrictive — accès en lecture limité à l'utilisateur concerné ou aux admins. Migration `20260713000001`.

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

## État des migrations (Phase 6–8)

Toutes les migrations sont déployées en production. Voir `supabase/README.md` pour l'inventaire complet.

| Fichier | Statut |
|---|---|
| `20260713000001_tighten_rls.sql` | ✅ Déployé |
| `20260713000002_rate_limits_and_token_hash.sql` | ✅ Déployé |
| `20260714000001_lock_planning_writes.sql` | ✅ Déployé — **à rejouer** (correction Phase 8 : `IF NOT EXISTS` invalide supprimé) |
| `20260714000002_fix_calendar_hash_functions.sql` | ✅ Déployé |

---

## Edge Functions à redéployer (CORS)

Ces 5 fonctions ont été modifiées (CORS `*` → `https://jtechserge.github.io`) et doivent être redéployées :

```bash
supabase functions deploy manage-users        --project-ref ubowqtowyqmpraoxbaoo
supabase functions deploy confirm-signature   --project-ref ubowqtowyqmpraoxbaoo
supabase functions deploy send-leave-recap    --project-ref ubowqtowyqmpraoxbaoo
supabase functions deploy request-signature   --project-ref ubowqtowyqmpraoxbaoo
supabase functions deploy push-server         --project-ref ubowqtowyqmpraoxbaoo
```

**Vérification** : depuis un autre domaine, une requête OPTIONS doit retourner `Access-Control-Allow-Origin: https://jtechserge.github.io` (non `*`).

---

## Limites connues (points acceptés)

| Limite | Raison | Mitigation |
|---|---|---|
| `frame-ancestors` impossible | Limitation structurelle GitHub Pages (meta-CSP ne couvre pas cet en-tête) | Évaluer lors d'une migration vers Cloudflare Pages ou Netlify |
| `sessionStorage` pour les tokens Supabase | Défaut du SDK Supabase JS, lisible par un XSS résiduel | Acceptable avec la CSP et `no-unsanitized` en place ; à reconsidérer si le périmètre XSS s'étend |
