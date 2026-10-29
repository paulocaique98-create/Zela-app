-- Painel de indicadores (BI), Fase 1.5: RPCs de Acadêmico e Operação.
-- Plano: PLANO_EXPANSAO_GESTAO.md seções 3.5 e 3.7. Só leitura: nenhuma tabela é alterada.
--
-- Segurança (igual às fases 1.2 e 1.4):
--  * security INVOKER: a RLS de cada tabela continua valendo para quem chama.
--  * toda função passa por bi_contexto (escola, perfil gestao/gestao_pedagogica, período até 24 meses)
--    e filtra também por school_id.
--  * nenhum valor em R$ nestas duas funções (horas extras ficam fora do painel).
--  * execute só para authenticated (revogado de public e anon).
--
-- Regras de cálculo (mostradas no rodapé de cada gráfico):
--  * Acadêmico mostra só o bloco do método da escola (schools.pedagogical_method);
--    'personalizado' recebe os dois blocos.
--  * Tradicional usa o ano letivo aberto mais recente que começou até p_fim (as notas são por
--    período letivo, não por data). Nota do período = média ponderada pelos pesos das avaliações;
--    se existir recuperação com nota, ela substitui a nota do período.
--    Média do aluno na disciplina = média das notas dos períodos lançados.
--    Aprovado na série = aluno com todas as médias de disciplina >= media_minima da escola.
--    Abaixo da média no período = média das disciplinas do aluno naquele período < media_minima.
--  * Montessori: relatórios e mitigações criados no período (created_at); pendente = RASCUNHO,
--    publicado = PUBLICADO; ARQUIVADO não entra.
--  * Operação: entradas e saídas por hora do dia (fuso de São Paulo) em attendance_logs.event_time;
--    correções de attendance_corrections pedidas no período.
-- Fora do painel (dado não existe): forma de identificação (facial, QR, PIN), tempo da solicitação
-- à confirmação no monitor, horas extras (calculadas na tela, não gravadas).

-- ═══ 1. Índice ════════════════════════════════════════════════════════════
create index if not exists idx_attendance_corrections_school_requested
  on public.attendance_corrections (school_id, requested_at);

-- ═══ 2. Acadêmico ═════════════════════════════════════════════════════════
create or replace function public.bi_academico(p_inicio date, p_fim date, p_turmas text[] default null)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $function$
declare
  v_school uuid := public.bi_contexto(p_inicio, p_fim, false);
  v_metodo text;
  v_ano uuid;
  v_minima numeric := 7.0;
  v_trad jsonb := null;
  v_mont jsonb := null;
begin
  select s.pedagogical_method into v_metodo from public.schools s where s.id = v_school;

  if v_metodo in ('tradicional', 'personalizado') then
    select y.id into v_ano
    from public.school_years y
    where y.school_id = v_school and y.starts_on <= p_fim
    order by (y.status = 'aberto') desc, y.starts_on desc
    limit 1;

    select c.media_minima into v_minima from public.trad_config_avaliacao c where c.school_id = v_school;
    v_minima := coalesce(v_minima, 7.0);

    with
    base as (
      select n.student_id, n.nota, av.id as av_id, av.periodo, av.tipo, av.peso,
        d.id as disciplina_id, d.nome as disciplina,
        se.nome as serie, st.name as aluno, t.nome as turma
      from public.trad_notas n
      join public.trad_avaliacoes av on av.id = n.avaliacao_id and av.school_id = v_school
      join public.trad_atribuicoes a on a.id = av.atribuicao_id and a.school_id = v_school
      join public.trad_turmas t on t.id = a.turma_id and t.school_id = v_school
      join public.trad_series se on se.id = t.serie_id and se.school_id = v_school
      join public.trad_disciplinas d on d.id = a.disciplina_id and d.school_id = v_school
      join public.students st on st.id = n.student_id and st.school_id = v_school
      where n.school_id = v_school
        and t.school_year_id = v_ano
        and (p_turmas is null or cardinality(p_turmas) = 0 or t.nome = any (p_turmas))
    ),
    periodo_nota as (
      select b.student_id, b.aluno, b.turma, b.serie, b.disciplina_id, b.disciplina, b.periodo,
        coalesce(
          max(b.nota) filter (where b.tipo = 'recuperacao'),
          sum(b.nota * b.peso) filter (where b.tipo <> 'recuperacao')
            / nullif(sum(b.peso) filter (where b.tipo <> 'recuperacao'), 0)
        ) as nota_periodo
      from base b
      group by b.student_id, b.aluno, b.turma, b.serie, b.disciplina_id, b.disciplina, b.periodo
    ),
    aluno_disc as (
      select p.student_id, p.aluno, p.turma, p.serie, p.disciplina, avg(p.nota_periodo) as media
      from periodo_nota p
      where p.nota_periodo is not null
      group by p.student_id, p.aluno, p.turma, p.serie, p.disciplina
    ),
    aluno_serie as (
      select ad.student_id, ad.serie, bool_and(ad.media >= v_minima) as aprovado
      from aluno_disc ad
      group by ad.student_id, ad.serie
    ),
    aluno_periodo as (
      select p.student_id, p.aluno, p.turma, p.periodo, avg(p.nota_periodo) as media
      from periodo_nota p
      where p.nota_periodo is not null
      group by p.student_id, p.aluno, p.turma, p.periodo
    ),
    faixas as (
      select f.faixa, f.faixa || '-' || (f.faixa + 1) as rotulo,
        count(b.nota) as quantidade
      from generate_series(0, 9) f(faixa)
      left join base b on least(floor(b.nota)::int, 9) = f.faixa
      group by f.faixa
    )
    select jsonb_build_object(
      'media_minima', v_minima,
      'ano_letivo_id', v_ano,
      'kpis', jsonb_build_object(
        'alunos_com_nota', (select count(distinct student_id) from base),
        'notas_lancadas', (select count(*) from base),
        'media_geral', (select round(avg(media), 1) from aluno_disc),
        'alunos_abaixo_media', (select count(distinct student_id) from aluno_periodo where media < v_minima)
      ),
      'media_por_disciplina', (select coalesce(jsonb_agg(to_jsonb(t) order by t.media desc, t.disciplina), '[]'::jsonb) from (
        select ad.disciplina, round(avg(ad.media), 1) as media, count(*) as alunos
        from aluno_disc ad group by ad.disciplina) t),
      'distribuicao_notas', (select coalesce(jsonb_agg(jsonb_build_object('faixa', f.faixa, 'rotulo', f.rotulo, 'quantidade', f.quantidade) order by f.faixa), '[]'::jsonb) from faixas f),
      'aprovacao_por_serie', (select coalesce(jsonb_agg(to_jsonb(t) order by t.serie), '[]'::jsonb) from (
        select s.serie, count(*) as alunos, count(*) filter (where s.aprovado) as aprovados,
          round(100.0 * count(*) filter (where s.aprovado) / nullif(count(*), 0), 1) as aprovacao_pct
        from aluno_serie s group by s.serie) t),
      'abaixo_media_periodo', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from (
        select ap.student_id as aluno_id, ap.aluno, ap.turma, ap.periodo, round(ap.media, 1) as media
        from aluno_periodo ap where ap.media < v_minima
        order by ap.media, ap.aluno limit 20) t)
    ) into v_trad;
  end if;

  if v_metodo in ('montessori', 'personalizado') then
    with
    rel as (
      select r.author_id, coalesce(u.name, 'Sem professora') as professora, r.status
      from public.reports r
      join public.students st on st.id = r.student_id and st.school_id = v_school
      left join public.users u on u.id = r.author_id
      where r.school_id = v_school
        and r.status in ('RASCUNHO', 'PUBLICADO')
        and r.created_at >= p_inicio::timestamp at time zone 'America/Sao_Paulo'
        and r.created_at < (p_fim + 1)::timestamp at time zone 'America/Sao_Paulo'
        and (p_turmas is null or cardinality(p_turmas) = 0 or st.turma = any (p_turmas))
    ),
    mit as (
      select coalesce(st.turma, 'Sem turma') as turma, m.status
      from public.mitigacao_reports m
      join public.students st on st.id = m.student_id and st.school_id = v_school
      where m.school_id = v_school
        and m.status in ('RASCUNHO', 'PUBLICADO')
        and m.created_at >= p_inicio::timestamp at time zone 'America/Sao_Paulo'
        and m.created_at < (p_fim + 1)::timestamp at time zone 'America/Sao_Paulo'
        and (p_turmas is null or cardinality(p_turmas) = 0 or st.turma = any (p_turmas))
    )
    select jsonb_build_object(
      'kpis', jsonb_build_object(
        'relatorios_publicados', (select count(*) from rel where status = 'PUBLICADO'),
        'relatorios_pendentes', (select count(*) from rel where status = 'RASCUNHO'),
        'mitigacoes_publicadas', (select count(*) from mit where status = 'PUBLICADO'),
        'mitigacoes_pendentes', (select count(*) from mit where status = 'RASCUNHO')
      ),
      'relatorios_por_professora', (select coalesce(jsonb_agg(to_jsonb(t) order by t.pendentes desc, t.professora), '[]'::jsonb) from (
        select r.professora,
          count(*) filter (where r.status = 'PUBLICADO') as publicados,
          count(*) filter (where r.status = 'RASCUNHO') as pendentes
        from rel r group by r.professora) t),
      'mitigacoes_por_turma', (select coalesce(jsonb_agg(to_jsonb(t) order by t.turma), '[]'::jsonb) from (
        select m.turma,
          count(*) filter (where m.status = 'PUBLICADO') as publicadas,
          count(*) filter (where m.status = 'RASCUNHO') as pendentes
        from mit m group by m.turma) t)
    ) into v_mont;
  end if;

  return jsonb_build_object(
    'periodo', jsonb_build_object('inicio', p_inicio, 'fim', p_fim),
    'metodo', v_metodo,
    'tradicional', v_trad,
    'montessori', v_mont
  );
end;
$function$;

-- ═══ 3. Operação ══════════════════════════════════════════════════════════
create or replace function public.bi_operacao(p_inicio date, p_fim date, p_turmas text[] default null)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $function$
declare
  v_school uuid := public.bi_contexto(p_inicio, p_fim, false);
  v_ini timestamptz := p_inicio::timestamp at time zone 'America/Sao_Paulo';
  v_fim timestamptz := (p_fim + 1)::timestamp at time zone 'America/Sao_Paulo';
  v_result jsonb;
begin
  with
  logs as (
    select l.event_type, l.corrected,
      extract(hour from l.event_time at time zone 'America/Sao_Paulo')::int as hora
    from public.attendance_logs l
    join public.students st on st.id = l.student_id and st.school_id = v_school
    where l.school_id = v_school
      and l.event_time >= v_ini and l.event_time < v_fim
      and (p_turmas is null or cardinality(p_turmas) = 0 or st.turma = any (p_turmas))
  ),
  corr as (
    select c.status
    from public.attendance_corrections c
    join public.students st on st.id = c.student_id and st.school_id = v_school
    where c.school_id = v_school
      and c.requested_at >= v_ini and c.requested_at < v_fim
      and (p_turmas is null or cardinality(p_turmas) = 0 or st.turma = any (p_turmas))
  ),
  horas as (
    select h.hora,
      count(l.event_type) filter (where l.event_type = 'entry') as entradas,
      count(l.event_type) filter (where l.event_type = 'exit') as saidas
    from generate_series(0, 23) h(hora)
    left join logs l on l.hora = h.hora
    group by h.hora
  )
  select jsonb_build_object(
    'periodo', jsonb_build_object('inicio', p_inicio, 'fim', p_fim),
    'kpis', jsonb_build_object(
      'entradas', (select count(*) from logs where event_type = 'entry'),
      'saidas', (select count(*) from logs where event_type = 'exit'),
      'correcoes_pedidas', (select count(*) from corr),
      'correcoes_aprovadas', (select count(*) from corr where status in ('applied', 'approved')),
      'correcoes_pendentes', (select count(*) from corr where status = 'pending'),
      'correcoes_rejeitadas', (select count(*) from corr where status = 'rejected')
    ),
    'por_hora', (select coalesce(jsonb_agg(to_jsonb(h) order by h.hora), '[]'::jsonb) from horas h)
  ) into v_result;

  return v_result;
end;
$function$;

-- ═══ 4. Permissões de execução ════════════════════════════════════════════
revoke all on function public.bi_academico(date, date, text[]) from public, anon;
revoke all on function public.bi_operacao(date, date, text[]) from public, anon;
grant execute on function public.bi_academico(date, date, text[]) to authenticated;
grant execute on function public.bi_operacao(date, date, text[]) to authenticated;
