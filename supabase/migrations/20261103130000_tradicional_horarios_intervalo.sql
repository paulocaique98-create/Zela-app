-- Método Tradicional: intervalo no quadro de horários.
-- Um intervalo é uma linha de trad_horarios SEM atribuição (atribuicao_id nulo), com dia,
-- início e fim definidos pela escola. Aditiva e sem perda de dados: só relaxa o NOT NULL de
-- atribuicao_id; as linhas existentes continuam válidas.
-- Isolamento: school_id e a chave composta (turma_id, school_id) seguem obrigatórios, então o
-- intervalo continua preso à turma e à escola. A chave composta de atribuição não é cobrada
-- quando atribuicao_id é nulo (MATCH SIMPLE), e a RLS não muda: só admin, gestao e
-- gestao_pedagogica da própria escola escrevem. O professor só lê horários das próprias
-- atribuições, então não enxerga intervalos (nenhuma tela dele usa essa tabela ainda).

alter table public.trad_horarios alter column atribuicao_id drop not null;

create or replace function public.trad_valida_horario() returns trigger
  language plpgsql
  set search_path to 'public'
as $$
begin
  if new.atribuicao_id is null then
    return new; -- intervalo: não há atribuição para conferir
  end if;
  if not exists (
    select 1 from public.trad_atribuicoes a
    where a.id = new.atribuicao_id and a.school_id = new.school_id and a.turma_id = new.turma_id
  ) then
    raise exception 'A atribuição não pertence a esta turma';
  end if;
  return new;
end;
$$;
