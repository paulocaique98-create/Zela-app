-- Auditoria de segurança (27/09/2026) · item 6 (crítico).
--
-- Resto de uma versão antiga do totem que se identificava pelo cabeçalho
-- x-kiosk-token, sem login. Nenhum código do app (src/ nem Edge Functions)
-- usa mais isso -- o Autoatendimento de hoje roda com a sessão do admin
-- logado (AdminPortal.jsx, aba kiosk) -- mas as policies continuavam
-- valendo, com 4 tokens ativos em kiosk_devices (nunca usados:
-- last_used_at vazio desde julho). Quem tivesse um token conseguia, sem
-- login, alterar QUALQUER coluna de QUALQUER aluno da escola, inserir
-- presença e ler os autorizados (incluindo descritores faciais).
--
-- get_kiosk_school_id() ainda consultava kiosk_devices.status, coluna que
-- não existe (a real é is_active) -- estava quebrada.
--
-- A tabela kiosk_devices fica (só desativa os tokens), pra ser reversível.

update public.kiosk_devices set is_active = false where is_active;

drop policy if exists "Insercao de logs por kiosk" on public.attendance_logs;
drop policy if exists "Kiosks inserem historico" on public.attendance_logs;
drop policy if exists "Kiosks acessam authorized_persons da escola" on public.authorized_persons;
drop policy if exists "Kiosks leem a propria escola" on public.schools;
drop policy if exists "Atualizacao de estudantes por kiosk" on public.students;
drop policy if exists "Kiosks acessam students da escola" on public.students;
drop policy if exists "Kiosks atualizam students da escola" on public.students;

drop function if exists public.get_kiosk_school_id();
