-- Module CP — ajustements manuels (report N-1, ancienneté, récup…)
-- À exécuter dans Supabase SQL Editor.
CREATE TABLE IF NOT EXISTS cp_adjustments (
  person_id      TEXT           NOT NULL,
  year           INT            NOT NULL,  -- année de FIN de période (ex: 2026 = période juin 2025 → mai 2026)
  carried_over   DECIMAL(5,2)   NOT NULL DEFAULT 0,  -- report N-1 saisi par l'admin
  extra_days     DECIMAL(5,2)   NOT NULL DEFAULT 0,  -- ajustement manuel (ancienneté, récup…)
  extra_note     TEXT           NOT NULL DEFAULT '',
  updated_at     TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  PRIMARY KEY (person_id, year)
);
ALTER TABLE cp_adjustments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow anon read"   ON cp_adjustments FOR SELECT USING (true);
CREATE POLICY "allow anon write"  ON cp_adjustments FOR INSERT WITH CHECK (true);
CREATE POLICY "allow anon update" ON cp_adjustments FOR UPDATE USING (true);
