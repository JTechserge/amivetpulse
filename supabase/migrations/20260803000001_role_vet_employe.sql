-- Phase 9 — Rôle « vétérinaire non associé » (salarié) + roster vétérinaire partagé
--
-- Contexte :
--  - user_profiles.role était contraint à ('admin','vet','asv'). Les associés
--    (Stéphane, David) sont en rôle 'vet' ; 'admin' est le compte technique (Jérémie).
--    On ajoute 'vet_employe' pour le vétérinaire salarié, sans toucher aux rôles existants.
--  - Le calendrier vétérinaire reposait sur une liste codée en dur côté front
--    (config.js → PEOPLE = david, stephane). Un salarié doit pouvoir être ajouté
--    sans déploiement ET être visible par TOUS les postes → table partagée vet_roster.
--    (Le roster ASV reste en localStorage — hors périmètre, voir note en fin de fichier.)
--
-- À VALIDER AVANT EXÉCUTION.
-- Dépend de : 20240401000001_auth_user_profiles.sql
-- À exécuter dans Supabase → SQL Editor → New query → Run
--
-- ─────────────────────────────────────────────────────────────────────────────
-- Impact :
--  - Aucun compte existant n'est modifié (aucun UPDATE sur user_profiles.role)
--  - Les contrôles serveur existants sont des listes blanches ('vet','admin') :
--    'vet_employe' en est exclu par construction (signatures, PDF, prévisionnel)
--  - planning_data : aucune policy touchée (toutes les écritures passent par
--    l'Edge Function save-planning depuis 20260714000001)
-- ─────────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────
-- 1. Nouveau rôle 'vet_employe'
-- ─────────────────────────────────────────────────────────────────
-- La contrainte inline de 20240401000001 est nommée automatiquement par
-- PostgreSQL : <table>_<colonne>_check. On la remplace de façon idempotente.
alter table user_profiles drop constraint if exists user_profiles_role_check;
alter table user_profiles add constraint user_profiles_role_check
  check (role in ('admin', 'vet', 'vet_employe', 'asv'));

-- Flag d'ouverture future : autoriser un vétérinaire salarié à éditer le planning ASV.
-- Défaut false = le rôle est cantonné au calendrier vétérinaire.
alter table user_profiles add column if not exists can_edit_asv_calendar boolean not null default false;

-- Note : la policy "vet admin reads all profiles" n'est VOLONTAIREMENT pas étendue
-- à 'vet_employe'. Il n'accède ni au tableau de bord ni aux réglages : il n'a
-- besoin que de son propre profil, déjà couvert par "user reads own profile".

-- ─────────────────────────────────────────────────────────────────
-- 2. Roster vétérinaire partagé
-- ─────────────────────────────────────────────────────────────────
-- INVARIANT : `id` sert de person_id dans les clés de planning
-- ("YYYY-MM-DD_<id>_M"). Il ne doit jamais contenir `_`, `/` ni espace,
-- sans quoi extractPersonIdFromKey() (planning-auth) découperait mal la clé.
create table if not exists vet_roster (
  id text primary key check (id <> '' and id !~ '[_/[:space:]]'),
  name text not null,
  short text not null,
  initial text not null,
  color text not null,
  partner boolean not null default false,  -- true = associé : ses congés ne sont pas soumis à validation
  archived boolean not null default false,
  sort_order integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table vet_roster enable row level security;

-- Lecture : tout compte authentifié. Nécessaire — un ASV doit pouvoir afficher
-- le calendrier vétérinaire (et le repère « en attente » des salariés).
drop policy if exists "auth reads vet_roster" on vet_roster;
create policy "auth reads vet_roster" on vet_roster
  for select using (auth.role() = 'authenticated');

-- Écriture : associés (vet) et admin uniquement. 'vet_employe' et 'asv' exclus.
drop policy if exists "vet admin writes vet_roster" on vet_roster;
create policy "vet admin writes vet_roster" on vet_roster
  for all using (
    (select role from user_profiles where id = auth.uid()) in ('admin', 'vet')
  ) with check (
    (select role from user_profiles where id = auth.uid()) in ('admin', 'vet')
  );

-- ─────────────────────────────────────────────────────────────────
-- 3. Amorçage : les deux associés actuels
-- ─────────────────────────────────────────────────────────────────
-- Valeurs reprises à l'identique de src/config.js (PEOPLE) pour que l'affichage
-- soit inchangé après bascule. partner = true → aucune validation de congé.
insert into vet_roster (id, name, short, initial, color, partner, sort_order) values
  ('david',    'Dr. David Pelois',      'David',    'D', '#2563EB', true, 0),
  ('stephane', 'Dr. Stéphane Maquinay', 'Stéphane', 'S', '#7C3AED', true, 1)
on conflict (id) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- VÉRIFICATION post-exécution :
--
-- 1. Rôles autorisés :
--    select conname, pg_get_constraintdef(oid) from pg_constraint
--    where conrelid = 'user_profiles'::regclass and conname = 'user_profiles_role_check';
--    → doit lister admin, vet, vet_employe, asv
--
-- 2. Rôles existants intacts :
--    select display_name, role from user_profiles order by role;
--    → Jérémie=admin, Stéphane=vet, David=vet, Marie=asv (inchangés)
--
-- 3. Roster amorcé :
--    select id, short, partner, archived from vet_roster order by sort_order;
--    → david et stephane, partner=true
--
-- 4. Lecture du roster par un ASV (console DevTools, connecté en ASV) :
--    const s = JSON.parse(sessionStorage.getItem('amivet_auth_session'));
--    await (await fetch('.../rest/v1/vet_roster?select=*', { headers:{ apikey: ANON_KEY,
--      Authorization:`Bearer ${s.access_token}` }})).json();
--    → doit renvoyer les 2 lignes (lecture autorisée)
--
-- 5. Écriture du roster par un ASV → doit échouer (0 ligne insérée / 403)
-- ─────────────────────────────────────────────────────────────────────────────
--
-- NOTE DE DETTE (hors périmètre de cette migration) :
-- Le roster ASV vit toujours dans localStorage (clé 'amivet_asv_roster'), donc
-- par appareil. Les 4 ASV actuels sont des valeurs par défaut codées en dur, ce
-- qui masque le problème ; tout ASV ajouté via l'UI n'existe que sur le poste qui
-- l'a créé. Migrer ASV_PEOPLE vers une table partagée (même schéma que vet_roster)
-- réglerait cette dette.
