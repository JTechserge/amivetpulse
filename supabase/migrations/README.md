# Migrations Supabase — Amivet PULSE

Ces fichiers SQL sont à appliquer **manuellement** dans l'ordre croissant via
**Supabase → SQL Editor → New query → Run**.

> Ils ne sont **pas** gérés par `supabase migrate` (pas de Supabase CLI
> local configuré) — le préfixe horodaté sert uniquement à imposer l'ordre.

## Ordre d'application

| Fichier | Description |
|---|---|
| `20240101000001_planning_data.sql` | Table `planning_data` (stockage JSON singleton) + RLS |
| `20240115000001_email_settings.sql` | Table `email_settings` (destinataire et fréquence récap) |
| `20240201000001_password_security.sql` | Table `password_security_settings` (règles mot de passe) |
| `20240215000001_calendar_sync.sql` | Table `calendar_sync_state` (état sync cloud) |
| `20240301000001_calendar_sync_preferences.sql` | Table `calendar_sync_preferences` (préférences par profil) |
| `20240315000001_monthly_signatures.sql` | Table `monthly_signatures` (feuillets de présence signés) |
| `20240401000001_auth_user_profiles.sql` | Table `user_profiles` + politiques RLS Auth |
| `20240415000001_annual_interviews.sql` | Table `annual_interviews` (entretiens annuels) |
| `20240501000001_signature_tokens.sql` | Table `signature_tokens` (tokens email one-shot) |
| `20240515000001_fix_rls_recursion.sql` | **Correctif critique** : récursion infinie RLS sur `user_profiles` |
| `20240601000001_cp_adjustments.sql` | Table `cp_adjustments` (ajustements congés payés) |
| `20240615000001_medical_visits.sql` | Table `medical_visits` (visites médicales) |
| `20240701000001_announcements.sql` | Table `announcements` + catégories |
| `20240715000001_push_notifications.sql` | Table `push_subscriptions` (abonnements push web) |

## Avertissement RLS

Ne jamais référencer `user_profiles` dans ses propres politiques RLS
(cf. `20240515000001_fix_rls_recursion.sql`) — cela provoque une récursion
infinie qui bloque toutes les connexions.
