-- 1. ADD ON DELETE CASCADE TO FOREIGN KEYS FOR SCHOOLS
-- users table
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_school_id_fkey;
ALTER TABLE users ADD CONSTRAINT users_school_id_fkey FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE;

-- students table
ALTER TABLE students DROP CONSTRAINT IF EXISTS students_school_id_fkey;
ALTER TABLE students ADD CONSTRAINT students_school_id_fkey FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE;

-- authorized_persons table
ALTER TABLE authorized_persons DROP CONSTRAINT IF EXISTS authorized_persons_school_id_fkey;
ALTER TABLE authorized_persons ADD CONSTRAINT authorized_persons_school_id_fkey FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE;

-- kiosk_devices table
ALTER TABLE kiosk_devices DROP CONSTRAINT IF EXISTS kiosk_devices_school_id_fkey;
ALTER TABLE kiosk_devices ADD CONSTRAINT kiosk_devices_school_id_fkey FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE;

-- attendance_logs table
ALTER TABLE attendance_logs DROP CONSTRAINT IF EXISTS attendance_logs_school_id_fkey;
ALTER TABLE attendance_logs ADD CONSTRAINT attendance_logs_school_id_fkey FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE;

-- 2. FIX USERS RLS FOR ADMINS
DROP POLICY IF EXISTS "Admins acessam usuarios da escola" ON users;
CREATE POLICY "Admins acessam usuarios da escola"
ON users FOR ALL
USING (
  school_id IN (
    SELECT school_id FROM users WHERE id = auth.uid() AND role = 'admin'
  )
);

-- 3. KIOSK AUTHENTICATION VIA POSTGREST HEADERS
CREATE OR REPLACE FUNCTION get_kiosk_school_id() RETURNS uuid AS $$
DECLARE
    kiosk_token text;
    k_school_id uuid;
BEGIN
    -- Obter o token customizado do header via PostgREST
    kiosk_token := current_setting('request.headers', true)::json->>'x-kiosk-token';
    IF kiosk_token IS NOT NULL THEN
        -- Validar se o token existe e está ativo na tabela kiosk_devices
        SELECT school_id INTO k_school_id FROM kiosk_devices WHERE device_token = kiosk_token AND status = 'active';
        RETURN k_school_id;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. KIOSK RLS POLICIES FOR ANONYMOUS ACCESS (BYPASSED SECURELY VIA CUSTOM FUNCTION)
-- Permitir que o kiosk leia authorized_persons da mesma escola
CREATE POLICY "Kiosks acessam authorized_persons da escola"
ON authorized_persons FOR SELECT
USING (school_id = get_kiosk_school_id());

-- Permitir que o kiosk leia e atualize o status dos students da escola
CREATE POLICY "Kiosks acessam students da escola"
ON students FOR SELECT
USING (school_id = get_kiosk_school_id());

CREATE POLICY "Kiosks atualizam students da escola"
ON students FOR UPDATE
USING (school_id = get_kiosk_school_id());

-- Permitir que o kiosk obtenha informações da escola
CREATE POLICY "Kiosks leem a propria escola"
ON schools FOR SELECT
USING (id = get_kiosk_school_id());

-- Permitir que o kiosk insira logs de presença (se o insert de attendance_logs for feito diretamente pelo client)
CREATE POLICY "Kiosks inserem historico"
ON attendance_logs FOR INSERT
WITH CHECK (school_id = get_kiosk_school_id());
