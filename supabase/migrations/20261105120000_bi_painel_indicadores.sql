-- Painel de indicadores (BI), Fase 1.2: RPCs de agregação no servidor.
-- Plano: PLANO_EXPANSAO_GESTAO.md seção 3.7. Só leitura: nenhuma tabela é alterada.
--
-- Segurança:
--  * security INVOKER: a RLS de cada tabela continua valendo para quem chama.
--  * toda função filtra também por school_id = get_my_school_id().
--  * só 'gestao' e 'gestao_pedagogica' entram (Recepção, Professor e Família recebem exceção).
--  * bi_financeiro e os indicadores financeiros do bi_detalhe: só 'gestao'.
--  * bi_visao_geral devolve valores em R$ nulos para 'gestao_pedagogica'.
--  * período máximo de 24 meses; bi_detalhe devolve no máximo 500 linhas.
--  * execute só para authenticated (revogado de public e anon).
--
-- Regras de cálculo (mostradas no rodapé de cada gráfico):
--  * Cobranças do período = vencimento dentro do período, sem CANCELLED, REFUNDED e FAILED.
--  * Previsto = soma dessas cobranças. Recebido = as com status PAID.
--  * Em atraso = status OVERDUE, ou PENDING/AWAITING_PAYMENT com vencimento antes de hoje (fuso de São Paulo).
--  * Inadimplência % = em atraso / previsto. Taxa de recebimento % = recebido / previsto.
--  * Despesas pagas = expenses com status 'pago' e paid_on no período (não filtram por turma).
--  * Frequência % = (presente + atrasado) / (registros sem os justificados), em class_attendance.
--  * Alunos ativos = students.enrollment_status = 'ativo' (retrato de hoje).
-- Fora desta migration (colunas não existem ou ficam para as fases 1.4 e 1.5): matrículas novas
-- (students não tem created_at; sai de enrollments), ocupação por vagas,
-- forma de identificação, tempo de confirmação, matrículas, acadêmico e operação.

-- ═══ 1. Índices ═══════════════════════════════════════════════════════════
create index if not exists idx_financial_charges_school_due on public.financial_charges (school_id, due_date);
create index if not exists idx_financial_charges_school_status on public.financial_charges (school_id, status);
create index if not exists idx_class_attendance_school_date on public.class_attendance (school_id, date);

-- ═══ 2. Porteiro comum (perfil, escola e período) ═════════════════════════
create or replace function public.bi_contexto(p_inicio date, p_fim date, p_exige_gestao boolean)
returns uuid
language plpgsql
stable
security invoker
set search_path = public
as $function$
declare
  v_role text := public.get_my_role();
  v_school uuid := public.get_my_school_id();
begin
  if v_school is null or v_role is null or v_role not in ('gestao', 'gestao_pedagogica') then
    raise exception 'bi_acesso_negado' using errcode = '42501';
  end if;
  if p_exige_gestao and v_role <> 'gestao' then
    raise exception 'bi_financeiro_negado' using errcode = '42501';
  end if;
  if p_inicio is null or p_fim is null or p_fim < p_inicio then
    raise exception 'bi_periodo_invalido' using errcode = '22023';
  end if;
  if p_fim > (p_inicio + interval '24 months')::date then
    raise exception 'bi_periodo_maximo_24_meses' using errcode = '22023';
  end if;
  return v_school;
end;
$function$;

-- ═══ 3. Visão geral ═══════════════════════════════════════════════════════
create or replace function public.bi_visao_geral(p_inicio date, p_fim date, p_turmas text[] default null)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $function$
declare
  v_school uuid := public.bi_contexto(p_inicio, p_fim, false);
  v_ve_valor boolean := (public.get_my_role() = 'gestao');
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_result jsonb;
begin
  with
  alunos as (
    select s.id, s.turma, s.enrollment_status
    from public.students s
    where s.school_id = v_school
      and (p_turmas is null or cardinality(p_turmas) = 0 or s.turma = any (p_turmas))
  ),
  cobr as (
    select fc.due_date, fc.amount_cents, fc.status
    from public.financial_charges fc
    join alunos a on a.id = fc.student_id
    where v_ve_valor
      and fc.school_id = v_school
      and fc.due_date between p_inicio and p_fim
      and fc.status not in ('CANCELLED', 'REFUNDED', 'FAILED')
  ),
  freq as (
    select a.turma, ca.status
    from public.class_attendance ca
    join alunos a on a.id = ca.student_id
    where ca.school_id = v_school
      and ca.date between p_inicio and p_fim
  ),
  meses as (
    select generate_series(date_trunc('month', p_inicio)::date, date_trunc('month', p_fim)::date, interval '1 month')::date as mes
  ),
  serie as (
    select m.mes,
      case when v_ve_valor then coalesce(sum(c.amount_cents), 0) end as previsto_cents,
      case when v_ve_valor then coalesce(sum(c.amount_cents) filter (where c.status = 'PAID'), 0) end as recebido_cents
    from meses m
    left join cobr c on date_trunc('month', c.due_date)::date = m.mes
    group by m.mes
  ),
  por_turma as (
    select coalesce(f.turma, 'Sem turma') as turma,
      round(100.0 * count(*) filter (where f.status in ('presente', 'atrasado'))
        / nullif(count(*) filter (where f.status <> 'justificado'), 0), 1) as frequencia_pct
    from freq f
    group by coalesce(f.turma, 'Sem turma')
  )
  select jsonb_build_object(
    'periodo', jsonb_build_object('inicio', p_inicio, 'fim', p_fim),
    'valores_visiveis', v_ve_valor,
    'kpis', jsonb_build_object(
      'alunos_ativos', (select count(*) from alunos where enrollment_status = 'ativo'),
      'frequencia_media_pct', (select round(100.0 * count(*) filter (where status in ('presente', 'atrasado'))
        / nullif(count(*) filter (where status <> 'justificado'), 0), 1) from freq),
      'previsto_cents', case when v_ve_valor then (select coalesce(sum(amount_cents), 0) from cobr) end,
      'recebido_cents', case when v_ve_valor then (select coalesce(sum(amount_cents) filter (where status = 'PAID'), 0) from cobr) end,
      'atraso_cents', case when v_ve_valor then (select coalesce(sum(amount_cents) filter (
        where status = 'OVERDUE' or (status in ('PENDING', 'AWAITING_PAYMENT') and due_date < v_hoje)), 0) from cobr) end
    ),
    'serie_mensal', (select coalesce(jsonb_agg(to_jsonb(s) order by s.mes), '[]'::jsonb) from serie s),
    'frequencia_por_turma', (select coalesce(jsonb_agg(to_jsonb(t) order by t.frequencia_pct desc nulls last, t.turma), '[]'::jsonb) from por_turma t)
  ) into v_result;

  return v_result;
end;
$function$;

-- ═══ 4. Financeiro (só Gestão) ════════════════════════════════════════════
create or replace function public.bi_financeiro(p_inicio date, p_fim date, p_turmas text[] default null)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $function$
declare
  v_school uuid := public.bi_contexto(p_inicio, p_fim, true);
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_result jsonb;
begin
  with
  alunos as (
    select s.id, s.name, s.turma
    from public.students s
    where s.school_id = v_school
      and (p_turmas is null or cardinality(p_turmas) = 0 or s.turma = any (p_turmas))
  ),
  cobr as (
    select fc.student_id, fc.due_date, fc.amount_cents, fc.status,
      coalesce(fc.payment_method, 'other') as forma,
      (fc.status = 'OVERDUE' or (fc.status in ('PENDING', 'AWAITING_PAYMENT') and fc.due_date < v_hoje)) as em_atraso
    from public.financial_charges fc
    join alunos a on a.id = fc.student_id
    where fc.school_id = v_school
      and fc.due_date between p_inicio and p_fim
      and fc.status not in ('CANCELLED', 'REFUNDED', 'FAILED')
  ),
  desp as (
    select e.category, e.amount_cents, e.paid_on
    from public.expenses e
    where e.school_id = v_school
      and e.status = 'pago'
      and e.paid_on between p_inicio and p_fim
  ),
  meses as (
    select generate_series(date_trunc('month', p_inicio)::date, date_trunc('month', p_fim)::date, interval '1 month')::date as mes
  ),
  mensal as (
    select m.mes,
      coalesce(c.previsto, 0) as previsto_cents,
      coalesce(c.recebido, 0) as recebido_cents,
      coalesce(c.atraso, 0) as atraso_cents,
      case when coalesce(c.previsto, 0) > 0 then round(100.0 * coalesce(c.atraso, 0) / c.previsto, 1) end as inadimplencia_pct,
      coalesce(d.despesas, 0) as despesas_cents,
      coalesce(c.recebido, 0) - coalesce(d.despesas, 0) as resultado_cents
    from meses m
    left join (
      select date_trunc('month', due_date)::date as mes,
        sum(amount_cents) as previsto,
        sum(amount_cents) filter (where status = 'PAID') as recebido,
        sum(amount_cents) filter (where em_atraso) as atraso
      from cobr group by 1
    ) c on c.mes = m.mes
    left join (
      select date_trunc('month', paid_on)::date as mes, sum(amount_cents) as despesas
      from desp group by 1
    ) d on d.mes = m.mes
  ),
  faixas(ordem, rotulo, de, ate) as (
    values (1, '1 a 15', 0, 15), (2, '16 a 30', 16, 30), (3, '31 a 60', 31, 60), (4, '61 a 90', 61, 90), (5, 'mais de 90', 91, 100000)
  ),
  envelhecimento as (
    select f.ordem, f.rotulo,
      coalesce(sum(c.amount_cents), 0) as valor_cents,
      count(c.student_id) as quantidade
    from faixas f
    left join cobr c on c.em_atraso and (v_hoje - c.due_date) between f.de and f.ate
    group by f.ordem, f.rotulo
  ),
  formas as (
    select forma, sum(amount_cents) as valor_cents, count(*) as quantidade
    from cobr where status = 'PAID' group by forma
  ),
  cat_rank as (
    select category, sum(amount_cents) as valor, row_number() over (order by sum(amount_cents) desc, category) as rn
    from desp group by category
  ),
  categorias as (
    select case when rn <= 8 then category else 'Outras' end as categoria, sum(valor) as valor_cents,
      min(case when rn <= 8 then rn else 9 end) as ordem
    from cat_rank group by 1
  ),
  top_atrasos as (
    select a.id as aluno_id, a.name as aluno, a.turma,
      sum(c.amount_cents) as valor_cents, count(*) as quantidade, max(v_hoje - c.due_date) as dias_max
    from cobr c join alunos a on a.id = c.student_id
    where c.em_atraso
    group by a.id, a.name, a.turma
    order by sum(c.amount_cents) desc, a.name
    limit 10
  )
  select jsonb_build_object(
    'periodo', jsonb_build_object('inicio', p_inicio, 'fim', p_fim),
    'kpis', jsonb_build_object(
      'previsto_cents', (select coalesce(sum(amount_cents), 0) from cobr),
      'recebido_cents', (select coalesce(sum(amount_cents) filter (where status = 'PAID'), 0) from cobr),
      'taxa_recebimento_pct', (select round(100.0 * sum(amount_cents) filter (where status = 'PAID') / nullif(sum(amount_cents), 0), 1) from cobr),
      'atraso_cents', (select coalesce(sum(amount_cents) filter (where em_atraso), 0) from cobr),
      'atraso_qtd', (select count(*) filter (where em_atraso) from cobr),
      'ticket_medio_cents', (select round(avg(amount_cents) filter (where status = 'PAID'))::bigint from cobr),
      'despesas_pagas_cents', (select coalesce(sum(amount_cents), 0) from desp),
      'resultado_cents', (select coalesce(sum(amount_cents) filter (where status = 'PAID'), 0) from cobr) - (select coalesce(sum(amount_cents), 0) from desp)
    ),
    'mensal', (select coalesce(jsonb_agg(to_jsonb(m) order by m.mes), '[]'::jsonb) from mensal m),
    'envelhecimento', (select coalesce(jsonb_agg(jsonb_build_object('faixa', e.rotulo, 'valor_cents', e.valor_cents, 'quantidade', e.quantidade) order by e.ordem), '[]'::jsonb) from envelhecimento e),
    'formas_pagamento', (select coalesce(jsonb_agg(to_jsonb(f) order by f.valor_cents desc, f.forma), '[]'::jsonb) from formas f),
    'despesas_categorias', (select coalesce(jsonb_agg(jsonb_build_object('categoria', c.categoria, 'valor_cents', c.valor_cents) order by c.ordem), '[]'::jsonb) from categorias c),
    'maiores_atrasos', (select coalesce(jsonb_agg(to_jsonb(t) order by t.valor_cents desc, t.aluno), '[]'::jsonb) from top_atrasos t)
  ) into v_result;

  return v_result;
end;
$function$;

-- ═══ 5. Drill down ════════════════════════════════════════════════════════
-- Indicadores desta fase: financeiro_previsto, financeiro_recebido, financeiro_atraso (só Gestão)
-- e alunos_ativos. p_filtros aceita {"turmas": ["Nido", ...]}.
create or replace function public.bi_detalhe(
  p_indicador text, p_inicio date, p_fim date, p_filtros jsonb default '{}'::jsonb, p_limite int default 200
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $function$
declare
  v_financeiro boolean := coalesce(p_indicador, '') in ('financeiro_previsto', 'financeiro_recebido', 'financeiro_atraso');
  v_school uuid;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_limite int := least(greatest(coalesce(p_limite, 200), 1), 500);
  v_turmas text[];
  v_result jsonb;
begin
  if not v_financeiro and coalesce(p_indicador, '') <> 'alunos_ativos' then
    raise exception 'bi_indicador_invalido' using errcode = '22023';
  end if;
  v_school := public.bi_contexto(p_inicio, p_fim, v_financeiro);

  if jsonb_typeof(p_filtros -> 'turmas') = 'array' then
    select array_agg(t) into v_turmas from jsonb_array_elements_text(p_filtros -> 'turmas') t;
  end if;

  if v_financeiro then
    with base as (
      select fc.id, a.id as aluno_id, a.name as aluno, a.turma, fc.due_date, fc.amount_cents, fc.status,
        fc.payment_method, fc.paid_at
      from public.financial_charges fc
      join public.students a on a.id = fc.student_id
      where fc.school_id = v_school
        and a.school_id = v_school
        and (v_turmas is null or cardinality(v_turmas) = 0 or a.turma = any (v_turmas))
        and fc.due_date between p_inicio and p_fim
        and fc.status not in ('CANCELLED', 'REFUNDED', 'FAILED')
        and case p_indicador
          when 'financeiro_recebido' then fc.status = 'PAID'
          when 'financeiro_atraso' then (fc.status = 'OVERDUE' or (fc.status in ('PENDING', 'AWAITING_PAYMENT') and fc.due_date < v_hoje))
          else true
        end
    )
    select jsonb_build_object(
      'indicador', p_indicador,
      'total', (select count(*) from base),
      'linhas', coalesce((select jsonb_agg(to_jsonb(l)) from (
        select b.id, b.aluno_id, b.aluno, b.turma, b.due_date, b.amount_cents, b.status, b.payment_method, b.paid_at
        from base b order by b.due_date desc, b.aluno limit v_limite) l), '[]'::jsonb)
    ) into v_result;
  else
    with base as (
      select s.id, s.name as aluno, s.turma, s.turno
      from public.students s
      where s.school_id = v_school
        and s.enrollment_status = 'ativo'
        and (v_turmas is null or cardinality(v_turmas) = 0 or s.turma = any (v_turmas))
    )
    select jsonb_build_object(
      'indicador', p_indicador,
      'total', (select count(*) from base),
      'linhas', coalesce((select jsonb_agg(to_jsonb(l)) from (
        select b.id, b.aluno, b.turma, b.turno from base b order by b.aluno limit v_limite) l), '[]'::jsonb)
    ) into v_result;
  end if;

  return v_result;
end;
$function$;

-- ═══ 6. Permissões de execução ════════════════════════════════════════════
revoke all on function public.bi_contexto(date, date, boolean) from public, anon;
revoke all on function public.bi_visao_geral(date, date, text[]) from public, anon;
revoke all on function public.bi_financeiro(date, date, text[]) from public, anon;
revoke all on function public.bi_detalhe(text, date, date, jsonb, int) from public, anon;
grant execute on function public.bi_contexto(date, date, boolean) to authenticated;
grant execute on function public.bi_visao_geral(date, date, text[]) to authenticated;
grant execute on function public.bi_financeiro(date, date, text[]) to authenticated;
grant execute on function public.bi_detalhe(text, date, date, jsonb, int) to authenticated;
