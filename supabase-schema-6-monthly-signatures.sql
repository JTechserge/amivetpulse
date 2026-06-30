-- À exécuter une seule fois dans Supabase (SQL Editor → New query → Run), après les
-- migrations précédentes. Chaque ASV peut signer électroniquement sa feuille de présence
-- du mois en cours ; une fois signé, ce mois devient en lecture seule dans le calendrier
-- pour cette personne (pas de donnée sensible ici, donc pas besoin de fonctions RPC comme
-- pour le mot de passe — un accès direct via la clé anon suffit, RLS permissive comme pour
-- planning_data/email_settings).

create table if not exists monthly_signatures (
  person_id text not null,
  year int not null,
  month int not null, -- 0 = janvier, 11 = décembre (comme le reste de l'app)
  signed_at timestamptz not null default now(),
  signed_name text not null,
  primary key (person_id, year, month)
);

alter table monthly_signatures enable row level security;
drop policy if exists "allow anon read" on monthly_signatures;
create policy "allow anon read" on monthly_signatures
  for select using (true);
drop policy if exists "allow anon insert" on monthly_signatures;
create policy "allow anon insert" on monthly_signatures
  for insert with check (true);
drop policy if exists "allow anon delete" on monthly_signatures;
create policy "allow anon delete" on monthly_signatures
  for delete using (true);
