-- Faturamento 12.12: 1ª parcela não paga após N dias vira SUGESTÃO de cancelamento (sugerir e confirmar).
-- Nada cancela sozinho: a rotina não chama o Asaas e cancelar só no banco deixaria o boleto pagável.
-- O developer vê a lista (RPC de leitura) e confirma pelo cancelar_contratacao (Asaas primeiro, banco depois).
-- RLS: sem tabela nova; a coluna herda a RLS e o gatilho de histórico de zela_config_comercial.

alter table public.zela_config_comercial
  add column if not exists cancelar_1a_parcela_dias integer not null default 30
  check (cancelar_1a_parcela_dias between 7 and 180);

-- Lista de sugestões: contratação aguardando pagamento (nunca ativada), 1ª parcela vencida há N dias ou mais
-- e nenhuma parcela paga ou estornada. Só developer. Leitura pura, sempre atual.
create or replace function public.zela_contratacoes_para_cancelar()
returns table (
  contratacao_id uuid,
  school_id uuid,
  school_name text,
  cobranca_id uuid,
  parcela_numero integer,
  vencimento date,
  valor numeric,
  dias_atraso integer,
  limite_dias integer
)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_dias integer;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  perform public.zela_exigir_developer();
  select c.cancelar_1a_parcela_dias into v_dias from public.zela_config_comercial c where c.id;
  v_dias := coalesce(v_dias, 30);

  return query
  select ct.id, ct.school_id, s.name::text, b.id, b.numero, b.vencimento, b.valor,
         (v_hoje - b.vencimento)::integer, v_dias
    from public.school_contratacoes ct
    join public.schools s on s.id = ct.school_id
    join public.zela_cobrancas b
      on b.contratacao_id = ct.id and b.tipo = 'parcela' and b.numero = 1
   where ct.status = 'aguardando_pagamento'
     and b.status in ('pendente', 'vencida')
     and b.vencimento + v_dias <= v_hoje
     and not exists (
       select 1 from public.zela_cobrancas p
        where p.contratacao_id = ct.id and p.status in ('paga', 'estornada'))
   order by b.vencimento, s.name;
end;
$function$;

revoke execute on function public.zela_contratacoes_para_cancelar() from public, anon;
grant execute on function public.zela_contratacoes_para_cancelar() to authenticated;

-- Trilha do cancelamento: quem cancelou e quando, em zela_planos_historico (a tabela não tinha gatilho).
create or replace function public.zela_contratacao_cancelar_pendente(p_contratacao_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_ct public.school_contratacoes%rowtype;
begin
  perform public.zela_exigir_developer();
  select * into v_ct from public.school_contratacoes where id = p_contratacao_id for update;
  if not found then raise exception 'Contratação não encontrada.'; end if;
  if v_ct.status <> 'aguardando_pagamento' then
    raise exception 'Só contratação aguardando pagamento pode ser cancelada aqui (atual: %).', v_ct.status;
  end if;
  update public.zela_cobrancas set status = 'cancelada'
   where contratacao_id = v_ct.id and status in ('pendente', 'vencida');
  update public.school_contratacoes set status = 'cancelada', encerrada_em = now() where id = v_ct.id;
  insert into public.zela_planos_historico (tabela, registro_id, acao, antes, depois, changed_by)
  values ('school_contratacoes', v_ct.id::text, 'CANCELAR',
          jsonb_build_object('status', v_ct.status),
          jsonb_build_object('status', 'cancelada', 'school_id', v_ct.school_id), auth.uid());
end;
$function$;
