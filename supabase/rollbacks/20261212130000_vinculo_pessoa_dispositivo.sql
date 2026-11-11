-- Reverte 20261212130000_vinculo_pessoa_dispositivo.sql. Rodar só como postgres/service_role.
-- Apaga os vínculos cadastrados (tabela nova, sem dados de outras features).
drop function if exists public.resolver_pessoa_dispositivo(uuid, bigint);
drop function if exists public.listar_vinculos_dispositivo(uuid);
drop function if exists public.desvincular_pessoa_dispositivo(uuid);
drop function if exists public.vincular_pessoa_dispositivo(uuid, bigint, uuid, uuid);
drop table if exists public.device_person_links;
drop function if exists public.device_person_links_checa_escola();
