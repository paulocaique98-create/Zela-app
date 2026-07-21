-- 1. Adicionar colunas de horário contratado na tabela students
ALTER TABLE students ADD COLUMN IF NOT EXISTS contracted_entry_time time;
ALTER TABLE students ADD COLUMN IF NOT EXISTS contracted_exit_time time;

-- 2. Criar tabela notifications
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  family_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, -- Presumindo que os responsáveis estão na tabela users
  student_id uuid REFERENCES students(id) ON DELETE CASCADE, -- Nullable para avisos gerais
  type text NOT NULL, -- 'welcome', 'checkin_confirmed', 'checkout_confirmed', 'late_entry_5min', 'late_exit_5min', 'late_exit_10min_warning', 'late_exit_15min_billing'
  message text NOT NULL,
  read_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Ativar RLS em notifications
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Families podem ler suas próprias notificações
CREATE POLICY "Families veem suas proprias notificacoes" 
ON notifications FOR SELECT 
USING (auth.uid() = family_id);

-- Families podem atualizar (marcar como lida) suas próprias notificações
CREATE POLICY "Families atualizam suas proprias notificacoes" 
ON notifications FOR UPDATE 
USING (auth.uid() = family_id);

-- Admins podem ler as notificações da sua escola (opcional/útil para debug e acompanhamento)
CREATE POLICY "Admins veem notificacoes da escola" 
ON notifications FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM users 
    WHERE users.id = auth.uid() 
      AND users.role = 'admin' 
      AND users.school_id = notifications.school_id
  )
);

-- 3. Criar tabela daily_attendance_status
CREATE TABLE IF NOT EXISTS daily_attendance_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  date date NOT NULL DEFAULT CURRENT_DATE,
  notified_late_entry_5 boolean DEFAULT false,
  notified_late_exit_5 boolean DEFAULT false,
  notified_late_exit_10 boolean DEFAULT false,
  notified_late_exit_15_billing boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  UNIQUE (student_id, date)
);

-- Ativar RLS em daily_attendance_status
ALTER TABLE daily_attendance_status ENABLE ROW LEVEL SECURITY;

-- Admins podem ler o status diário da sua escola
CREATE POLICY "Admins veem status diario da escola" 
ON daily_attendance_status FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM users 
    WHERE users.id = auth.uid() 
      AND users.role = 'admin' 
      AND users.school_id = daily_attendance_status.school_id
  )
);

-- Como a Edge Function usará o token de `service_role` (que tem by-pass de RLS),
-- a inserção e atualização via job automatizado não precisa de policies específicas.
