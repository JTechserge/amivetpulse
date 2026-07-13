# Supabase — Amivet PULSE

Backend Supabase (projet `ubowqtowyqmpraoxbaoo`). Dernière mise à jour : Phase 7 (juillet 2026).

> Les migrations et Edge Functions ne sont **pas** gérées par Supabase CLI local — tout déploiement est manuel.

---

## Structure

```
supabase/
├── functions/
│   ├── _shared/           # Modules Deno partagés entre fonctions
│   │   ├── asv-hours.ts   # Calcul heures ASV (nominal, OT, déficit, samedi Carla)
│   │   ├── planning-auth.ts  # Vérification droits avant écriture planning_data
│   │   └── email-template.ts # HTML commun aux emails transactionnels
│   ├── calendar-feed/     # Flux ICS personnel des vétérinaires
│   ├── confirm-signature/ # Confirmation signature feuille de présence ASV
│   ├── manage-users/      # Invitation / suppression de comptes (admin)
│   ├── push-server/       # Notifications Web Push
│   ├── request-signature/ # Envoi email + token de signature ASV
│   ├── save-planning/     # Écriture sécurisée du planning (remplace PATCH REST direct)
│   └── send-leave-recap/  # Récapitulatif hebdomadaire des congés ASV par email
└── migrations/            # SQL à appliquer manuellement dans l'ordre croissant
```

---

## Edge Functions

### Déploiement

```bash
# Depuis la racine du projet, avec Supabase CLI installé :
supabase functions deploy <nom-function> --project-ref ubowqtowyqmpraoxbaoo
```

### Inventaire

| Fonction | Rôle | Secrets requis |
|---|---|---|
| `calendar-feed` | Génère un flux `.ics` signé pour Apple Calendrier / Google Agenda. Vérifie le token SHA-256 avant de servir les données. | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` |
| `confirm-signature` | Valide le token one-shot reçu par email et enregistre la signature mensuelle avec l'auth.uid() (preuve d'identité). Envoie un email de confirmation via Resend. | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY` |
| `manage-users` | Invite ou supprime un compte Supabase Auth (admin uniquement). Rate-limitée à 10 req/h. | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `BREVO_API_KEY` |
| `push-server` | Envoie des notifications Web Push (VAPID) aux abonnés. Appelée en fire-and-forget par le front. | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_CONTACT_EMAIL` |
| `request-signature` | Génère un token SHA-256, l'enregistre, envoie l'email récapitulatif mensuel + lien de signature (Brevo). Rate-limitée à 20 req/h. | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `BREVO_API_KEY` |
| `save-planning` | Seul point d'écriture autorisé sur `planning_data`. Vérifie le rôle du demandeur, applique le delta via service_role. La RLS bloque tout PATCH REST direct depuis Phase 7. | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` |
| `send-leave-recap` | Envoie immédiatement le récapitulatif des congés ASV (déclenché manuellement par l'admin). Rate-limitée à 5 req/h. | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY` |

### Variables d'environnement

À configurer dans **Supabase Dashboard → Edge Functions → Manage secrets** :

| Variable | Description | Sensibilité |
|---|---|---|
| `SUPABASE_URL` | URL du projet (`https://ubowqtowyqmpraoxbaoo.supabase.co`) | Non-secrète |
| `SUPABASE_ANON_KEY` | Clé publique (même que dans `src/config.js`) | Non-secrète |
| `SUPABASE_SERVICE_ROLE_KEY` | Clé service — contourne RLS | **Secrète — jamais dans le code** |
| `BREVO_API_KEY` | Envoi d'emails transactionnels (Brevo) | **Secrète** |
| `RESEND_API_KEY` | Envoi d'emails (Resend, utilisé par confirm-signature et send-leave-recap) | **Secrète** |
| `VAPID_PUBLIC_KEY` | Clé VAPID publique pour Web Push | Non-secrète |
| `VAPID_PRIVATE_KEY` | Clé VAPID privée pour Web Push | **Secrète** |
| `VAPID_CONTACT_EMAIL` | Email de contact VAPID (défaut : `cliniqueamivet@hotmail.fr`) | Non-sensible |

---

## Modules partagés (`_shared/`)

Ces modules sont importés avec un chemin relatif `../` depuis chaque fonction. Ils n'ont pas d'entrée de déploiement propre.

### `asv-hours.ts`

Calcul des heures ASV : nominal journalier, heures supplémentaires soirée/midi, déficit départ anticipé, correction samedi Carla (`SATURDAY_HOURS_BY_PID = { carla: 7.25 }`).

**Miroir JS** : `src/lib/asv-hours.js` (même logique, même constantes — pour les tests Vitest).

> Toute modification doit être répercutée dans les deux fichiers. Le test de contrat `tests/unit/asv-hours-contract.test.js` vérifie l'accord entre les deux.

### `planning-auth.ts`

Vérifie que le demandeur a le droit d'écrire sur `planning_data` (rôle `admin` ou `editor`). Utilisé par `save-planning`.

**Miroir JS** : `src/lib/planning-auth.js`.

### `email-template.ts`

HTML et composants communs (boutons, couleurs, wrapper) pour les emails envoyés par `request-signature`, `confirm-signature` et `send-leave-recap`.

---

## Migrations

À appliquer dans l'ordre croissant via **Supabase Dashboard → SQL Editor → New query → Run**.

### Migrations initiales (déployées)

| Fichier | Description |
|---|---|
| `20240101000001_planning_data.sql` | Table `planning_data` (stockage JSON singleton) + RLS |
| `20240115000001_email_settings.sql` | Table `email_settings` (destinataire et fréquence récap) |
| `20240201000001_password_security.sql` | Table `password_security_settings` |
| `20240215000001_calendar_sync.sql` | Table `calendar_sync_state` |
| `20240301000001_calendar_sync_preferences.sql` | Table `calendar_sync_preferences` |
| `20240315000001_monthly_signatures.sql` | Table `monthly_signatures` |
| `20240401000001_auth_user_profiles.sql` | Table `user_profiles` + RLS Auth |
| `20240415000001_annual_interviews.sql` | Table `annual_interviews` |
| `20240501000001_signature_tokens.sql` | Table `signature_tokens` (tokens email one-shot) |
| `20240515000001_fix_rls_recursion.sql` | **Correctif critique** : récursion infinie RLS sur `user_profiles` |
| `20240601000001_cp_adjustments.sql` | Table `cp_adjustments` (ajustements congés payés) |
| `20240615000001_medical_visits.sql` | Table `medical_visits` |
| `20240701000001_announcements.sql` | Table `announcements` + catégories |
| `20240715000001_push_notifications.sql` | Table `push_subscriptions` |

### Migrations Phase 6–7 (à déployer)

| Fichier | Statut | Description |
|---|---|---|
| `20260713000001_tighten_rls.sql` | ⏳ **À déployer** | RLS restrictive sur 8 tables sensibles |
| `20260713000002_rate_limits_and_token_hash.sql` | ⏳ **À déployer** | Rate limiting + hash tokens calendar-feed (**invalide tokens existants**) |
| `20260714000001_lock_planning_writes.sql` | ✅ Déployé | Verrouillage PATCH direct sur `planning_data` — toutes les écritures via `save-planning` |

---

## Avertissement RLS

> **Ne jamais référencer `user_profiles` dans ses propres politiques RLS.**
>
> Cela provoque une récursion infinie qui bloque **toutes** les connexions au projet. La migration `20240515000001_fix_rls_recursion.sql` corrige ce problème en utilisant `auth.jwt() ->> 'role'` à la place.
