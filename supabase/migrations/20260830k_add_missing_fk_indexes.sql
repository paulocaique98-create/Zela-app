-- Fase 17 (Auditoria Final) — achado de performance: colunas de FK
-- usadas em RLS e nas consultas mais frequentes do sistema sem nenhum
-- índice (confirmado via EXPLAIN ANALYZE: Seq Scan em students.family_id).
-- Rápido hoje (poucas linhas), mas degrada linearmente conforme a base
-- cresce — e essas colunas são avaliadas em TODA policy RLS relevante, não
-- só em telas específicas. Só as colunas de alto valor (usadas em RLS ou
-- em queries de tela real) — as ~40 colunas de auditoria (created_by,
-- updated_by, author_id etc.) ficam de fora de propósito, raramente
-- filtradas em escala.
CREATE INDEX IF NOT EXISTS idx_students_family_id ON public.students(family_id);
CREATE INDEX IF NOT EXISTS idx_students_school_id ON public.students(school_id);
CREATE INDEX IF NOT EXISTS idx_authorized_persons_family_id ON public.authorized_persons(family_id);
CREATE INDEX IF NOT EXISTS idx_attendance_logs_school_id ON public.attendance_logs(school_id);
CREATE INDEX IF NOT EXISTS idx_attendance_logs_student_id ON public.attendance_logs(student_id);
CREATE INDEX IF NOT EXISTS idx_attendance_logs_family_id ON public.attendance_logs(family_id);
CREATE INDEX IF NOT EXISTS idx_notifications_family_id ON public.notifications(family_id);
CREATE INDEX IF NOT EXISTS idx_notifications_school_id ON public.notifications(school_id);
CREATE INDEX IF NOT EXISTS idx_notifications_student_id ON public.notifications(student_id);
CREATE INDEX IF NOT EXISTS idx_medical_records_school_id ON public.medical_records(school_id);
CREATE INDEX IF NOT EXISTS idx_student_guardians_school_id ON public.student_guardians(school_id);
CREATE INDEX IF NOT EXISTS idx_history_records_school_id ON public.history_records(school_id);
CREATE INDEX IF NOT EXISTS idx_history_records_student_id ON public.history_records(student_id);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_school_id ON public.push_subscriptions(school_id);
