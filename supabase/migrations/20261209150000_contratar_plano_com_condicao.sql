-- Faturamento do Zela Edu (PLANO_FATURAMENTO_ZELA.md, itens 4 e 10.4).
-- contratar_plano_com_condicao: contratação pela condição de pagamento (mensal, anual à vista, 6x, 12x).
--  - O desconto vem só da condição (zela_condicoes_pagamento); zela_plano_ciclos.desconto_percent é ignorado
--    e não há desconto em cascata na mensalidade (ajuste posterior, no Painel de contratos).
--  - Grava o contrato como 'aguardando_pagamento'. Não encerra o contrato anterior e não mexe nos módulos da
--    escola: isso acontece em zela_ativar_contratacao, quando a 1ª parcela for paga.
--  - Calcula e grava as cobranças em zela_cobrancas (sem link do Asaas; a Edge Function preenche).
--    Soma das parcelas = total exato (centavos que sobram vão para a última). Implantação segue o parcelamento.
--  - Exige CNPJ e e-mail da escola. Só developer, security definer, recalculado no servidor.
-- A contratar_plano_escola antiga permanece até o modal "Contratar" ser trocado (etapa B).

create or replace function public.contratar_plano_com_condicao(
  p_school_id uuid,
  p_plano_id uuid,
  p_condicao text,
  p_alunos integer default null,
  p_itens text[] default null,
  p_extras text[] default null,
  p_desconto_tipo text default null,
  p_desconto numeric default 0,
  p_motivo text default null,
  p_inicio date default null,
  p_primeiro_vencimento date default null,
  p_implantacao_valor numeric default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_cfg public.zela_config_comercial%rowtype;
  v_cond public.zela_condicoes_pagamento%rowtype;
  v_plano public.zela_planos%rowtype;
  v_ciclo public.zela_plano_ciclos%rowtype;
  v_school public.schools%rowtype;
  v_ativos integer;
  v_tem_faixas boolean := false;
  v_valor_faixa numeric(12,2);
  v_custo numeric;
  v_custo_ref numeric;
  v_alunos integer;
  v_itens text[];
  v_extras text[] := '{}';
  v_ids text[];
  v_preco_aluno numeric(12,2);
  v_extra_aluno numeric(12,2) := 0;
  v_fixos numeric(12,2);
  v_mensal numeric(12,2);
  v_mensal_ciclo numeric;
  v_total numeric(12,2);
  v_impl_base numeric(12,2);
  v_impl_desc numeric(12,2) := 0;
  v_impl_final numeric(12,2);
  v_desconto numeric := coalesce(p_desconto, 0);
  v_inicio date := coalesce(p_inicio, current_date);
  v_primeiro date;
  v_n integer;
  v_sis_parc numeric(12,2);
  v_impl_parc numeric(12,2);
  v_precos jsonb;
  v_off jsonb;
  v_on jsonb;
  v_id uuid;
  i integer;
begin
  if coalesce(public.get_my_role(), '') <> 'developer' then
    raise exception 'Apenas o suporte (developer) pode contratar plano para uma escola.';
  end if;

  select * into v_cfg from public.zela_config_comercial where id;
  select * into v_school from public.schools where id = p_school_id for update;
  if not found then raise exception 'Escola não encontrada.'; end if;
  if v_school.cnpj is null or btrim(v_school.cnpj) = '' then
    raise exception 'A escola não tem CNPJ cadastrado. Preencha o CNPJ antes de contratar.';
  end if;
  if v_school.email is null or btrim(v_school.email) = '' then
    raise exception 'A escola não tem e-mail cadastrado. Preencha o e-mail antes de contratar.';
  end if;
  if exists (select 1 from public.school_contratacoes where school_id = p_school_id and status = 'aguardando_pagamento') then
    raise exception 'Esta escola já tem uma contratação aguardando pagamento.';
  end if;

  select * into v_cond from public.zela_condicoes_pagamento where chave = p_condicao;
  if not found or not v_cond.ativo then raise exception 'Condição de pagamento inexistente ou desativada.'; end if;
  select * into v_plano from public.zela_planos where id = p_plano_id;
  if not found or not v_plano.ativo then raise exception 'Plano inexistente ou desativado.'; end if;
  select * into v_ciclo from public.zela_plano_ciclos where plano_id = p_plano_id and ciclo = v_cond.ciclo;
  if not found or not v_ciclo.ativo then raise exception 'Período indisponível para este plano.'; end if;

  select count(*)::integer into v_ativos from public.students
   where school_id = p_school_id and enrollment_status = 'ativo';
  v_alunos := coalesce(p_alunos, v_ativos);
  if v_alunos < 1 then raise exception 'Informe a quantidade de alunos contratados (mínimo 1).'; end if;

  if v_plano.modalidade = 'pacote' then
    v_tem_faixas := exists (select 1 from public.zela_pacote_faixas where plano_id = p_plano_id);
  end if;
  if v_tem_faixas then
    select valor_final into v_valor_faixa from public.zela_pacote_faixas
     where plano_id = p_plano_id and faixa = v_alunos;
    if not found then
      raise exception 'Escolha uma faixa de alunos válida para este plano (informado: %).', v_alunos;
    end if;
    if v_alunos < v_ativos then
      raise exception 'A faixa de até % alunos não comporta os % alunos ativos da escola.', v_alunos, v_ativos;
    end if;
  end if;

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
  v_itens := array(select distinct i2 from unnest(v_itens) i2 where i2 <> 'base' order by i2);
  if exists (
    select 1 from unnest(v_itens) i2
    where not exists (select 1 from public.zela_modulo_precos p where p.item_id = i2 and p.ativo)
  ) then
    raise exception 'Há um item inexistente ou desativado na lista de módulos.';
  end if;
  if not exists (select 1 from public.zela_modulo_precos where item_id = 'base' and ativo) then
    raise exception 'O preço do plano base está desativado.';
  end if;
  v_ids := array['base'] || v_itens;

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
  if v_tem_faixas then
    v_custo_ref := v_plano.custo_referencia_faixas;
    v_custo := coalesce(v_plano.custo_por_aluno, v_custo_ref);
    if v_custo_ref > 0 and v_custo > 0 then
      v_valor_faixa := greatest(round((v_valor_faixa * v_custo / v_custo_ref - 9) / 10) * 10 + 9, 9);
    end if;
    v_mensal := round(v_valor_faixa + v_alunos * v_extra_aluno + v_fixos, 2);
  else
    v_mensal := round(greatest(v_alunos * v_preco_aluno, v_plano.minimo_mensal) + v_alunos * v_extra_aluno + v_fixos, 2);
  end if;

  -- Desconto só da condição de pagamento (o desconto do ciclo e o em cascata deixaram de valer).
  v_mensal_ciclo := v_mensal * (1 - v_cond.desconto_percent / 100.0);
  v_total := round(v_mensal_ciclo * v_ciclo.meses, 2);

  -- Implantação: valor dentro da faixa da configuração e desconto até o teto.
  v_impl_base := coalesce(p_implantacao_valor, v_ciclo.implantacao_valor, v_plano.implantacao_valor);
  if p_implantacao_valor is not null
     and (p_implantacao_valor < v_cfg.implantacao_min or p_implantacao_valor > v_cfg.implantacao_max) then
    raise exception 'A implantação deve ficar entre % e %.', v_cfg.implantacao_min, v_cfg.implantacao_max;
  end if;
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

  if v_total + v_impl_final <= 0 then
    raise exception 'O contrato não tem valor a cobrar.';
  end if;

  v_primeiro := coalesce(p_primeiro_vencimento, current_date + v_cfg.vencimento_primeira_dias);
  if v_primeiro < current_date then
    raise exception 'O vencimento da 1ª parcela não pode ser no passado.';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('item_id', item_id, 'tipo_cobranca', tipo_cobranca, 'valor', valor) order by item_id), '[]'::jsonb)
    into v_precos from public.zela_modulo_precos where item_id = any(v_ids);

  -- Módulos que serão liberados na ativação (zela_ativar_contratacao), guardados no snapshot.
  select coalesce(jsonb_object_agg(k, false), '{}'::jsonb) into v_off
    from (select distinct unnest(chaves) k from public.zela_modulo_precos) s;
  select coalesce(jsonb_object_agg(k, true), '{}'::jsonb) into v_on
    from (select distinct unnest(chaves) k from public.zela_modulo_precos where item_id = any(v_ids)) s;

  insert into public.school_contratacoes (
    school_id, plano_id, ciclo, meses, alunos_contratados, itens, snapshot,
    valor_mensal, valor_ciclo, implantacao_base, implantacao_desconto_tipo,
    implantacao_desconto, implantacao_final, desconto_motivo,
    condicao_chave, pagamento, parcelas, desconto_condicao_percent, primeiro_vencimento,
    inicio, fim, status, created_by
  ) values (
    p_school_id, p_plano_id, v_cond.ciclo, v_ciclo.meses, v_alunos, v_itens,
    jsonb_build_object(
      'plano', jsonb_build_object('id', v_plano.id, 'nome', v_plano.nome, 'modalidade', v_plano.modalidade,
                                  'preco_por_aluno', v_preco_aluno, 'minimo_mensal', v_plano.minimo_mensal,
                                  'faixa', case when v_tem_faixas then v_alunos else null end,
                                  'valor_faixa', case when v_tem_faixas then v_valor_faixa else null end),
      'ciclo', jsonb_build_object('ciclo', v_ciclo.ciclo, 'meses', v_ciclo.meses),
      'condicao', jsonb_build_object('chave', v_cond.chave, 'pagamento', v_cond.pagamento, 'parcelas', v_cond.parcelas,
                                     'intervalo_meses', v_cond.intervalo_meses, 'desconto_percent', v_cond.desconto_percent),
      'extras', to_jsonb(v_extras),
      'precos', v_precos,
      'features_on', v_on,
      'features_off', v_off,
      'liveness', ('liveness' = any(v_ids))
    ),
    v_mensal, v_total, v_impl_base,
    case when v_desconto > 0 then p_desconto_tipo else null end,
    v_impl_desc, v_impl_final,
    case when v_desconto > 0 then btrim(p_motivo) else null end,
    v_cond.chave, v_cond.pagamento, v_cond.parcelas, v_cond.desconto_percent, v_primeiro,
    v_inicio, (v_inicio + make_interval(months => v_ciclo.meses))::date, 'aguardando_pagamento', auth.uid()
  ) returning id into v_id;

  -- Cobranças: total dividido pelo nº de parcelas, centavos que sobram na última. Implantação idem.
  -- Mensal gera só a 1ª (as seguintes vêm da função agendada). Vencimento sempre contado a partir da 1ª,
  -- então dia 29, 30 ou 31 cai no último dia do mês curto sem derivar nos meses seguintes.
  v_n := v_cond.parcelas;
  v_sis_parc := round(v_total / v_n, 2);
  v_impl_parc := round(v_impl_final / v_n, 2);
  for i in 1..v_n loop
    insert into public.zela_cobrancas (
      school_id, contratacao_id, tipo, numero, competencia, vencimento, valor_sistema, valor_implantacao
    ) values (
      p_school_id, v_id, 'parcela', i,
      date_trunc('month', v_inicio + make_interval(months => (i - 1) * v_cond.intervalo_meses))::date,
      (v_primeiro + make_interval(months => (i - 1) * v_cond.intervalo_meses))::date,
      case when i = v_n then v_total - v_sis_parc * (v_n - 1) else v_sis_parc end,
      case when i = v_n then v_impl_final - v_impl_parc * (v_n - 1) else v_impl_parc end
    );
  end loop;

  return v_id;
end;
$function$;

revoke execute on function public.contratar_plano_com_condicao(uuid, uuid, text, integer, text[], text[], text, numeric, text, date, date, numeric) from public, anon;
grant execute on function public.contratar_plano_com_condicao(uuid, uuid, text, integer, text[], text[], text, numeric, text, date, date, numeric) to authenticated;
