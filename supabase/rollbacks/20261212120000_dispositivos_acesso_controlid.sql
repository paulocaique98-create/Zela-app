-- Reverte 20261212120000_dispositivos_acesso_controlid.sql. Rodar só como postgres/service_role.
-- Apaga os dispositivos e eventos cadastrados (tabelas novas, sem dados de outras features).
drop function if exists public.registrar_evento_dispositivo(uuid, text, text, timestamptz, bigint, jsonb);
drop function if exists public.autenticar_dispositivo_acesso(text, bigint);
drop function if exists public.listar_dispositivos_acesso(uuid);
drop function if exists public.definir_status_dispositivo_acesso(uuid, text);
drop function if exists public.girar_token_dispositivo_acesso(uuid);
drop function if exists public.registrar_dispositivo_acesso(uuid, text, text, text);
drop function if exists public.access_device_pode_gerir(uuid);
drop table if exists public.device_events;
drop table if exists public.access_devices;
