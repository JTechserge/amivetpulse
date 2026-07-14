-- Rejouer 20260713000001 en toute sécurité (idempotent)
-- À utiliser si la migration a déjà été partiellement ou totalement appliquée.
-- Supprime les nouvelles politiques avant de les recréer.

-- app_security
DROP POLICY IF EXISTS "allow anon update" ON app_security;

-- monthly_signatures
DROP POLICY IF EXISTS "authenticated insert monthly_signatures" ON monthly_signatures;
DROP POLICY IF EXISTS "authenticated delete monthly_signatures" ON monthly_signatures;
DROP POLICY IF EXISTS "owner insert signature" ON monthly_signatures;
CREATE POLICY "owner insert signature" ON monthly_signatures
  FOR INSERT TO authenticated WITH CHECK (
    person_id = (SELECT person_id FROM user_profiles WHERE id = auth.uid())
  );

-- email_settings
DROP POLICY IF EXISTS "auth insert email_settings" ON email_settings;
DROP POLICY IF EXISTS "auth update email_settings" ON email_settings;
DROP POLICY IF EXISTS "admin insert email_settings" ON email_settings;
DROP POLICY IF EXISTS "admin update email_settings" ON email_settings;
CREATE POLICY "admin insert email_settings" ON email_settings
  FOR INSERT TO authenticated WITH CHECK (get_my_role() = 'admin');
CREATE POLICY "admin update email_settings" ON email_settings
  FOR UPDATE USING (get_my_role() = 'admin');

-- cp_adjustments
DROP POLICY IF EXISTS "allow anon read"   ON cp_adjustments;
DROP POLICY IF EXISTS "allow anon write"  ON cp_adjustments;
DROP POLICY IF EXISTS "allow anon update" ON cp_adjustments;
DROP POLICY IF EXISTS "auth read cp_adjustments"   ON cp_adjustments;
DROP POLICY IF EXISTS "admin insert cp_adjustments" ON cp_adjustments;
DROP POLICY IF EXISTS "admin update cp_adjustments" ON cp_adjustments;
CREATE POLICY "auth read cp_adjustments" ON cp_adjustments
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "admin insert cp_adjustments" ON cp_adjustments
  FOR INSERT TO authenticated WITH CHECK (get_my_role() = 'admin');
CREATE POLICY "admin update cp_adjustments" ON cp_adjustments
  FOR UPDATE USING (get_my_role() = 'admin');

-- announcements
DROP POLICY IF EXISTS "allow anon read"   ON announcements;
DROP POLICY IF EXISTS "allow anon write"  ON announcements;
DROP POLICY IF EXISTS "allow anon update" ON announcements;
DROP POLICY IF EXISTS "allow anon delete" ON announcements;
DROP POLICY IF EXISTS "auth read announcements"    ON announcements;
DROP POLICY IF EXISTS "admin insert announcements" ON announcements;
DROP POLICY IF EXISTS "admin update announcements" ON announcements;
DROP POLICY IF EXISTS "admin delete announcements" ON announcements;
CREATE POLICY "auth read announcements" ON announcements
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "admin insert announcements" ON announcements
  FOR INSERT TO authenticated WITH CHECK (get_my_role() = 'admin');
CREATE POLICY "admin update announcements" ON announcements
  FOR UPDATE USING (get_my_role() = 'admin');
CREATE POLICY "admin delete announcements" ON announcements
  FOR DELETE USING (get_my_role() = 'admin');

-- announcement_reads
DROP POLICY IF EXISTS "allow anon read"  ON announcement_reads;
DROP POLICY IF EXISTS "allow anon write" ON announcement_reads;
DROP POLICY IF EXISTS "auth read announcement_reads" ON announcement_reads;
DROP POLICY IF EXISTS "owner insert read_receipt"   ON announcement_reads;
CREATE POLICY "auth read announcement_reads" ON announcement_reads
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "owner insert read_receipt" ON announcement_reads
  FOR INSERT TO authenticated WITH CHECK (
    person_id = (SELECT person_id FROM user_profiles WHERE id = auth.uid())
  );

-- push_subscriptions
DROP POLICY IF EXISTS "allow anon read"   ON push_subscriptions;
DROP POLICY IF EXISTS "allow anon write"  ON push_subscriptions;
DROP POLICY IF EXISTS "allow anon update" ON push_subscriptions;
DROP POLICY IF EXISTS "allow anon delete" ON push_subscriptions;
DROP POLICY IF EXISTS "auth read push_subscriptions"    ON push_subscriptions;
DROP POLICY IF EXISTS "owner upsert push_subscription"  ON push_subscriptions;
DROP POLICY IF EXISTS "owner update push_subscription"  ON push_subscriptions;
DROP POLICY IF EXISTS "owner delete push_subscription"  ON push_subscriptions;
CREATE POLICY "auth read push_subscriptions" ON push_subscriptions
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "owner upsert push_subscription" ON push_subscriptions
  FOR INSERT TO authenticated WITH CHECK (
    user_name = (SELECT person_id FROM user_profiles WHERE id = auth.uid())
  );
CREATE POLICY "owner update push_subscription" ON push_subscriptions
  FOR UPDATE USING (
    user_name = (SELECT person_id FROM user_profiles WHERE id = auth.uid())
  );
CREATE POLICY "owner delete push_subscription" ON push_subscriptions
  FOR DELETE USING (
    user_name = (SELECT person_id FROM user_profiles WHERE id = auth.uid())
  );

-- medical_visits
DROP POLICY IF EXISTS "allow anon read"   ON medical_visits;
DROP POLICY IF EXISTS "allow anon write"  ON medical_visits;
DROP POLICY IF EXISTS "allow anon update" ON medical_visits;
DROP POLICY IF EXISTS "allow anon delete" ON medical_visits;
DROP POLICY IF EXISTS "auth read medical_visits"         ON medical_visits;
DROP POLICY IF EXISTS "vet admin insert medical_visits"  ON medical_visits;
DROP POLICY IF EXISTS "vet admin update medical_visits"  ON medical_visits;
DROP POLICY IF EXISTS "vet admin delete medical_visits"  ON medical_visits;
CREATE POLICY "auth read medical_visits" ON medical_visits
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "vet admin insert medical_visits" ON medical_visits
  FOR INSERT TO authenticated WITH CHECK (get_my_role() IN ('admin', 'vet'));
CREATE POLICY "vet admin update medical_visits" ON medical_visits
  FOR UPDATE USING (get_my_role() IN ('admin', 'vet'));
CREATE POLICY "vet admin delete medical_visits" ON medical_visits
  FOR DELETE USING (get_my_role() IN ('admin', 'vet'));
