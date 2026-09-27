-- Corrige o horário do daily-reset-job (jobid=2): estava agendado como
-- "0 0 * * *", que o pg_cron interpreta em UTC. Como Brasília é UTC-3 (sem
-- horário de verão desde 2019), isso significa que o reset diário rodava às
-- 21h no horário local, não à meia-noite -- todo aluno que já tinha
-- movimentação hoje virava "idle" 3 horas mais cedo, sumindo da tela de
-- Presença Diária e do filtro "Hoje" de Histórico/Horas Extras logo no
-- fim da tarde/começo da noite, horário de pico de saída das crianças.
--
-- Correção: "0 3 * * *" (03:00 UTC = 00:00 em Brasília) roda de fato à
-- meia-noite local.
SELECT cron.alter_job(
  job_id := 2,
  schedule := '0 3 * * *'
);
