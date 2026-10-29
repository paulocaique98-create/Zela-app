-- Painel de indicadores (BI), Fase 1.4: RPCs de Matrículas e Frequência.
-- Plano: PLANO_EXPANSAO_GESTAO.md seções 3.5 e 3.7. Só leitura: nenhuma tabela é alterada.
--
-- Segurança (igual à 1.2):
--  * security INVOKER: a RLS de cada tabela continua valendo para quem chama.
--  * toda função passa por bi_contexto (escola, perfil gestao/gestao_pedagogica, período até 24 meses)
--    e filtra também por school_id.
--  * contratos (enviados/assinados) só aparecem para 'gestao'; a Coordenação recebe nulo.
--  * execute só para authenticated (revogado de public e anon).
--
-- Regras de cálculo (mostradas no rodapé de cada gráfico):
--  * Matrículas novas = alunos cuja primeira linha em enrollments foi criada no período
--    (alunos que já existiam em 27/09/2026 aparecem no mês da carga inicial).
--  * Alunos por turno e faixa etária = alunos ativos hoje (idade calculada hoje).
--  * Contratos enviados/assinados = contract_documents kind 'contrato' com sent_at/signed_at no período.
--  * Frequência % = (presente + atrasado) / (registros sem os justificados), em class_attendance.
--  * Alunos abaixo de 75% = alunos com registros no período e frequência % menor que 75.
--  * Faltas = registros 'ausente'. Atrasos = registros 'atrasado'.
-- Fora do painel (dados não existem): solicitações e aprovações de matrícula, vagas por turma,
-- datas de saída/trancamento.

-- ═══ 1. Índices ═══════════════════════════════════════════════════════════
create index if not exists idx_enrollments_school_created on public.enrollments (school_id, created_at);

-- ═══ 2. Matrículas ════════════════════════════════════════════════════════
create or replace function public.bi_matriculas(p_inicio date, p_fim date, p_turmas text[] default null)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $function$
declare
  v_school uuid := public.bi_contexto(p_inicio, p_fim, false);
  v_ve_contrato boolean := (public.get_my_role() = 'gestao');
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_result jsonb;
begin
  with
  alunos as (
    select s.id, s.turma, s.turno, s.birth_date, s.enrollment_status
    from public.students s
    where s.school_id = v_school
      and (p_turmas is null or cardinality(p_turmas) = 0 or s.turma = any (p_turmas))
  ),
  ativos as (
    select * from alunos where enrollment_status = 'ativo'
  ),
  primeira as (
    select e.student_id, (min(e.created_at) at time zone 'America/Sao_Paulo')::date as entrada
    from public.enrollments e
    join alunos a on a.id = e.student_id
    where e.school_id = v_school
    group by e.student_id
  ),
  contratos as (
    select cd.sent_at, cd.signed_at, cd.status
    from public.contract_documents cd
    join alunos a on a.id = cd.student_id
    where v_ve_contrato
      and cd.school_id = v_school
      and cd.kind = 'contrato'
      and cd.status <> 'cancelado'
  ),
  meses as (
    select generate_series(date_trunc('month', p_inicio)::date, date_trunc('month', p_fim)::date, interval '1 month')::date as mes
  ),
  entradas as (
    select m.mes, count(p.student_id) as entradas
    from meses m
    left join primeira p on date_trunc('month', p.entrada)::date = m.mes and p.entrada between p_inicio and p_fim
    group by m.mes
  ),
  por_turma as (
    select coalesce(a.turma, 'Sem turma') as turma, count(*) as alunos
    from ativos a
    group by coalesce(a.turma, 'Sem turma')
  ),
  por_turno as (
    select coalesce(nullif(a.turno, ''), 'Sem turno') as turno, count(*) as alunos
    from ativos a
    group by coalesce(nullif(a.turno, ''), 'Sem turno')
  ),
  por_faixa as (
    select faixa, ordem, count(*) as alunos
    from (
      select
        case
          when a.birth_date is null then 'Sem data'
          when extract(year from age(v_hoje, a.birth_date)) < 2 then '0 a 1 ano'
          when extract(year from age(v_hoje, a.birth_date)) >= 11 then '11 anos ou mais'
          when extract(year from age(v_hoje, a.birth_date)) >= 6 then '6 a 10 anos'
          else extract(year from age(v_hoje, a.birth_date))::int || ' anos'
        end as faixa,
        case
          when a.birth_date is null then 99
          when extract(year from age(v_hoje, a.birth_date)) < 2 then 0
          when extract(year from age(v_hoje, a.birth_date)) >= 11 then 7
          when extract(year from age(v_hoje, a.birth_date)) >= 6 then 6
          else extract(year from age(v_hoje, a.birth_date))::int
        end as ordem
      from ativos a
    ) f
    group by faixa, ordem
  )
  select jsonb_build_object(
    'periodo', jsonb_build_object('inicio', p_inicio, 'fim', p_fim),
    'contratos_visiveis', v_ve_contrato,
    'kpis', jsonb_build_object(
      'alunos_ativos', (select count(*) from ativos),
      'matriculas_novas', (select count(*) from primeira where entrada between p_inicio and p_fim),
      'contratos_enviados', case when v_ve_contrato then
        (select count(*) from contratos where (sent_at at time zone 'America/Sao_Paulo')::date between p_inicio and p_fim) end,
      'contratos_assinados', case when v_ve_contrato then
        (select count(*) from contratos where status = 'assinado'
          and (signed_at at time zone 'America/Sao_Paulo')::date between p_inicio and p_fim) end
    ),
    'entradas_mensais', (select coalesce(jsonb_agg(to_jsonb(e) order by e.mes), '[]'::jsonb) from entradas e),
    'alunos_por_turma', (select coalesce(jsonb_agg(to_jsonb(t) order by t.alunos desc, t.turma), '[]'::jsonb) from por_turma t),
    'alunos_por_turno', (select coalesce(jsonb_agg(to_jsonb(t) order by t.alunos desc, t.turno), '[]'::jsonb) from por_turno t),
    'alunos_por_faixa', (select coalesce(jsonb_agg(jsonb_build_object('faixa', f.faixa, 'alunos', f.alunos) order by f.ordem), '[]'::jsonb) from por_faixa f)
  ) into v_result;

  return v_result;
end;
$function$;

-- ═══ 3. Frequência ════════════════════════════════════════════════════════
create or replace function public.bi_frequencia(p_inicio date, p_fim date, p_turmas text[] default null)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $function$
declare
  v_school uuid := public.bi_contexto(p_inicio, p_fim, false);
  v_result jsonb;
begin
  with
  freq as (
    select ca.student_id, a.name as aluno, coalesce(a.turma, 'Sem turma') as turma, ca.date, ca.status
    from public.class_attendance ca
    join public.students a on a.id = ca.student_id
    where ca.school_id = v_school
      and a.school_id = v_school
      and ca.date between p_inicio and p_fim
      and (p_turmas is null or cardinality(p_turmas) = 0 or a.turma = any (p_turmas))
  ),
  por_aluno as (
    select f.student_id, f.aluno, f.turma,
      count(*) filter (where f.status = 'ausente') as faltas,
      round(100.0 * count(*) filter (where f.status in ('presente', 'atrasado'))
        / nullif(count(*) filter (where f.status <> 'justificado'), 0), 1) as frequencia_pct
    from freq f
    group by f.student_id, f.aluno, f.turma
  ),
  por_turma as (
    select f.turma,
      round(100.0 * count(*) filter (where f.status in ('presente', 'atrasado'))
        / nullif(count(*) filter (where f.status <> 'justificado'), 0), 1) as frequencia_pct
    from freq f
    group by f.turma
  ),
  turma_semana as (
    select f.turma, date_trunc('week', f.date)::date as semana,
      round(100.0 * count(*) filter (where f.status in ('presente', 'atrasado'))
        / nullif(count(*) filter (where f.status <> 'justificado'), 0), 1) as frequencia_pct
    from freq f
    group by f.turma, date_trunc('week', f.date)::date
  ),
  dia_semana as (
    select d.dia, count(f.student_id) filter (where f.status = 'ausente') as faltas
    from generate_series(1, 7) d(dia)
    left join freq f on extract(isodow from f.date)::int = d.dia
    group by d.dia
  )
  select jsonb_build_object(
    'periodo', jsonb_build_object('inicio', p_inicio, 'fim', p_fim),
    'kpis', jsonb_build_object(
      'frequencia_media_pct', (select round(100.0 * count(*) filter (where status in ('presente', 'atrasado'))
        / nullif(count(*) filter (where status <> 'justificado'), 0), 1) from freq),
      'alunos_abaixo_75', (select count(*) from por_aluno where frequencia_pct < 75),
      'faltas', (select count(*) from freq where status = 'ausente'),
      'atrasos', (select count(*) from freq where status = 'atrasado')
    ),
    'por_turma', (select coalesce(jsonb_agg(to_jsonb(t) order by t.frequencia_pct desc nulls last, t.turma), '[]'::jsonb) from por_turma t),
    'turma_semana', (select coalesce(jsonb_agg(to_jsonb(t) order by t.turma, t.semana), '[]'::jsonb) from turma_semana t),
    'faltas_dia_semana', (select coalesce(jsonb_agg(to_jsonb(d) order by d.dia), '[]'::jsonb) from dia_semana d),
    'top_faltas', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from (
      select p.student_id as aluno_id, p.aluno, p.turma, p.faltas, p.frequencia_pct
      from por_aluno p where p.faltas > 0
      order by p.faltas desc, p.aluno limit 10) t)
  ) into v_result;

  return v_result;
end;
$function$;

-- ═══ 4. Drill down: novos indicadores ═════════════════════════════════════
-- Além dos da 1.2: matriculas_novas, frequencia_faltas, frequencia_abaixo_75.
-- p_filtros aceita {"turmas": ["Nido", ...]}.
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
  if not v_financeiro and coalesce(p_indicador, '') not in
     ('alunos_ativos', 'matriculas_novas', 'frequencia_faltas', 'frequencia_abaixo_75') then
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

  elsif p_indicador = 'matriculas_novas' then
    with base as (
      select s.id, s.name as aluno, s.turma, s.turno,
        (min(e.created_at) at time zone 'America/Sao_Paulo')::date as entrada
      from public.students s
      join public.enrollments e on e.student_id = s.id and e.school_id = v_school
      where s.school_id = v_school
        and (v_turmas is null or cardinality(v_turmas) = 0 or s.turma = any (v_turmas))
      group by s.id, s.name, s.turma, s.turno
      having (min(e.created_at) at time zone 'America/Sao_Paulo')::date between p_inicio and p_fim
    )
    select jsonb_build_object(
      'indicador', p_indicador,
      'total', (select count(*) from base),
      'linhas', coalesce((select jsonb_agg(to_jsonb(l)) from (
        select b.id, b.aluno, b.turma, b.turno, b.entrada from base b order by b.entrada desc, b.aluno limit v_limite) l), '[]'::jsonb)
    ) into v_result;

  elsif p_indicador in ('frequencia_faltas', 'frequencia_abaixo_75') then
    with por_aluno as (
      select a.id, a.name as aluno, a.turma,
        count(*) filter (where ca.status = 'ausente') as faltas,
        count(*) filter (where ca.status = 'atrasado') as atrasos,
        round(100.0 * count(*) filter (where ca.status in ('presente', 'atrasado'))
          / nullif(count(*) filter (where ca.status <> 'justificado'), 0), 1) as frequencia_pct
      from public.class_attendance ca
      join public.students a on a.id = ca.student_id
      where ca.school_id = v_school
        and a.school_id = v_school
        and ca.date between p_inicio and p_fim
        and (v_turmas is null or cardinality(v_turmas) = 0 or a.turma = any (v_turmas))
      group by a.id, a.name, a.turma
    ),
    base as (
      select * from por_aluno
      where case p_indicador when 'frequencia_abaixo_75' then frequencia_pct < 75 else faltas > 0 end
    )
    select jsonb_build_object(
      'indicador', p_indicador,
      'total', (select count(*) from base),
      'linhas', coalesce((select jsonb_agg(to_jsonb(l)) from (
        select b.id, b.aluno, b.turma, b.faltas, b.atrasos, b.frequencia_pct
        from base b order by b.faltas desc, b.aluno limit v_limite) l), '[]'::jsonb)
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

-- ═══ 5. Permissões de execução ════════════════════════════════════════════
revoke all on function public.bi_matriculas(date, date, text[]) from public, anon;
revoke all on function public.bi_frequencia(date, date, text[]) from public, anon;
revoke all on function public.bi_detalhe(text, date, date, jsonb, int) from public, anon;
grant execute on function public.bi_matriculas(date, date, text[]) to authenticated;
grant execute on function public.bi_frequencia(date, date, text[]) to authenticated;
grant execute on function public.bi_detalhe(text, date, date, jsonb, int) to authenticated;
