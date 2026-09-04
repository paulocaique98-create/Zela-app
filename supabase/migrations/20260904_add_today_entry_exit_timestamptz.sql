-- BUG CRÍTICO: students.today_entry/today_exit são colunas `time` (sem
-- data), mas o código do app grava nelas um texto "YYYY-MM-DD|HH:MM:SS" pra
-- conseguir reconstruir o instante EXATO da solicitação (reconhecimento no
-- totem) na hora de gravar attendance_logs.event_time na confirmação.
--
-- Como a coluna é `time`, o Postgres/PostgREST descarta a parte "YYYY-MM-DD|"
-- ao persistir -- qualquer leitura de volta do banco (fetch inicial,
-- Realtime, ou o fallback de busca no confirmar) recebe só "HH:MM:SS", sem o
-- '|' que o parser do client procura. Resultado: o código cai no fallback
-- `now.toISOString()" (o horário do CLIQUE DE CONFIRMAÇÃO), não o horário
-- real da solicitação -- exatamente o que a família reclamou ver no
-- Histórico Geral divergindo do Acompanhamento Diário.
--
-- Fix: colunas dedicadas timestamptz, que preservam o instante completo sem
-- nenhuma perda por ida-e-volta no banco. today_entry/today_exit (time)
-- continuam existindo e sendo usadas normalmente pra exibição/comparação com
-- horário contratado -- não são alteradas nem removidas nesta migration.
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS today_entry_at timestamptz,
  ADD COLUMN IF NOT EXISTS today_exit_at timestamptz;

COMMENT ON COLUMN public.students.today_entry_at IS
  'Instante exato (timestamptz) do reconhecimento/solicitação de entrada de hoje. Fonte de verdade pra attendance_logs.event_time na confirmação -- today_entry (time) perde a data e não deve ser usado pra esse fim.';
COMMENT ON COLUMN public.students.today_exit_at IS
  'Instante exato (timestamptz) do reconhecimento/solicitação de saída de hoje. Fonte de verdade pra attendance_logs.event_time na confirmação -- today_exit (time) perde a data e não deve ser usado pra esse fim.';
