-- Notifications push (PWA) — abonnements Web Push par personne
-- À exécuter dans Supabase SQL Editor.
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id                 UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
  user_name          TEXT         NOT NULL UNIQUE, -- person_id : 'david', 'stephane', 'marie', 'johanna', 'julie'
  subscription_json  JSONB        NOT NULL,
  user_agent         TEXT,
  updated_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow anon read"   ON push_subscriptions FOR SELECT USING (true);
CREATE POLICY "allow anon write"  ON push_subscriptions FOR INSERT WITH CHECK (true);
CREATE POLICY "allow anon update" ON push_subscriptions FOR UPDATE USING (true);
CREATE POLICY "allow anon delete" ON push_subscriptions FOR DELETE USING (true);

-- La contrainte UNIQUE sur user_name permet un upsert (POST + Prefer:
-- resolution=merge-duplicates) depuis le client à chaque (ré)abonnement.
