-- Module Annonces — tableau d'affichage numérique
-- À exécuter dans Supabase SQL Editor.
CREATE TABLE IF NOT EXISTS announcements (
  id           UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
  title        TEXT         NOT NULL,
  content      TEXT         NOT NULL,
  category     TEXT         NOT NULL DEFAULT 'info',
    -- 'urgent' | 'info' | 'task' | 'meeting'
  author_id    TEXT         NOT NULL,  -- person_id de l'auteur
  pinned       BOOLEAN      NOT NULL DEFAULT FALSE,
  target_roles TEXT         NOT NULL DEFAULT 'all',
    -- 'all' | 'vet' | 'asv'
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  expires_at   TIMESTAMPTZ            -- NULL = pas d'expiration
);
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow anon read"   ON announcements FOR SELECT USING (true);
CREATE POLICY "allow anon write"  ON announcements FOR INSERT WITH CHECK (true);
CREATE POLICY "allow anon update" ON announcements FOR UPDATE USING (true);
CREATE POLICY "allow anon delete" ON announcements FOR DELETE USING (true);

CREATE TABLE IF NOT EXISTS announcement_reads (
  announcement_id  UUID         NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  person_id        TEXT         NOT NULL,
  read_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  PRIMARY KEY (announcement_id, person_id)
);
ALTER TABLE announcement_reads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow anon read"  ON announcement_reads FOR SELECT USING (true);
CREATE POLICY "allow anon write" ON announcement_reads FOR INSERT WITH CHECK (true);
