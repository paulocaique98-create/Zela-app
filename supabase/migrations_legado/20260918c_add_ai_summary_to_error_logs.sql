-- Fase B do PLANO_IA_RESUMO_ERROS.md — schema aditivo, zero risco.
--
-- Guarda a explicação gerada por IA (Gemini, sob demanda, só quando o
-- dicionário determinístico de src/lib/errorSummaries.js não reconhece o
-- erro) direto na linha de error_logs -- cacheada, nunca gerada de novo
-- sozinha pro mesmo log. Nenhuma policy de RLS nova: já existe SELECT/UPDATE
-- só para developer na tabela inteira (Fase A do PLANO_LOGGING_ERROS...).
ALTER TABLE public.error_logs ADD COLUMN IF NOT EXISTS ai_summary text;
ALTER TABLE public.error_logs ADD COLUMN IF NOT EXISTS ai_summary_model text;
ALTER TABLE public.error_logs ADD COLUMN IF NOT EXISTS ai_summary_generated_at timestamptz;
ALTER TABLE public.error_logs ADD COLUMN IF NOT EXISTS ai_summary_generated_by uuid;
