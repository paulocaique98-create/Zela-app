-- Método Tradicional, Fase 4A: boletim e resultado final (PLANO_METODO_TRADICIONAL.md).
-- Aditiva: 3 colunas novas em trad_config_avaliacao (regra de situação final
-- personalizável pela escola) e a tabela nova trad_resultados. Nada do
-- Montessori é alterado. Roda depois das Fases 1, 2 e 3.
-- Regra (por escola): frequência mínima, média mínima (já existente) e média
-- de recuperação final (nula = a escola não faz recuperação final).
-- Isolamento: school_id em tudo; aluno validado contra a escola por trigger.
-- RLS: SÓ Coordenação e Direção (gestao_pedagogica) fecham, ajustam e reabrem
-- o resultado. A família lê apenas o resultado FECHADO do próprio filho
-- (students.family_id = auth.uid()). Professor e demais perfis não acessam.

alter table public.trad_config_avaliacao
  add column if not exists freq_minima numeric(4,1) not null default 75.0,
  add column if not exists media_recuperacao numeric(3,1) default 5.0,
  add column if not exists recuperacao_final boolean not null default true;

alter table public.trad_config_avaliacao
  drop constraint if exists trad_config_freq_minima_check,
  add constraint trad_config_freq_minima_check check (freq_minima between 0 and 100);
alter table public.trad_config_avaliacao
  drop constraint if exists trad_config_media_recuperacao_check,
  add constraint trad_config_media_recuperacao_check
    check (media_recuperacao is null or (media_recuperacao between 0 and 10 and media_recuperacao <= media_minima));

create table if not exists public.trad_resultados (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  turma_id uuid not null,
  situacao text not null check (situacao in ('aprovado', 'recuperacao', 'reprovado', 'reprovado_frequencia')),
  -- O que o sistema calculou na hora do fechamento; 'incompleto' = faltavam notas.
  situacao_calculada text not null check (situacao_calculada in ('aprovado', 'recuperacao', 'reprovado', 'reprovado_frequencia', 'incompleto')),
  frequencia numeric(4,1) check (frequencia between 0 and 100),
  -- Fotografia do boletim no fechamento: [{ disciplina, medias, media_anual, situacao }].
  boletim jsonb not null default '[]'::jsonb,
  observacao text not null default '' check (length(observacao) <= 2000),
  fechado_por uuid references public.users(id) on delete set null,
  fechado_em timestamptz not null default now(),
  unique (school_id, student_id, turma_id),
  foreign key (turma_id, school_id) references public.trad_turmas(id, school_id) on delete cascade,
  -- Ajuste manual (ou fechamento incompleto) exige justificativa.
  check (situacao = situacao_calculada or length(btrim(observacao)) > 0)
);
create index if not exists idx_trad_resultados_turma on public.trad_resultados(school_id, turma_id);
create index if not exists idx_trad_resultados_student on public.trad_resultados(school_id, student_id);

-- Aluno da mesma escola e da turma do resultado (students.turma = trad_turmas.nome).
create or replace function public.trad_valida_resultado() returns trigger
  language plpgsql
  set search_path to 'public'
as $$
begin
  if not exists (
    select 1
    from public.trad_turmas t
    join public.students s on s.school_id = t.school_id and s.turma = t.nome
    where t.id = new.turma_id and t.school_id = new.school_id and s.id = new.student_id
  ) then
    raise exception 'Aluno não pertence à turma deste resultado';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_trad_valida_resultado on public.trad_resultados;
create trigger trg_trad_valida_resultado
  before insert or update on public.trad_resultados
  for each row execute function public.trad_valida_resultado();

alter table public.trad_resultados enable row level security;

drop policy if exists "Coordenacao e direcao gerenciam resultados da escola" on public.trad_resultados;
create policy "Coordenacao e direcao gerenciam resultados da escola" on public.trad_resultados
  for all
  using (get_my_role() = 'gestao_pedagogica' and school_id = get_my_school_id())
  with check (get_my_role() = 'gestao_pedagogica' and school_id = get_my_school_id());

drop policy if exists "Familia le o resultado fechado do proprio filho" on public.trad_resultados;
create policy "Familia le o resultado fechado do proprio filho" on public.trad_resultados
  for select
  using (
    get_my_role() = 'family'
    and school_id = get_my_school_id()
    and student_id in (select s.id from public.students s
                       where s.school_id = get_my_school_id() and s.family_id = auth.uid())
  );
