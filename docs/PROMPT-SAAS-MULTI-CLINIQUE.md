# PROMPT — Transformer Amivet PULSE en SaaS multi-clinique

> À coller dans Claude Code à la racine de `CalendrierAmivet`.
> Chantier structurant, multi-phases. **Ne code rien avant la note de conception de la Phase 0 (choix du modèle de tenancy), que tu me présentes pour validation.**

---

Tu es **architecte système + développeur senior**. Objectif : faire évoluer Amivet PULSE, aujourd'hui **mono-clinique et largement codé en dur**, vers un **SaaS multi-tenant** permettant de fournir **une instance logique par clinique vétérinaire**, pour la commercialiser auprès d'autres cliniques.

## État actuel vérifié (tout est mono-clinique)

- **Front** vanilla JS + Vite, déployé sur **GitHub Pages** avec `base: '/amivetpulse/'`.
- **Un seul projet Supabase** (`ubowqtowyqmpraoxbaoo`), clé anon en dur dans `config.js`.
- **Effectif figé** dans `config.js` : `PEOPLE` (Dr. Pelois, Dr. Maquinay) et `ASV_PEOPLE` (Marie, Johanna, Julie, Carla). Le roster ASV est éditable/persisté en localStorage, mais les valeurs par défaut et l'identité de la clinique sont en dur.
- **Identité clinique en dur** : « Clinique Vétérinaire — Dr. Pelois & Dr. Maquinay », logo, dans `index.html` et les gabarits d'email (`_shared/email-template.ts`).
- **Expéditeur Brevo en dur** (`jeremie.pvt@gmail.com`) dans les Edge Functions de signature.
- **Données mono-clinique** : `planning_data` = **une seule ligne « singleton » JSON** ; clés `forecast_<pid>_*` ; tables `monthly_signatures`, `forecast_signatures`, `announcements`, `medical_visits`, `cp_adjustments`, `user_profiles`, `email_settings`, `calendar_sync_tokens`, `push_subscriptions` — **aucune notion de clinique**.
- **Sécurité déjà durcie** (RLS restrictive, CSP, CORS, rate limiting, tokens hachés, verrou d'écriture planning via Edge Function `save-planning`) — mais tout est pensé pour **une** clinique.
- **La CSP elle-même est mono-tenant** : la balise `<meta http-equiv="Content-Security-Policy">` de `index.html` fige `connect-src … https://ubowqtowyqmpraoxbaoo.supabase.co`. En pool, l'URL Supabase doit être générique (projet partagé) et la CSP passera idéalement en **en-tête HTTP** côté hébergeur (cf. Phase 5).

## Décision d'architecture (déjà tranchée)

Modèle retenu : **Pool multi-tenant sur une base Supabase partagée** — chaque donnée porte un `clinic_id`, isolation par **RLS**, cliniques distinguées par **sous-domaine**. Raisons :
- **Compatible palier gratuit** dès 2–3 cliniques (une seule base, pas de projet supplémentaire — le silo, lui, dépasse la limite de projets et subit la mise en pause).
- **Bascule payante sans re-architecture** : quand le volume l'exige, on passe simplement la base en Supabase **Pro** (et Brevo payant) — **aucun changement de code**.
- Le seul modèle réellement « SaaS » et rentable à l'échelle.

**Objectif de dimensionnement : fonctionner à coût nul (ou quasi) jusqu'à ~2–3 petites cliniques, tout en étant prêt à monter en charge d'un simple upgrade de plan.**

## Phase 0 — Note de conception (→ STOP avant tout code)

Le modèle est décidé (Pool). Ta note doit donc porter sur **le plan d'exécution**, pas sur le choix : schéma de données multi-tenant proposé (tables + `clinic_id`, RLS `get_my_clinic()`), stratégie de migration de la clinique existante en tenant #1, résolution du tenant par sous-domaine, **estimation d'effort par phase**, **risques majeurs** (fuite cross-tenant en tête), et **respect des limites du palier gratuit** (section ci-dessous). Présente-la, puis attends ma validation.

## Phase 1 — Rendre l'application « tenant-agnostic » (prérequis, quel que soit le modèle)

Sortir **tout le codé en dur** vers une **configuration de clinique chargée au démarrage** :
- identité : nom, logo, coordonnées, vétérinaires, roster ASV par défaut ;
- règles métier paramétrables : postes (Ouverture/Fermeture/Demi-journée) et leurs horaires, quota annuel (1607 h), plafond hebdo (42 h), fuseau, jours fériés régionaux ;
- couleurs / charte ;
- expéditeur email, URL + clé anon Supabase.
Le bootstrap lit la config du tenant courant ; **supprimer du code toute mention littérale « Amivet / Pelois / Maquinay »** au profit de variables. La clinique actuelle devient un **fichier de config « tenant #1 »**.

## Phase 2 — Modèle de données multi-tenant (si Pool) ⚠️ SQL présenté pour validation

1. Table **`clinics`** (id, nom, `slug`/sous-domaine, logo, plan, réglages métier, statut).
2. Ajouter **`clinic_id`** à **toutes** les tables de données listées plus haut, avec index.
3. **`planning_data`** : passer du singleton à **une ligne par clinique** (PK incluant `clinic_id`) — ce qui **résout au passage** la limite d'écriture déjà identifiée. Namespacer les clés `forecast_*` par clinique.
4. **RLS par clinique** : chaque requête filtrée sur le `clinic_id` de l'utilisateur (claim JWT), via une fonction `get_my_clinic()` sur le modèle anti-récursion de `get_my_role()`. **La fuite cross-tenant est le risque n°1** : chaque politique doit combiner `clinic_id = get_my_clinic()` **et** le rôle.
5. Migration de la clinique existante en **tenant #1** (backfill `clinic_id`), sans perte de données.

## Phase 3 — Authentification & appartenance

- Rattacher chaque compte à une clinique (`user_profiles.clinic_id`, ou table `memberships` si un jour un vét exerce dans plusieurs cliniques).
- Injecter `clinic_id` (et rôle) dans le **JWT Supabase** (`app_metadata`) → consommé par la RLS et par `save-planning`/`request-*` (adapter `_shared/planning-auth.ts` pour scoper aussi par clinique).
- **Super-admin plateforme** (toi) hors clinique, + admin clinique / vét / ASV **par** clinique.
- Résolution de la clinique au login : par **sous-domaine** (pool) ou par le profil.

## Phase 4 — Onboarding / provisioning

- **Console super-admin** (ou script CLI) pour créer une clinique : nom, slug, logo, config horaire, invitation du **premier compte admin** par email.
- Plus tard : self-service (inscription + essai gratuit).

## Contraintes du palier gratuit & bascule payante (à respecter dans toutes les phases)

Concevoir pour **rester gratuit jusqu'à ~2–3 cliniques**, sans jamais bloquer la montée en charge payante :

- **Supabase gratuit** : ~500 Mo de base, ~1 Go de stockage, **projet mis en pause après 7 j d'inactivité**, sauvegardes limitées. Garde-fous :
  - Le trafic de 2–3 cliniques actives suffit à éviter la pause ; ajouter au besoin un **ping planifié** (déjà des GitHub Actions dans le projet).
  - **Stockage des PDF de signature** : c'est le poste qui remplit vite le Go gratuit. Génère des PDF **légers**, et prévois une **rétention** (purge/archivage des vieux PDF) + la possibilité de basculer vers un stockage externe sans changer le code appelant.
  - Les **sauvegardes** restent l'assurance-vie : conserve les scripts de backup existants (export chiffré) tant que le PITR payant n'est pas activé.
- **Cloudflare Pages** (front) : palier gratuit suffisant même en usage commercial (sous-domaines + en-têtes HTTP).
- **Brevo** : ~300 emails/jour gratuits — largement suffisant au début (emails de signature ponctuels).
- **Bascule payante = zéro re-architecture** : passer Supabase en **Pro (~25 $/mois)** débloque non-pause + sauvegardes quotidiennes + PITR ; Brevo payant quand le volume monte. Documente clairement **le seuil de bascule** (nombre de cliniques, taille base, volume email) pour savoir *quand* upgrader.
- **Facturation client** (Phase 7) : à activer **seulement** quand tu passes au payant — l'abonnement des cliniques doit couvrir les ~25–40 $/mois d'infra.

## Phase 5 — Déploiement & domaines ⚠️ changement d'hébergement

GitHub Pages ne gère ni les **sous-domaines joker** ni les **en-têtes HTTP** → migrer vers **Cloudflare Pages / Netlify / Vercel** pour :
- **un seul déploiement multi-tenant** (pool), tenant résolu par sous-domaine `clinicX.amivetpulse.app` (ou domaine custom) ;
- **variables d'environnement par déploiement**, secrets propres ;
- **en-têtes HTTP** → active enfin `Content-Security-Policy` complète + `X-Frame-Options`/`frame-ancestors` (corrige la limite clickjacking déjà notée sur GitHub Pages).
Les Edge Functions Supabase restent partagées (elles reçoivent le `clinic_id` via le token).

## Phase 6 — Sécurité multi-tenant (revue dédiée)

- **Tests anti-fuite cross-tenant systématiques** : un compte de la clinique A ne doit **jamais** voir/écrire une donnée de la clinique B (tests d'intégration RLS sur chaque table).
- Rate limiting **par clinique** ; sauvegardes **segmentées par clinique** (restauration ciblée + **droit à l'effacement RGPD** d'une clinique).
- Rejouer toute la checklist de durcissement (RLS, CSP, CORS, tokens) **en contexte multi-tenant**.

## Phase 7 — Volet business (ultérieur, à cadrer séparément)

- **Plans & facturation** (Stripe) : limites (nb d'ASV/vétérinaires), essai, suspension d'accès.
- Console super-admin : liste des cliniques, usage, santé, journaux.
- **RGPD sous-traitant** : en hébergeant les données RH de tes cliniques clientes, tu deviens **sous-traitant** → **DPA** (accord de traitement) obligatoire, registre, localisation des données, plus CGU/CGV.

## Règles permanentes

- Branche `feature/saas-multitenant` (puis sous-branches par phase). Commits atomiques, messages en français.
- Après chaque phase : `npm run lint` (0/0), `npm run build`, `npm run test:unit`, `npm test`. Rouge = tu répares.
- **Ne casse jamais la clinique existante** : elle devient le tenant #1 et doit fonctionner à l'identique à chaque étape.
- **Tout SQL, toute Edge Function, tout changement d'hébergement me sont présentés pour validation** avant exécution/déploiement.
- Jamais de secret en dur ; la config par clinique ne contient jamais de secret côté client (clé anon OK, service_role jamais).

## Définition de « terminé » (programme global)

- Application **tenant-agnostic** (plus aucune valeur clinique en dur).
- Modèle multi-tenant en place (Pool) avec **isolation RLS prouvée** par des tests anti-fuite, clinique existante migrée en tenant #1 sans perte.
- Auth scopée par clinique (claims JWT), rôles plateforme + par clinique, provisioning d'une nouvelle clinique fonctionnel.
- Déploiement multi-tenant avec sous-domaines et en-têtes HTTP (CSP complète).
- Lint/build/tests verts à chaque phase ; durcissement re-vérifié en multi-tenant.
- Note d'architecture validée, et pour chaque phase : ce qui est fait + mes actions restantes (migrations, hébergement, DPA/RGPD).

## Ce que j'attends de ta première réponse

**Uniquement la note de conception (Phase 0)** — le modèle est déjà décidé (**Pool multi-tenant, base partagée, gratuit d'abord, upgrade-ready**). Livre : le **schéma de données multi-tenant** proposé (tables + `clinic_id`, `get_my_clinic()`, RLS), la **stratégie de migration** de la clinique existante en tenant #1, la **résolution du tenant par sous-domaine**, une **estimation d'effort par phase**, les **risques majeurs** (fuite cross-tenant), et le **respect des limites du palier gratuit** + le **seuil de bascule payante**. On valide ce plan avant toute ligne de code.
