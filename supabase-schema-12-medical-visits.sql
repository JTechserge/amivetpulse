-- Module Visites médicales — suivi des aptitudes
-- À exécuter dans Supabase SQL Editor.
CREATE TABLE IF NOT EXISTS medical_visits (
  id               UUID           DEFAULT gen_random_uuid() PRIMARY KEY,
  person_id        TEXT           NOT NULL,
  visit_date       DATE           NOT NULL,
  visit_type       TEXT           NOT NULL DEFAULT 'periodique',
    -- 'embauche' | 'periodique' | 'reprise' | 'spontanee'
  status           TEXT           NOT NULL DEFAULT 'apte',
    -- 'apte' | 'apte_reserves' | 'inapte' | 'en_attente'
  reserves_note    TEXT           NOT NULL DEFAULT '',
  next_visit_date  DATE,                     -- NULL = calculé auto via frequency_months
  frequency_months INT            NOT NULL DEFAULT 60,
    -- 60 = 5 ans (standard), 24 = 2 ans (surveillance renforcée)
  doctor_name      TEXT           NOT NULL DEFAULT '',
  notes            TEXT           NOT NULL DEFAULT '',
  created_at       TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);
ALTER TABLE medical_visits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow anon read"   ON medical_visits FOR SELECT USING (true);
CREATE POLICY "allow anon write"  ON medical_visits FOR INSERT WITH CHECK (true);
CREATE POLICY "allow anon update" ON medical_visits FOR UPDATE USING (true);
CREATE POLICY "allow anon delete" ON medical_visits FOR DELETE USING (true);
