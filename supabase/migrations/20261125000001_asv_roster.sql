-- ═════════════════════════════════════════════════════════════════
-- Effectif ASV partagé entre postes (table asv_roster)
-- ═════════════════════════════════════════════════════════════════
-- Pourquoi : l'effectif ASV (personnes, fraction de temps, jours travaillés,
-- « samedi seulement », archivage, couleur) vivait dans le localStorage de
-- chaque poste (`amivet_asv_roster`, src/state.js). Un autre poste affichait
-- d'autres personnes et d'autres fractions, donc d'autres CP acquis et une
-- autre cible annuelle. ENJEU DE PAIE.
--
-- Modèle : vet_roster (20260803000001_role_vet_employe.sql), avec trois
-- durcissements issus de la contre-expertise du 25/11/2026 :
--   1. updated_at réellement tenu à jour par trigger → support d'une écriture
--      ligne à ligne avec contrôle de concurrence optimiste côté client ;
--   2. forme de working_days contrainte (tableau de jours 1..6, ou null) ;
--   3. un même id ne peut exister à la fois dans vet_roster et asv_roster
--      (il sert de person_id dans les clés de planning).
-- DELETE n'a AUCUNE policy : seule la purge admin (manage-users, service
-- role) supprime une ligne, en dernier, après les données de planning.
--
-- AUCUN AMORÇAGE ICI. L'effectif de départ est celui du poste principal de
-- Jérémie, exporté, relu et inséré séparément (lot 3). Jamais l'effectif par
-- défaut de src/config.js.
--
-- À VALIDER AVANT EXÉCUTION.

-- ─────────────────────────────────────────────────────────────────
-- 1. Table
-- ─────────────────────────────────────────────────────────────────
-- INVARIANT : `id` sert de person_id dans les clés de planning
-- ("YYYY-MM-DD_<id>_M"). Ni `_`, ni `/`, ni espace.
create table if not exists asv_roster (
  id text primary key check (id <> '' and id !~ '[_/[:space:]]'),
  name text not null,
  short text not null,
  initial text not null,
  last_name text,
  color text not null,
  -- Proratise les CP acquis et la cible annuelle (src/lib/time-fraction.js).
  -- 0 % ferait tomber les CP à zéro sans alerte : refusé en base.
  time_fraction numeric not null check (time_fraction > 0 and time_fraction <= 1),
  -- null = pas de liste de jours ; sinon jours travaillés, 1 = lundi … 6 = samedi.
  working_days jsonb check (
    working_days is null
    or (
      jsonb_typeof(working_days) = 'array'
      and not jsonb_path_exists(
        working_days,
        '$[*] ? (@.type() != "number" || @ < 1 || @ > 6)'
      )
    )
  ),
  saturday_only boolean not null default false,
  archived boolean not null default false,
  sort_order integer not null default 0,
  updated_at timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────────
-- 2. updated_at tenu à jour à chaque modification
-- ─────────────────────────────────────────────────────────────────
-- `default now()` ne joue qu'à l'insertion ; sans ce trigger, un UPDATE ou un
-- upsert laisserait updated_at figé et le contrôle de concurrence serait aveugle.
create or replace function asv_roster_touch() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists asv_roster_touch on asv_roster;
create trigger asv_roster_touch before update on asv_roster
  for each row execute function asv_roster_touch();

-- ─────────────────────────────────────────────────────────────────
-- 3. Espace de noms commun vet_roster / asv_roster
-- ─────────────────────────────────────────────────────────────────
-- Garanti jusqu'ici côté client seulement (src/settings.js, uniqueASVId),
-- ce qui ne tient plus quand plusieurs postes écrivent. security definer :
-- la vérification doit voir l'autre table quel que soit le rôle appelant.
create or replace function roster_id_unique_across() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'asv_roster' then
    if exists (select 1 from vet_roster where id = new.id) then
      raise exception 'person_id % déjà utilisé par vet_roster', new.id;
    end if;
  else
    if exists (select 1 from asv_roster where id = new.id) then
      raise exception 'person_id % déjà utilisé par asv_roster', new.id;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists asv_roster_id_unique on asv_roster;
create trigger asv_roster_id_unique before insert or update of id on asv_roster
  for each row execute function roster_id_unique_across();

drop trigger if exists vet_roster_id_unique on vet_roster;
create trigger vet_roster_id_unique before insert or update of id on vet_roster
  for each row execute function roster_id_unique_across();

-- ─────────────────────────────────────────────────────────────────
-- 4. RLS
-- ─────────────────────────────────────────────────────────────────
alter table asv_roster enable row level security;

-- Lecture : tout compte authentifié (une ASV affiche le calendrier ASV).
drop policy if exists "auth reads asv_roster" on asv_roster;
create policy "auth reads asv_roster" on asv_roster
  for select using (auth.role() = 'authenticated');

-- Insertion / modification : admin et vet (associés), exactement les rôles qui
-- accèdent aux Réglages aujourd'hui (src/app.js, canAccessSettings).
drop policy if exists "vet admin inserts asv_roster" on asv_roster;
create policy "vet admin inserts asv_roster" on asv_roster
  for insert with check (
    (select role from user_profiles where id = auth.uid()) in ('admin', 'vet')
  );

drop policy if exists "vet admin updates asv_roster" on asv_roster;
create policy "vet admin updates asv_roster" on asv_roster
  for update using (
    (select role from user_profiles where id = auth.uid()) in ('admin', 'vet')
  ) with check (
    (select role from user_profiles where id = auth.uid()) in ('admin', 'vet')
  );

-- Pas de policy DELETE : refusé à tout client. La purge passe par
-- manage-users (service role, admin seul), qui supprime la ligne en dernier.

-- ─────────────────────────────────────────────────────────────────
-- 5. Vérifications après exécution (SQL Editor)
-- ─────────────────────────────────────────────────────────────────
-- a) select relrowsecurity from pg_class where relname = 'asv_roster';  → true
-- b) select policyname, cmd from pg_policies where tablename = 'asv_roster';
--    → 3 lignes : SELECT, INSERT, UPDATE (aucune DELETE)
-- c) Refus attendus (chacun doit lever une erreur) :
--    insert into asv_roster (id,name,short,initial,color,time_fraction)
--      values ('zz-test','T','T','T','#000000',0);            -- fraction 0
--    insert into asv_roster (id,name,short,initial,color,time_fraction,working_days)
--      values ('zz-test','T','T','T','#000000',1,'[7]');      -- jour hors 1..6
--    insert into asv_roster (id,name,short,initial,color,time_fraction)
--      values ('david','T','T','T','#000000',1);              -- id déjà vétérinaire
-- d) select count(*) from asv_roster;  → 0 (l'amorçage est le lot 3)
