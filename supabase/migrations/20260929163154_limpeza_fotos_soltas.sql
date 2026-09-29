-- Fotos de rosto SOLTAS no armazenamento (29/09/2026): arquivos em
-- person-photos/{escola}/ que nenhum cadastro de autorizado usa mais (ex.:
-- autorizado apagado antes de existir a limpeza da foto junto). Pela LGPD,
-- foto de rosto sem finalidade deve ser apagada. Mesmo modelo da Limpeza de
-- biometria: a Gestão vê a lista e confirma; o servidor confere de novo.
--
-- A foto sobe um instante ANTES de o cadastro gravar o caminho dela
-- (uploadAuthorizedPersonPhoto): só conta como solta depois de 1 dia, para
-- nunca pegar um envio em andamento.

create or replace function public.fotos_soltas(p_school_id uuid, p_idade_minima interval)
returns table (path text, criada_em timestamptz)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select o.name, o.created_at
  from storage.objects o
  where o.bucket_id = 'person-photos'
    and (storage.foldername(o.name))[1] = p_school_id::text
    and o.created_at < now() - p_idade_minima
    and not exists (select 1 from authorized_persons a where a.photo_storage_path = o.name)
  order by o.created_at;
$function$;
revoke execute on function public.fotos_soltas(uuid, interval) from public, anon, authenticated;

create or replace function public.list_fotos_soltas()
returns table (path text, criada_em timestamptz)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_school_id uuid := public.get_my_school_id();
begin
  if coalesce(public.get_my_role(), '') <> 'gestao' or v_school_id is null then
    raise exception 'Só a Gestão pode ver as fotos soltas.';
  end if;
  return query select f.path, f.criada_em from public.fotos_soltas(v_school_id, interval '1 day') f;
end;
$function$;
revoke execute on function public.list_fotos_soltas() from public, anon;
grant execute on function public.list_fotos_soltas() to authenticated;

-- Devolve só os caminhos que CONTINUAM soltos (a tela apaga esses do
-- armazenamento) e registra na auditoria.
create or replace function public.confirmar_fotos_soltas(p_paths text[])
returns table (path text)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_school_id uuid := public.get_my_school_id();
  v_paths text[];
begin
  if coalesce(public.get_my_role(), '') <> 'gestao' or v_school_id is null then
    raise exception 'Só a Gestão pode apagar fotos soltas.';
  end if;
  select coalesce(array_agg(f.path), array[]::text[]) into v_paths
  from public.fotos_soltas(v_school_id, interval '1 day') f
  where f.path = any(coalesce(p_paths, array[]::text[]));

  insert into audit_logs (school_id, actor_id, action, entity_type, details)
  values (v_school_id, auth.uid(), 'purge_fotos_soltas', 'storage',
          jsonb_build_object('quantidade', cardinality(v_paths), 'arquivos', to_jsonb(v_paths)));

  return query select unnest(v_paths);
end;
$function$;
revoke execute on function public.confirmar_fotos_soltas(text[]) from public, anon;
grant execute on function public.confirmar_fotos_soltas(text[]) to authenticated;
