-- Ajoute le support des signatures de prévisionnel annuel ASV.
-- 1. Colonne `type` sur signature_tokens pour distinguer mensuel / prévisionnel.
-- 2. `month` devient nullable (pas utilisé pour le prévisionnel).
-- 3. Nouvelle table forecast_signatures.

-- ── signature_tokens ─────────────────────────────────────────────
alter table public.signature_tokens
  add column if not exists type text not null default 'monthly';

alter table public.signature_tokens
  alter column month drop not null;

-- ── forecast_signatures ──────────────────────────────────────────
create table if not exists public.forecast_signatures (
  id              uuid primary key default gen_random_uuid(),
  person_id       text        not null,
  year            integer     not null,
  signed_at       timestamptz not null default now(),
  signed_by_uid   uuid        references auth.users,
  signed_by_name  text,
  signed_by_email text,
  constraint forecast_signatures_person_year unique (person_id, year)
);

alter table public.forecast_signatures enable row level security;

-- Les utilisateurs authentifiés peuvent lire toutes les signatures prévisionnel
create policy "forecast_signatures_select"
  on public.forecast_signatures for select
  to authenticated using (true);

-- Seul le service_role (Edge Functions) peut insérer
create policy "forecast_signatures_insert"
  on public.forecast_signatures for insert
  to service_role with check (true);

-- Les vétérinaires et admins peuvent annuler une signature (vérification via user_profiles)
create policy "forecast_signatures_delete"
  on public.forecast_signatures for delete
  to authenticated
  using (
    exists (
      select 1 from public.user_profiles
      where id = auth.uid()
        and role in ('vet', 'admin')
    )
  );
