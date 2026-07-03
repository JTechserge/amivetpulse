-- Correction de la récursion infinie dans les politiques RLS de user_profiles.
-- Le schema-7 avait créé "vet admin reads all profiles" avec une sous-requête sur
-- user_profiles depuis une politique de user_profiles elle-même → récursion → erreur
-- PostgreSQL → manage-users ne pouvait pas lire le profil → "Accès réservé".
--
-- Solution : une fonction SECURITY DEFINER qui lit le rôle sans déclencher RLS,
-- utilisée dans les politiques à la place de la sous-requête directe.

create or replace function get_my_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from user_profiles where id = auth.uid()
$$;

-- Remplacer la politique récursive sur user_profiles
drop policy if exists "vet admin reads all profiles" on user_profiles;
create policy "vet admin reads all profiles" on user_profiles
  for select using (get_my_role() in ('admin', 'vet'));

-- Même correction sur la politique admin update
drop policy if exists "admin updates profiles" on user_profiles;
create policy "admin updates profiles" on user_profiles
  for update using (get_my_role() = 'admin');

-- Correction de la politique de suppression sur monthly_signatures (même pattern)
drop policy if exists "vet admin delete signatures" on monthly_signatures;
create policy "vet admin delete signatures" on monthly_signatures
  for delete using (get_my_role() in ('admin', 'vet'));

-- Correction sur calendar_sync_tokens
drop policy if exists "owner or vet reads token" on calendar_sync_tokens;
create policy "owner or vet reads token" on calendar_sync_tokens
  for select using (
    auth.role() = 'authenticated' and (
      person_id = (select person_id from user_profiles where id = auth.uid())
      or get_my_role() in ('admin', 'vet')
    )
  );
