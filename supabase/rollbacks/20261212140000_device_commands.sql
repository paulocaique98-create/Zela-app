-- Reverte 20261212140000_device_commands.sql. Rodar só como postgres/service_role.
-- Apaga a fila de comandos (tabela nova, sem dados de outras features).
drop function if exists public.concluir_comando_dispositivo(uuid, boolean, text, uuid);
drop function if exists public.proximo_comando_dispositivo(uuid);
drop function if exists public.listar_comandos_dispositivo(uuid);
drop function if exists public.enfileirar_comando_dispositivo(uuid, text, bigint);
drop table if exists public.device_commands;
drop function if exists public.device_commands_checa_escola();
