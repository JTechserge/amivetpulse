-- À exécuter dans Supabase SQL Editor après les migrations précédentes.
-- Remplace le mécanisme de signature "saisie de nom" par un flux email-avec-lien :
-- 1. L'ASV clique "Signer" → un email avec récapitulatif + lien unique lui est envoyé
-- 2. Elle clique le lien → s'authentifie → confirme dans l'app
-- 3. La signature est enregistrée avec son auth.uid() et email : preuve juridique SES eIDAS

-- Table des tokens de signature (un par demande, usage unique, expiration 7 jours)
create table if not exists signature_tokens (
  id            uuid primary key default gen_random_uuid(),
  person_id     text not null,
  year          int  not null,
  month         int  not null,  -- 0 = janvier, 11 = décembre (cohérent avec le reste de l'app)
  expires_at    timestamptz not null,
  used_at       timestamptz,    -- null = non utilisé ; rempli au moment de la confirmation
  created_at    timestamptz default now()
);
alter table signature_tokens enable row level security;
-- Les Edge Functions utilisent la clé service_role (bypass RLS) ; le client n'a pas
-- besoin d'accéder à cette table directement — on bloque donc tout accès public.
create policy "no public access signature_tokens" on signature_tokens
  using (false);

-- Enrichir monthly_signatures avec les preuves d'identité
alter table monthly_signatures
  add column if not exists signed_by_user_id uuid,
  add column if not exists signed_by_email    text,
  add column if not exists token_id           uuid references signature_tokens(id);

-- Resserrer la RLS de monthly_signatures : les insertions/suppressions
-- nécessitent désormais une session authentifiée (plus d'accès anon).
drop policy if exists "allow anon insert" on monthly_signatures;
create policy "authenticated insert monthly_signatures" on monthly_signatures
  for insert to authenticated with check (true);

drop policy if exists "allow anon delete" on monthly_signatures;
create policy "authenticated delete monthly_signatures" on monthly_signatures
  for delete to authenticated using (true);
