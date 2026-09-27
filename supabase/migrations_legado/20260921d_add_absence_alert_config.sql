-- Item #35 do roadmap: Alertas de Ausência Prolongada -- hoje
-- check-attendance-delays só cobre atraso NO MESMO DIA (30min sem
-- check-in vira "Ausente"). Esta migração adiciona o dado necessário pra
-- alertar quando um aluno acumula N dias ÚTEIS CONSECUTIVOS sem
-- comparecer -- N configurável por escola (Sistema > Configurações > aba
-- "Faltas").
ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS absence_alert_config jsonb NOT NULL DEFAULT '{"enabled": false, "consecutive_days_threshold": 3}'::jsonb;

-- consecutive_absent_days: contador mantido pela edge function
-- check-attendance-delays -- incrementa 1 no exato momento em que o aluno é
-- marcado "Ausente" pela 1ª vez naquele dia (mesmo bloco que já existe,
-- ver studentsToMarkAbsent), zera assim que ele tiver um check-in de
-- verdade. absence_alert_sent_at: data em que o alerta já foi disparado
-- pra essa sequência -- evita alertar de novo todo dia enquanto a mesma
-- ausência continua; zera junto com o contador quando o aluno volta.
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS consecutive_absent_days integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS absence_alert_sent_at date;
