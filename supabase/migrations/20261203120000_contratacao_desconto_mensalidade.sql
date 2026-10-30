-- Contratação: desconto na mensalidade (recorrente ou por período) e novos tetos.
-- 1) Colunas novas em school_contratacoes, todas opcionais ou com default (nada destrutivo;
--    contratações existentes ficam sem desconto).
-- 2) zela_config_comercial: teto do desconto na mensalidade (10 por cento) e da implantação (100 por cento).
-- 3) contratar_plano_escola ganha os parâmetros p_mensal_*. Continua security definer, só developer,
--    recalculado no servidor. O desconto é aplicado em cascata sobre a mensalidade já com o desconto
--    do ciclo. Recorrente vale todos os meses do ciclo; por período vale de 1 até os meses do ciclo.
--    valor_mensal segue sendo o preço cheio; valor_ciclo é o total real do ciclo.
-- 4) meu_plano_escola mostra o desconto à Gestão da escola (sem o motivo).

alter table public.school_contratacoes
  add column if not exists mensal_desconto_tipo text check (mensal_desconto_tipo in ('percent', 'valor')),
  add column if not exists mensal_desconto_entrada numeric(12,2) not null default 0 check (mensal_desconto_entrada >= 0),
  add column if not exists mensal_desconto numeric(12,2) not null default 0 check (mensal_desconto >= 0),
  add column if not exists mensal_desconto_recorrente boolean not null default true,
  add column if not exists mensal_desconto_meses integer,
  add column if not exists valor_mensal_com_desconto numeric(12,2) check (valor_mensal_com_desconto is null or valor_mensal_com_desconto >= 0),
  add column if not exists mensal_desconto_motivo text check (mensal_desconto_motivo is null or length(mensal_desconto_motivo) <= 300);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'school_contratacoes_mensal_desconto_meses_chk') then
    alter table public.school_contratacoes
      add constraint school_contratacoes_mensal_desconto_meses_chk
      check (mensal_desconto_meses is null or (mensal_desconto_meses >= 1 and mensal_desconto_meses <= meses));
  end if;
end $$;

alter table public.zela_config_comercial
  add column if not exists desconto_mensalidade_max_percent numeric(5,2) not null default 10
    check (desconto_mensalidade_max_percent between 0 and 100);
update public.zela_config_comercial set desconto_mensalidade_max_percent = 10, desconto_implantacao_max_percent = 100 where id;

drop function if exists public.contratar_plano_escola(uuid, uuid, text, integer, text[], text, numeric, text, date, text[]);

create or replace function public.contratar_plano_escola(
  p_school_id uuid,
  p_plano_id uuid,
  p_ciclo text,
  p_alunos integer default null,
  p_itens text[] default null,
  p_desconto_tipo text default null,
  p_desconto numeric default 0,
  p_motivo text default null,
  p_inicio date default null,
  p_extras text[] default null,
  p_mensal_desconto_tipo text default null,
  p_mensal_desconto numeric default 0,
  p_mensal_recorrente boolean default true,
  p_mensal_desconto_meses integer default null,
  p_mensal_motivo text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_cfg public.zela_config_comercial%rowtype;
  v_plano public.zela_planos%rowtype;
  v_ciclo public.zela_plano_ciclos%rowtype;
  v_school public.schools%rowtype;
  v_ativos integer;
  v_alunos integer;
  v_itens text[];
  v_extras text[] := '{}';
  v_ids text[];
  v_preco_aluno numeric(12,2);
  v_extra_aluno numeric(12,2) := 0;
  v_fixos numeric(12,2);
  v_mensal numeric(12,2);
  v_mensal_ciclo numeric;
  v_md numeric := coalesce(p_mensal_desconto, 0);
  v_md_valor numeric(12,2) := 0;
  v_md_meses integer;
  v_md_com numeric(12,2);
  v_ciclo_valor numeric(12,2);
  v_impl_base numeric(12,2);
  v_impl_desc numeric(12,2) := 0;
  v_impl_final numeric(12,2);
  v_desconto numeric := coalesce(p_desconto, 0);
  v_inicio date := coalesce(p_inicio, current_date);
  v_precos jsonb;
  v_off jsonb;
  v_on jsonb;
  v_features jsonb;
  v_id uuid;
begin
  if coalesce(public.get_my_role(), '') <> 'developer' then
    raise exception 'Apenas o suporte (developer) pode contratar plano para uma escola.';
  end if;

  select * into v_cfg from public.zela_config_comercial where id;
  select * into v_school from public.schools where id = p_school_id for update;
  if not found then raise exception 'Escola não encontrada.'; end if;
  select * into v_plano from public.zela_planos where id = p_plano_id;
  if not found or not v_plano.ativo then raise exception 'Plano inexistente ou desativado.'; end if;
  select * into v_ciclo from public.zela_plano_ciclos where plano_id = p_plano_id and ciclo = p_ciclo;
  if not found or not v_ciclo.ativo then raise exception 'Ciclo indisponível para este plano.'; end if;

  select count(*)::integer into v_ativos from public.students
   where school_id = p_school_id and enrollment_status = 'ativo';
  v_alunos := coalesce(p_alunos, v_ativos);
  if v_alunos < 1 then raise exception 'Informe a quantidade de alunos contratados (mínimo 1).'; end if;

  -- R1: por aluno só até o limite, medido pelos alunos contratados e pelos ativos.
  if v_plano.modalidade = 'por_aluno'
     and (v_alunos > v_cfg.limite_alunos_por_aluno or v_ativos > v_cfg.limite_alunos_por_aluno) then
    raise exception 'A modalidade por aluno vale até % alunos. Contrate um pacote.', v_cfg.limite_alunos_por_aluno;
  end if;
  if v_plano.alunos_min is not null and v_alunos < v_plano.alunos_min then
    raise exception 'Este plano exige no mínimo % alunos.', v_plano.alunos_min;
  end if;
  if v_plano.alunos_max is not null and v_alunos > v_plano.alunos_max then
    raise exception 'Este plano aceita no máximo % alunos.', v_plano.alunos_max;
  end if;

  -- Itens: pacote usa os do plano mais os extras avulsos; por aluno usa os escolhidos.
  if v_plano.modalidade = 'pacote' then
    v_itens := coalesce(v_plano.itens, '{}');
    v_extras := array(
      select distinct e from unnest(coalesce(p_extras, '{}')) e
       where e <> 'base' and not (e = any(coalesce(v_plano.itens, '{}')))
       order by e
    );
    if exists (
      select 1 from unnest(v_extras) e
      where not exists (
        select 1 from public.zela_modulo_precos p
         where p.item_id = e and p.ativo and p.valor > 0
      )
    ) then
      raise exception 'Há um adicional avulso inexistente, desativado ou sem preço definido.';
    end if;
    v_itens := v_itens || v_extras;
  else
    if coalesce(array_length(p_extras, 1), 0) > 0 then
      raise exception 'Adicionais avulsos valem só para plano pacote.';
    end if;
    v_itens := coalesce(p_itens, '{}');
  end if;
  v_itens := array(select distinct i from unnest(v_itens) i where i <> 'base' order by i);
  if exists (
    select 1 from unnest(v_itens) i
    where not exists (select 1 from public.zela_modulo_precos p where p.item_id = i and p.ativo)
  ) then
    raise exception 'Há um item inexistente ou desativado na lista de módulos.';
  end if;
  if not exists (select 1 from public.zela_modulo_precos where item_id = 'base' and ativo) then
    raise exception 'O preço do plano base está desativado.';
  end if;
  v_ids := array['base'] || v_itens;

  -- R2, R3: mensalidade (extras de pacote ficam fora do mínimo).
  select coalesce(sum(valor) filter (where tipo_cobranca = 'fixo_mensal'), 0)
    into v_fixos from public.zela_modulo_precos where item_id = any(v_ids);
  if v_plano.modalidade = 'pacote' then
    v_preco_aluno := v_plano.preco_por_aluno;
    select coalesce(sum(valor) filter (where tipo_cobranca = 'por_aluno'), 0)
      into v_extra_aluno from public.zela_modulo_precos where item_id = any(v_extras);
  else
    select coalesce(sum(valor) filter (where tipo_cobranca = 'por_aluno'), 0)
      into v_preco_aluno from public.zela_modulo_precos where item_id = any(v_ids);
  end if;
  v_mensal := round(greatest(v_alunos * v_preco_aluno, v_plano.minimo_mensal) + v_alunos * v_extra_aluno + v_fixos, 2);

  -- R4: desconto do ciclo e, em cascata, desconto na mensalidade (recorrente ou por período).
  v_mensal_ciclo := v_mensal * (1 - v_ciclo.desconto_percent / 100.0);
  v_md_meses := null;
  if v_md < 0 then raise exception 'Desconto na mensalidade inválido.'; end if;
  if v_md > 0 then
    if p_mensal_desconto_tipo not in ('percent', 'valor') then
      raise exception 'Informe se o desconto na mensalidade é em porcentagem ou em reais.';
    end if;
    if p_mensal_motivo is null or length(btrim(p_mensal_motivo)) < 3 then
      raise exception 'Informe o motivo do desconto na mensalidade.';
    end if;
    if v_mensal_ciclo <= 0 then raise exception 'Não há mensalidade para aplicar desconto.'; end if;
    if p_mensal_desconto_tipo = 'percent' then
      if v_md > v_cfg.desconto_mensalidade_max_percent then
        raise exception 'O desconto máximo na mensalidade é de % por cento.', v_cfg.desconto_mensalidade_max_percent;
      end if;
      v_md_valor := round(v_mensal_ciclo * v_md / 100.0, 2);
    else
      if v_md * 100.0 / v_mensal_ciclo > v_cfg.desconto_mensalidade_max_percent then
        raise exception 'O desconto máximo na mensalidade é de % por cento.', v_cfg.desconto_mensalidade_max_percent;
      end if;
      v_md_valor := round(v_md, 2);
    end if;
    v_md_valor := least(v_md_valor, round(v_mensal_ciclo, 2));
    if coalesce(p_mensal_recorrente, true) then
      v_md_meses := v_ciclo.meses;
    else
      if p_mensal_desconto_meses is null or p_mensal_desconto_meses < 1 or p_mensal_desconto_meses > v_ciclo.meses then
        raise exception 'O período do desconto deve ser de 1 a % mês(es), dentro do ciclo.', v_ciclo.meses;
      end if;
      v_md_meses := p_mensal_desconto_meses;
    end if;
    v_md_com := round(v_mensal_ciclo - v_md_valor, 2);
  end if;
  v_ciclo_valor := round(greatest(v_mensal_ciclo * v_ciclo.meses - v_md_valor * coalesce(v_md_meses, 0), 0), 2);

  -- R5, R6: implantação e desconto.
  v_impl_base := coalesce(v_ciclo.implantacao_valor, v_plano.implantacao_valor);
  if v_desconto < 0 then raise exception 'Desconto inválido.'; end if;
  if v_desconto > 0 then
    if p_desconto_tipo not in ('percent', 'valor') then raise exception 'Informe se o desconto é em porcentagem ou em reais.'; end if;
    if p_motivo is null or length(btrim(p_motivo)) < 3 then raise exception 'Informe o motivo do desconto na implantação.'; end if;
    if p_desconto_tipo = 'percent' then
      if v_desconto > v_cfg.desconto_implantacao_max_percent then
        raise exception 'O desconto máximo na implantação é de % por cento.', v_cfg.desconto_implantacao_max_percent;
      end if;
      v_impl_desc := round(v_impl_base * v_desconto / 100.0, 2);
    else
      if v_impl_base > 0 and v_desconto * 100.0 / v_impl_base > v_cfg.desconto_implantacao_max_percent then
        raise exception 'O desconto máximo na implantação é de % por cento.', v_cfg.desconto_implantacao_max_percent;
      end if;
      v_impl_desc := round(v_desconto, 2);
    end if;
  end if;
  v_impl_desc := least(v_impl_desc, v_impl_base);
  v_impl_final := greatest(v_impl_base - v_impl_desc, 0);

  -- R8: snapshot (sem custo estimado).
  select coalesce(jsonb_agg(jsonb_build_object('item_id', item_id, 'tipo_cobranca', tipo_cobranca, 'valor', valor) order by item_id), '[]'::jsonb)
    into v_precos from public.zela_modulo_precos where item_id = any(v_ids);

  -- R9: módulos seguem o plano. O histórico é gravado pela trigger de schools.
  select coalesce(jsonb_object_agg(k, false), '{}'::jsonb) into v_off
    from (select distinct unnest(chaves) k from public.zela_modulo_precos) s;
  select coalesce(jsonb_object_agg(k, true), '{}'::jsonb) into v_on
    from (select distinct unnest(chaves) k from public.zela_modulo_precos where item_id = any(v_ids)) s;
  v_features := coalesce(v_school.features_enabled, '{}'::jsonb) || v_off || v_on;
  -- O bloqueio da prova de vida (técnico) depende da prova de vida.
  if not ('liveness' = any(v_ids)) then
    v_features := v_features || '{"liveness_detection_enforce": false}'::jsonb;
  end if;

  update public.school_contratacoes
     set status = 'encerrada', encerrada_em = now()
   where school_id = p_school_id and status = 'ativa';

  insert into public.school_contratacoes (
    school_id, plano_id, ciclo, meses, alunos_contratados, itens, snapshot,
    valor_mensal, valor_ciclo, implantacao_base, implantacao_desconto_tipo,
    implantacao_desconto, implantacao_final, desconto_motivo,
    mensal_desconto_tipo, mensal_desconto_entrada, mensal_desconto, mensal_desconto_recorrente,
    mensal_desconto_meses, valor_mensal_com_desconto, mensal_desconto_motivo,
    inicio, fim, status, created_by
  ) values (
    p_school_id, p_plano_id, p_ciclo, v_ciclo.meses, v_alunos, v_itens,
    jsonb_build_object(
      'plano', jsonb_build_object('id', v_plano.id, 'nome', v_plano.nome, 'modalidade', v_plano.modalidade,
                                  'preco_por_aluno', v_preco_aluno, 'minimo_mensal', v_plano.minimo_mensal),
      'ciclo', jsonb_build_object('ciclo', v_ciclo.ciclo, 'meses', v_ciclo.meses, 'desconto_percent', v_ciclo.desconto_percent),
      'extras', to_jsonb(v_extras),
      'desconto_mensal', case when v_md > 0 then jsonb_build_object(
        'tipo', p_mensal_desconto_tipo, 'entrada', v_md, 'valor_mensal', v_md_valor,
        'recorrente', coalesce(p_mensal_recorrente, true), 'meses', v_md_meses) else null end,
      'precos', v_precos
    ),
    v_mensal, v_ciclo_valor, v_impl_base,
    case when v_desconto > 0 then p_desconto_tipo else null end,
    v_impl_desc, v_impl_final,
    case when v_desconto > 0 then btrim(p_motivo) else null end,
    case when v_md > 0 then p_mensal_desconto_tipo else null end,
    case when v_md > 0 then round(v_md, 2) else 0 end,
    v_md_valor,
    case when v_md > 0 then coalesce(p_mensal_recorrente, true) else true end,
    case when v_md > 0 and not coalesce(p_mensal_recorrente, true) then v_md_meses else null end,
    v_md_com,
    case when v_md > 0 then btrim(p_mensal_motivo) else null end,
    v_inicio, (v_inicio + make_interval(months => v_ciclo.meses))::date, 'ativa', auth.uid()
  ) returning id into v_id;

  update public.schools set features_enabled = v_features where id = p_school_id;

  return v_id;
end;
$function$;

revoke execute on function public.contratar_plano_escola(uuid, uuid, text, integer, text[], text, numeric, text, date, text[], text, numeric, boolean, integer, text) from public, anon;
grant execute on function public.contratar_plano_escola(uuid, uuid, text, integer, text[], text, numeric, text, date, text[], text, numeric, boolean, integer, text) to authenticated;

-- "Meu plano": a Gestão vê o desconto na mensalidade, sem o motivo.
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
  select * into v_row from public.school_contratacoes
   where school_id = public.get_my_school_id() and status = 'ativa';
  if not found then return null; end if;
  select nome, modalidade into v_nome, v_modalidade from public.zela_planos where id = v_row.plano_id;
  return jsonb_build_object(
    'plano', v_nome,
    'modalidade', v_modalidade,
    'ciclo', v_row.ciclo,
    'meses', v_row.meses,
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
