-- À exécuter dans Supabase → SQL Editor → New query → Run
-- Prérequis : avoir activé "Email Auth" dans Authentication → Providers (activé par défaut).
-- Avant d'exécuter, configurez l'URL de redirection dans :
--   Authentication → URL Configuration → Site URL
--   → https://jtechserge.github.io/amivetpulse/

-- ─────────────────────────────────────────────────────────────────
-- 1. Table des profils utilisateurs (liée à auth.users de Supabase)
-- ─────────────────────────────────────────────────────────────────
create table if not exists user_profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  role text not null check (role in ('admin', 'vet', 'asv')),
  person_id text,           -- correspond à un id dans PEOPLE ou ASV_PEOPLE (ex. 'david', 'marie')
  display_name text not null,
  can_edit_vet_calendar boolean not null default false,
  can_edit_all_asv boolean not null default false
);

alter table user_profiles enable row level security;

-- Chaque utilisateur lit son propre profil
drop policy if exists "user reads own profile" on user_profiles;
create policy "user reads own profile" on user_profiles
  for select using (auth.uid() = id);

-- Les admins et vétérinaires lisent tous les profils
drop policy if exists "vet admin reads all profiles" on user_profiles;
create policy "vet admin reads all profiles" on user_profiles
  for select using (
    (select role from user_profiles where id = auth.uid()) in ('admin', 'vet')
  );

-- Seuls les admins modifient les profils
drop policy if exists "admin updates profiles" on user_profiles;
create policy "admin updates profiles" on user_profiles
  for update using (
    (select role from user_profiles where id = auth.uid()) = 'admin'
  );

-- ─────────────────────────────────────────────────────────────────
-- 2. Mise à jour des politiques RLS des tables existantes
--    → exiger une session authentifiée (plus d'accès purement anon)
-- ─────────────────────────────────────────────────────────────────

-- planning_data
drop policy if exists "allow anon read" on planning_data;
drop policy if exists "allow anon write" on planning_data;
create policy "auth read planning_data" on planning_data
  for select using (auth.role() = 'authenticated');
create policy "auth insert planning_data" on planning_data
  for insert with check (auth.role() = 'authenticated');
create policy "auth update planning_data" on planning_data
  for update using (auth.role() = 'authenticated');

-- email_settings
drop policy if exists "allow anon read" on email_settings;
drop policy if exists "allow anon write" on email_settings;
create policy "auth read email_settings" on email_settings
  for select using (auth.role() = 'authenticated');
create policy "auth insert email_settings" on email_settings
  for insert with check (auth.role() = 'authenticated');
create policy "auth update email_settings" on email_settings
  for update using (auth.role() = 'authenticated');

-- monthly_signatures : ASV peut signer ses propres mois, vétos/admin peuvent révoquer
drop policy if exists "allow anon read" on monthly_signatures;
drop policy if exists "allow anon insert" on monthly_signatures;
drop policy if exists "allow anon delete" on monthly_signatures;
create policy "auth read signatures" on monthly_signatures
  for select using (auth.role() = 'authenticated');
create policy "auth insert signatures" on monthly_signatures
  for insert with check (auth.role() = 'authenticated');
create policy "vet admin delete signatures" on monthly_signatures
  for delete using (
    (select role from user_profiles where id = auth.uid()) in ('admin', 'vet')
  );

-- calendar_sync_tokens : accès via RPCs security-definer uniquement (le RLS bloque l'accès direct)
drop policy if exists "allow anon read" on calendar_sync_tokens;
drop policy if exists "allow anon insert" on calendar_sync_tokens;
drop policy if exists "allow anon update" on calendar_sync_tokens;
-- Le propriétaire ou un admin/véto peut lire son propre token
create policy "owner or vet reads token" on calendar_sync_tokens
  for select using (
    auth.role() = 'authenticated' and (
      person_id = (select person_id from user_profiles where id = auth.uid())
      or (select role from user_profiles where id = auth.uid()) in ('admin', 'vet')
    )
  );

-- ─────────────────────────────────────────────────────────────────
-- 3. Compte administrateur initial
--    Après avoir exécuté ce script, créez votre compte admin :
--      a) Authentication → Users → "Invite user" → entrez votre email
--      b) Cliquez sur le lien reçu par email pour choisir votre mot de passe
--      c) Récupérez votre UUID dans Authentication → Users
--      d) Exécutez la commande INSERT ci-dessous en remplaçant <VOTRE-UUID> :
-- ─────────────────────────────────────────────────────────────────
-- insert into user_profiles (id, role, display_name, person_id)
-- values ('<VOTRE-UUID>', 'admin', 'Jérémie', null)
-- on conflict (id) do update set role='admin', display_name='Jérémie';

-- ─────────────────────────────────────────────────────────────────
-- 4. Grant pour la fonction Edge manage-users (utilisée par l'admin
--    pour inviter des collaborateurs — elle tourne avec la clé service
--    role et n'a pas besoin de politiques RLS supplémentaires).
-- ─────────────────────────────────────────────────────────────────
-- Rien à faire ici : la clé service-role bypasse automatiquement le RLS.
