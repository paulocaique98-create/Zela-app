-- Faturamento do Zela Edu (PLANO_FATURAMENTO_ZELA.md, itens 3 e 4, parte de dados).
-- 1) school_contratacoes ganha os estados aguardando_pagamento e suspensa e as colunas da condição de
--    pagamento. Contratos existentes não mudam: continuam 'ativa' (a Montessori e as demais seguem
--    liberadas, sem cobrança gerada).
-- 2) Índices únicos: no máximo 1 contrato vigente (ativa ou suspensa) e 1 aguardando_pagamento por escola.
--    O novo índice é criado antes de o antigo sair, então não há janela sem proteção.
-- 3) meu_plano_escola passa a devolver também o status e enxerga suspensa e aguardando_pagamento.
-- 4) zela_ativar_contratacao: só service_role (webhook e Edge Functions). Encerra o contrato anterior
--    só agora que o novo foi pago, libera os módulos do snapshot e reativa a escola.
-- O bloqueio por inadimplência usa o que já existe: schools.is_active = false derruba o acesso
-- (get_my_school_id, migration 20261012130000). Nenhuma policy foi alterada aqui.

alter table public.school_contratacoes drop constraint if exists school_contratacoes_status_check;
alter table public.school_contratacoes
  add constraint school_contratacoes_status_check
  check (status in ('rascunho', 'aguardando_pagamento', 'ativa', 'suspensa', 'encerrada', 'cancelada'));

alter table public.school_contratacoes
  add column if not exists condicao_chave text references public.zela_condicoes_pagamento(chave),
  add column if not exists pagamento text check (pagamento in ('mes_a_mes', 'a_vista', 'parcelado')),
  add column if not exists parcelas integer check (parcelas is null or parcelas between 1 and 12),
  add column if not exists desconto_condicao_percent numeric(5,2) not null default 0 check (desconto_condicao_percent between 0 and 50),
  add column if not exists primeiro_vencimento date;

create unique index if not exists school_contratacoes_vigente_uidx
  on public.school_contratacoes (school_id) where status in ('ativa', 'suspensa');
create unique index if not exists school_contratacoes_pendente_uidx
  on public.school_contratacoes (school_id) where status = 'aguardando_pagamento';
drop index if exists public.school_contratacoes_ativa_uidx;

create or replace function public.meu_plano_escola()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_row public.school_contratacoes%rowtype;
  v_nome text;
  v_modalidade text;
begin
  if coalesce(public.get_my_role(), '') <> 'gestao' or public.get_my_school_id() is null then
    return null;
  end if;
  -- O contrato vigente tem prioridade; sem ele, mostra o que aguarda pagamento.
  select * into v_row from public.school_contratacoes
   where school_id = public.get_my_school_id()
     and status in ('ativa', 'suspensa', 'aguardando_pagamento')
   order by (status = 'aguardando_pagamento'), created_at desc
   limit 1;
  if not found then return null; end if;
  select nome, modalidade into v_nome, v_modalidade from public.zela_planos where id = v_row.plano_id;
  return jsonb_build_object(
    'status', v_row.status,
    'plano', v_nome,
    'modalidade', v_modalidade,
    'ciclo', v_row.ciclo,
    'meses', v_row.meses,
    'pagamento', v_row.pagamento,
    'parcelas', v_row.parcelas,
    'alunos_contratados', v_row.alunos_contratados,
    'itens', v_row.itens,
    'valor_mensal', v_row.valor_mensal,
    'valor_ciclo', v_row.valor_ciclo,
    'implantacao_final', v_row.implantacao_final,
    'desconto_mensal', v_row.mensal_desconto,
    'desconto_recorrente', v_row.mensal_desconto_recorrente,
    'desconto_meses', v_row.mensal_desconto_meses,
    'valor_mensal_com_desconto', v_row.valor_mensal_com_desconto,
    'inicio', v_row.inicio,
    'fim', v_row.fim
  );
end;
$function$;
revoke execute on function public.meu_plano_escola() from public, anon;
grant execute on function public.meu_plano_escola() to authenticated;

-- Ativa o contrato pago. Idempotente: contrato já ativa é devolvido sem alteração.
create or replace function public.zela_ativar_contratacao(p_contratacao_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_ct public.school_contratacoes%rowtype;
  v_school public.schools%rowtype;
  v_features jsonb;
begin
  select * into v_ct from public.school_contratacoes where id = p_contratacao_id for update;
  if not found then raise exception 'Contratação não encontrada.'; end if;
  if v_ct.status = 'ativa' then return; end if;
  if v_ct.status not in ('aguardando_pagamento', 'suspensa') then
    raise exception 'Contratação com status % não pode ser ativada.', v_ct.status;
  end if;

  select * into v_school from public.schools where id = v_ct.school_id for update;

  -- O contrato anterior só sai agora que o novo foi pago.
  update public.school_contratacoes
     set status = 'encerrada', encerrada_em = now()
   where school_id = v_ct.school_id and id <> v_ct.id and status in ('ativa', 'suspensa');

  update public.school_contratacoes set status = 'ativa', encerrada_em = null where id = v_ct.id;

  -- Módulos do snapshot (gravado na contratação). Contrato antigo, sem snapshot de módulos, não mexe.
  if v_ct.snapshot ? 'features_on' then
    v_features := coalesce(v_school.features_enabled, '{}'::jsonb)
                  || coalesce(v_ct.snapshot -> 'features_off', '{}'::jsonb)
                  || coalesce(v_ct.snapshot -> 'features_on', '{}'::jsonb);
    if not coalesce((v_ct.snapshot ->> 'liveness')::boolean, false) then
      v_features := v_features || '{"liveness_detection_enforce": false}'::jsonb;
    end if;
    update public.schools set features_enabled = v_features, is_active = true where id = v_ct.school_id;
  else
    update public.schools set is_active = true where id = v_ct.school_id;
  end if;
end;
$function$;
revoke execute on function public.zela_ativar_contratacao(uuid) from public, anon, authenticated;
grant execute on function public.zela_ativar_contratacao(uuid) to service_role;
