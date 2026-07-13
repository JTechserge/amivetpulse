# PROMPT — Phase 6 : Correctifs du rapport de revue + durcissement sécurité

> À coller dans Claude Code à la racine de `CalendrierAmivet`.
> Applique les conclusions de `RAPPORT-REVUE-CODE-2026-07-13.md` (lis-le d'abord, il fait foi).

---

Tu es le développeur senior et expert sécurité (OWASP) qui a réalisé les Phases 1 à 5 sur Amivet PULSE (PWA vanilla JS + Vite 8, GitHub Pages `base: '/amivetpulse/'`, backend Supabase : Auth REST, RLS, 7 Edge Functions Deno, emails Brevo). Le code est modulaire (19 modules dans `src/`), lint ESLint en place, tests Vitest (`npm run test:unit`) + Playwright TNR (`npm test`) verts.

## Méthode imposée

- Branche `hardening/2026-07-phase6`. Un commit atomique par lot ci-dessous, messages en français.
- Après CHAQUE lot : `npm run lint` (zéro erreur ET zéro warning à la fin de la phase), `npm run build`, `npm run test:unit`, `npm test`. Rouge = tu répares avant de continuer.
- Zéro changement de comportement visible, hors correctifs listés.
- **Tout SQL et toute modification d'Edge Function me sont présentés pour validation — tu ne déploies jamais rien côté Supabase toi-même.** Livre les fichiers + les commandes exactes (`supabase db push`, `supabase functions deploy <nom>`) que J'exécuterai.
- Jamais de secret dans le code ou les commits.

## Lot 1 — Bug + hygiène lint (rapport §🐛 et §🧹)

1. Ajoute `CP_DAYS_PER_MONTH` à l'import de `config.js` dans `src/dashboard.js` (utilisé L1354 et L1418). Ajoute un test Vitest sur la fonction de calcul des CP acquis (proratisation `timeFraction`) pour que ce chemin ne replante jamais silencieusement.
2. Purge les 36 warnings `no-unused-vars` : supprime les imports et variables mortes (ne préfixe `_` que si la variable documente une signature). Passe ensuite ESLint en mode strict : `npm run lint` doit utiliser `--max-warnings=0` dans `package.json`.
3. Supprime `_legacy/` du dépôt (`git rm -r`) — vérifie d'abord qu'aucun fichier n'y est référencé.

## Lot 2 — Sink XSS `ui.js` (rapport §3 — corrige 8+ vecteurs d'un coup)

1. Dans `src/ui.js` : `showToast` et `openConfirmModal` doivent échapper `message`, `title` et `confirmLabel` via `escapeHTML` avant injection. `icon` reste une émoji interne : échappe-le aussi, ça ne coûte rien.
2. Cas particulier : si certains appelants passent volontairement du HTML (cherche-les), ajoute une variante explicite `openConfirmModalHtml` réservée aux templates internes constants — le défaut doit être sûr.
3. Audite les templates signalés « à risque » restants dans le rapport (calendar.js : `label`, `asvWarning` ; pwa.js : `status.text` ; settings.js ; week-view.js) : pour chaque interpolation, soit tu prouves en commentaire qu'elle est constante interne, soit tu l'échappes. Aucun cas ambigu laissé sans traitement.
4. Ajoute `eslint-plugin-no-unsanitized` (règles `no-unsanitized/property` et `/method` en `error`) pour empêcher toute régression. Les sinks légitimes restants reçoivent un commentaire de désactivation ciblé et justifié.

## Lot 3 — RLS restrictive (rapport §1 — la faille n°1) ⚠️ validation requise

Rédige une migration `supabase/migrations/<timestamp>_tighten_rls.sql` qui remplace les policies `using (true)` / `with check (true)` :

- `planning_data` : update/insert réservés aux profils `role = 'admin'` OU `can_edit_vet_calendar` / `can_edit_all_asv` selon la portée. Un utilisateur ASV simple (`person_id` renseigné) ne peut modifier que ses propres demandes — si la structure de `planning_data` (blob JSON unique ?) rend ce grain impossible, dis-le explicitement et propose le meilleur compromis (ex. écriture réservée aux éditeurs + les demandes ASV passent par une Edge Function).
- `monthly_signatures` : insert seulement si `signed_by_user_id = auth.uid()` ; delete réservé `admin`.
- `email_settings`, `calendar_sync_*` : écriture réservée `admin` (ou au propriétaire pour ses préférences de sync).
- Réutilise le pattern anti-récursion de `20240515000001_fix_rls_recursion.sql` pour lire `user_profiles.role` sans boucle RLS.
- Livre aussi un plan de test manuel : pour chaque table, la requête REST qui doit passer et celle qui doit être refusée (401/403), avec un compte admin et un compte ASV.
- **STOP : présente-moi le SQL et attends ma validation. N'exécute rien.**

## Lot 4 — CSP, fonts, CORS (rapport §2, §4, §9)

1. Télécharge Inter (poids 400-800, woff2) dans `public/fonts/`, crée les `@font-face` dans `style.css`, supprime les `<link>` Google Fonts de `index.html` et la gestion fonts du SW.
2. Ajoute la CSP en `<meta http-equiv="Content-Security-Policy">` dans `src/index.html` : `default-src 'self'; connect-src 'self' https://ubowqtowyqmpraoxbaoo.supabase.co; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; font-src 'self'; base-uri 'self'; form-action 'self'; object-src 'none'`. Vérifie chaque directive contre le code réel (styles inline nombreux → `'unsafe-inline'` reste nécessaire pour style-src ; documente pourquoi). Teste en `vite preview` : login, les 4 onglets, SW, impression. Documente dans le commit la limite `frame-ancestors` (ignoré en meta — clickjacking non couvrable sur GitHub Pages).
3. Edge Functions : remplace `Access-Control-Allow-Origin: '*'` par `https://jtechserge.github.io` dans les 6 fonctions concernées (constante partagée dans `_shared/`). `calendar-feed` est consommé par des clients calendrier, pas un navigateur : pas de CORS nécessaire — vérifie et simplifie. **Présente les diffs, j'exécuterai les `supabase functions deploy`.**

## Lot 5 — Rate limiting, tokens ICS, cache SW (rapport §5, §6, §7) ⚠️ validation requise

1. **Rate limiting** : migration créant une table `rate_limits(key text, window_start timestamptz, count int)` + fonction SQL `check_rate_limit(p_key, p_max, p_window_seconds)` security definer. Dans `manage-users`, `request-signature` et `calendar-feed` : appel en début de handler (clé = IP + action), réponse 429 au-delà (10/min pour les actions email, 60/min pour calendar-feed).
2. **Tokens calendar-feed** : migration ajoutant `token_hash` à `calendar_sync_tokens` ; la RPC de génération stocke le SHA-256 et retourne le token clair une seule fois ; la RPC de validation compare les hash. Prévois la transition : les tokens existants sont invalidés → l'UI de `settings.js` doit afficher clairement qu'il faut regénérer son lien (message one-shot).
3. **Cache SW au logout** : dans `authSignOut()` (app.js), purge le cache dynamique (`caches.delete` du `DYNAMIC_CACHE` via message au SW ou directement) et vide le cache `planning_data` de `localStorage`. Incrémente `CACHE_VERSION` dans `sw.js`.
4. **STOP : SQL + Edge Functions présentés pour validation avant tout déploiement.**

## Lot 6 — CI sécurité (rapport §8)

1. `.github/workflows/security.yml` : sur push/PR vers main + hebdo (`schedule`) — `npm ci && npm audit --audit-level=high`, CodeQL (javascript-typescript), gitleaks (action officielle).
2. `.github/dependabot.yml` : écosystèmes `npm` et `github-actions`, hebdomadaire.
3. Vérifie que `deploy.yml` n'est pas déclenché par ces ajouts.

## Livraison finale

1. Tout vert : lint strict, build, Vitest, TNR. Vérification manuelle `vite preview` : login → peindre une cellule → toast d'erreur (déclenche-en un volontairement pour vérifier l'échappement) → annonces → ⚙️ → logout (vérifier la purge du cache dans DevTools).
2. Mets à jour `RAPPORT-REVUE-CODE-2026-07-13.md` : ajoute une colonne « Statut » à chaque constat (corrigé + commit, ou en attente de mon action).
3. Termine par la liste exacte de MES actions restantes, dans l'ordre : valider/exécuter la migration RLS, la migration rate-limit/tokens, déployer les Edge Functions, prévenir les vétérinaires de regénérer leurs liens ICS.
