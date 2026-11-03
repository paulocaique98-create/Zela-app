-- Aviso de atraso antes do bloqueio (plano de faturamento, seção 7, 9C).
-- Só leitura. Nenhuma tabela, policy ou dado é alterado.
--  1) zela_cobranca_vencida_da_escola(school): fonte única da cobrança vencida mais antiga da escola
--     (fechada para o app; usada só por funções DEFINER).
--  2) meu_estado_bloqueio() passa a usar a fonte única. Resultado idêntico ao da fase 1.
--  3) meu_aviso_atraso(): aviso enquanto a escola AINDA está liberada. school_id vem só de users.
--     gestao: parcela, valor, vencimento, dias de atraso, data do bloqueio e link de pagamento.
--     admin (Recepção): só que há atraso e a data do bloqueio, sem valor nem link.
--     demais perfis e developer: nulo. Escola já suspensa: nulo (quem aparece é a tela de bloqueio).
-- Reversível: dropar meu_aviso_atraso e restaurar o corpo antigo de meu_estado_bloqueio.

-- 1) fonte única
create or replace function public.zela_cobranca_vencida_da_escola(p_school_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_carencia integer;
  v_cob record;
begin
  select c.carencia_dias into v_carencia from public.zela_config_comercial c where c.id;

  select b.numero, b.tipo, b.valor, b.vencimento, b.invoice_url into v_cob
    from public.zela_cobrancas b
   where b.school_id = p_school_id and b.status = 'vencida'
   order by b.vencimento asc
   limit 1;

  if v_cob.vencimento is null then
    return null;
  end if;

  return jsonb_build_object(
    'numero', v_cob.numero,
    'tipo', v_cob.tipo,
    'valor', v_cob.valor,
    'vencimento', v_cob.vencimento,
    'dias_atraso', greatest(v_hoje - v_cob.vencimento, 0),
    'bloqueio_em', v_cob.vencimento + coalesce(v_carencia, 15),
    'invoice_url', v_cob.invoice_url
  );
end;
$$;
revoke all on function public.zela_cobranca_vencida_da_escola(uuid) from public, anon, authenticated;
grant execute on function public.zela_cobranca_vencida_da_escola(uuid) to service_role;

-- 2) meu_estado_bloqueio sobre a fonte única (mesmo retorno da fase 1)
create or replace function public.meu_estado_bloqueio()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_role text;
  v_school uuid;
begin
  select u.role, u.school_id into v_role, v_school from public.users u where u.id = auth.uid();
  if v_role is null or v_role = 'developer' or v_school is null or public.escola_liberada(v_school) then
    return jsonb_build_object('suspensa', false);
  end if;

  return jsonb_build_object(
    'suspensa', true,
    'role', v_role,
    'cobranca', case when v_role <> 'gestao' then null else public.zela_cobranca_vencida_da_escola(v_school) end
  );
end;
$$;
revoke all on function public.meu_estado_bloqueio() from public, anon;
grant execute on function public.meu_estado_bloqueio() to authenticated, service_role;

-- 3) aviso antes do bloqueio
create or replace function public.meu_aviso_atraso()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_role text;
  v_school uuid;
  v_cob jsonb;
begin
  select u.role, u.school_id into v_role, v_school from public.users u where u.id = auth.uid();
  if v_role not in ('gestao', 'admin') or v_school is null or not public.escola_liberada(v_school) then
    return null;
  end if;

  v_cob := public.zela_cobranca_vencida_da_escola(v_school);
  if v_cob is null then
    return null;
  end if;

  if v_role = 'gestao' then
    return jsonb_build_object('role', v_role, 'cobranca', v_cob);
  end if;
  return jsonb_build_object('role', v_role, 'bloqueio_em', v_cob -> 'bloqueio_em');
end;
$$;
revoke all on function public.meu_aviso_atraso() from public, anon;
grant execute on function public.meu_aviso_atraso() to authenticated, service_role;
