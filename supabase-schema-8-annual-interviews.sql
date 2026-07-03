-- À exécuter dans Supabase → SQL Editor → New query → Run
-- Ajoute la table des entretiens annuels (un enregistrement par ASV par année).

create table if not exists annual_interviews (
  id uuid primary key default gen_random_uuid(),
  person_id text not null,           -- id de l'ASV (ex: 'marie')
  year int not null,                 -- année de l'entretien
  status text not null default 'pending',
    -- 'pending'   = à planifier
    -- 'scheduled' = date fixée
    -- 'done'      = réalisé
  scheduled_date date,               -- date prévue
  done_date date,                    -- date de réalisation
  interviewer_id text,               -- id du vétérinaire (ex: 'david')
  objectives_prev text,              -- bilan objectifs N-1
  objectives_next text,              -- objectifs N+1
  comments text,                     -- commentaires libres
  rating int check (rating between 1 and 5),  -- note globale /5
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(person_id, year)
);

alter table annual_interviews enable row level security;

-- Accès complet pour tout utilisateur authentifié
-- (l'onglet "Entretiens annuels" est déjà réservé aux rôles vet/admin côté JS)
drop policy if exists "auth all annual_interviews" on annual_interviews;
create policy "auth all annual_interviews" on annual_interviews
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');
