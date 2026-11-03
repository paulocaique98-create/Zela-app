-- Faturamento do Zela Edu, etapa D (PLANO_FATURAMENTO_ZELA.md, seção 2 e item 11).
-- Análise de segurança: todas as tabelas novas têm RLS ligado e só policy de SELECT para developer
-- (get_my_role() = 'developer'). Nenhuma policy de escrita: gravação só pelas funções abaixo (security
-- definer, search_path fixo, role conferido no servidor). A escola não lê nada daqui. Nada destrutivo:
-- só tabelas, uma coluna aditiva e funções novas. A rotina agendada só é executável por service_role/postgres.
--
-- Regras de negócio:
--  - IPCA: digitado pelo developer (acumulado dos 12 meses), um valor por ano, guardado em zela_ipca_anual.
--    Um ano já usado em reajuste ou renovação não pode mudar de valor.
--  - Mensal (sem fidelidade): reajuste a qualquer momento, mas no máximo 1 vez a cada 12 meses (a contar do
--    início ou do último reajuste), nunca acima do IPCA registrado, só em contrato ativo com assinatura no
--    Asaas. Vale só para as cobranças futuras. A função registra quem reajustou; a Edge Function sincroniza
--    o Asaas e desfaz o registro se a sincronização falhar.
--  - Anual: valor travado até o fim. A rotina cria um RASCUNHO de renovação (base: valor do contrato em
--    vigência + IPCA) quando faltam renovacao_antecedencia_dias para o fim. Nada vira cobrança sem o
--    developer confirmar. A implantação não se repete.
--  - Rotina diária: pendente vencida vira "vencida"; contrato ativo com parcela vencida há mais que a
--    carência é suspenso e a escola fica fora do ar (schools.is_active, o mesmo mecanismo da suspensão manual).

alter table public.zela_config_comercial
  add column if not exists renovacao_antecedencia_dias integer not null default 60
    check (renovacao_antecedencia_dias between 15 and 180);

create table if not exists public.zela_ipca_anual (
  ano integer primary key check (ano between 2000 and 2100),
  percentual numeric(5,2) not null check (percentual >= 0 and percentual <= 30),
  registrado_por uuid,
  registrado_em timestamptz not null default now()
);

create table if not exists public.zela_reajustes_mensal (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  contratacao_id uuid not null references public.school_contratacoes(id) on delete cascade,
  ipca_ano integer not null references public.zela_ipca_anual(ano),
  percentual numeric(5,2) not null check (percentual > 0 and percentual <= 30),
  valor_anterior numeric(12,2) not null check (valor_anterior > 0),
  valor_novo numeric(12,2) not null check (valor_novo > 0),
  sincronizado_asaas boolean not null default false,
  aplicado_por uuid,
  aplicado_em timestamptz not null default now()
);
create index if not exists zela_reajustes_mensal_ct_idx on public.zela_reajustes_mensal (contratacao_id, aplicado_em desc);

create table if not exists public.zela_renovacoes (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  origem_id uuid not null references public.school_contratacoes(id) on delete cascade,
  nova_id uuid references public.school_contratacoes(id) on delete set null,
  ipca_ano integer not null references public.zela_ipca_anual(ano),
  ipca_percent numeric(5,2) not null,
  base_mensal numeric(12,2) not null check (base_mensal > 0),
  novo_mensal numeric(12,2) not null check (novo_mensal > 0),
  status text not null default 'rascunho' check (status in ('rascunho', 'confirmada', 'descartada')),
  criado_em timestamptz not null default now(),
  decidido_por uuid,
  decidido_em timestamptz
);
create unique index if not exists zela_renovacoes_origem_uidx on public.zela_renovacoes (origem_id)
  where status in ('rascunho', 'confirmada');
create index if not exists zela_renovacoes_status_idx on public.zela_renovacoes (status, criado_em desc);

alter table public.zela_ipca_anual enable row level security;
alter table public.zela_reajustes_mensal enable row level security;
alter table public.zela_renovacoes enable row level security;

-- Só leitura para o developer (policies abaixo); sem truncate, references nem trigger para o cliente.
revoke all on public.zela_ipca_anual, public.zela_reajustes_mensal, public.zela_renovacoes from anon, authenticated;
grant select on public.zela_ipca_anual, public.zela_reajustes_mensal, public.zela_renovacoes to authenticated;

drop policy if exists "Developer le o IPCA" on public.zela_ipca_anual;
create policy "Developer le o IPCA" on public.zela_ipca_anual
  for select to authenticated using (public.get_my_role() = 'developer');
drop policy if exists "Developer le os reajustes do Mensal" on public.zela_reajustes_mensal;
create policy "Developer le os reajustes do Mensal" on public.zela_reajustes_mensal
  for select to authenticated using (public.get_my_role() = 'developer');
drop policy if exists "Developer le as renovacoes" on public.zela_renovacoes;
create policy "Developer le as renovacoes" on public.zela_renovacoes
  for select to authenticated using (public.get_my_role() = 'developer');

-- IPCA do ano: o developer digita o acumulado. Ano já usado não muda de valor.
create or replace function public.zela_ipca_registrar(p_ano integer, p_percentual numeric)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_atual numeric;
begin
  perform public.zela_exigir_developer();
  if p_ano is null or p_ano < 2000 or p_ano > 2100 then raise exception 'Ano inválido.'; end if;
  if p_percentual is null or p_percentual < 0 or p_percentual > 30 then
    raise exception 'O IPCA deve ficar entre 0 e 30 por cento.';
  end if;
  select percentual into v_atual from public.zela_ipca_anual where ano = p_ano for update;
  if found and v_atual <> round(p_percentual, 2) and (
    exists (select 1 from public.zela_reajustes_mensal where ipca_ano = p_ano)
    or exists (select 1 from public.zela_renovacoes where ipca_ano = p_ano and status <> 'descartada')
  ) then
    raise exception 'O IPCA de % já foi usado em reajuste ou renovação e não pode mudar.', p_ano;
  end if;
  insert into public.zela_ipca_anual (ano, percentual, registrado_por)
  values (p_ano, round(p_percentual, 2), auth.uid())
  on conflict (ano) do update set percentual = excluded.percentual, registrado_por = auth.uid(), registrado_em = now();
end;
$function$;

-- Reajuste do Mensal: valida a trava e registra. Devolve o que a Edge Function precisa para o Asaas.
create or replace function public.zela_reajuste_mensal_registrar(p_contratacao_id uuid, p_ano_ipca integer, p_percentual numeric)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_ct public.school_contratacoes%rowtype;
  v_ipca numeric;
  v_base date;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_atual numeric(12,2);
  v_novo numeric(12,2);
  v_id uuid;
begin
  perform public.zela_exigir_developer();
  select * into v_ct from public.school_contratacoes where id = p_contratacao_id for update;
  if not found then raise exception 'Contratação não encontrada.'; end if;
  if v_ct.pagamento is distinct from 'mes_a_mes' then
    raise exception 'Só o contrato Mensal pode ser reajustado durante a vigência. No Anual o valor fica travado até a renovação.';
  end if;
  if v_ct.status <> 'ativa' then raise exception 'Só contratação ativa pode ser reajustada (atual: %).', v_ct.status; end if;
  if v_ct.asaas_subscription_id is null then
    raise exception 'A contratação não tem assinatura no Asaas. Gere os links antes de reajustar.';
  end if;

  select percentual into v_ipca from public.zela_ipca_anual where ano = p_ano_ipca;
  if not found then raise exception 'IPCA de % não registrado.', p_ano_ipca; end if;
  if p_ano_ipca < extract(year from v_hoje)::integer - 1 then
    raise exception 'O IPCA de % está velho demais para reajustar agora.', p_ano_ipca;
  end if;
  if p_percentual is null or p_percentual <= 0 then raise exception 'Informe um percentual de reajuste maior que zero.'; end if;
  if round(p_percentual, 2) > v_ipca then
    raise exception 'O reajuste (% por cento) não pode passar do IPCA registrado (% por cento).', round(p_percentual, 2), v_ipca;
  end if;

  select coalesce(max(aplicado_em)::date, v_ct.inicio) into v_base
    from public.zela_reajustes_mensal where contratacao_id = v_ct.id;
  if v_base is null or (v_base + interval '12 months')::date > v_hoje then
    raise exception 'O Mensal só pode ser reajustado 12 meses depois do início ou do último reajuste (liberado em %).',
      to_char((coalesce(v_base, v_hoje) + interval '12 months')::date, 'DD/MM/YYYY');
  end if;

  select valor_sistema into v_atual from public.zela_cobrancas
   where contratacao_id = v_ct.id and tipo = 'parcela' and status <> 'cancelada'
   order by numero desc limit 1;
  if v_atual is null or v_atual <= 0 then raise exception 'Valor atual da assinatura não encontrado.'; end if;
  v_novo := round(v_atual * (1 + round(p_percentual, 2) / 100.0), 2);

  insert into public.zela_reajustes_mensal (school_id, contratacao_id, ipca_ano, percentual, valor_anterior, valor_novo, aplicado_por)
  values (v_ct.school_id, v_ct.id, p_ano_ipca, round(p_percentual, 2), v_atual, v_novo, auth.uid())
  returning id into v_id;

  return jsonb_build_object('reajuste_id', v_id, 'valor_anterior', v_atual, 'valor_novo', v_novo,
                            'subscription_id', v_ct.asaas_subscription_id, 'school_id', v_ct.school_id);
end;
$function$;

-- Renovação do Anual: confirma o rascunho. Cria o contrato novo pela mesma RPC do modal (mesmas regras de
-- plano, faixa e condição) e depois aplica o valor reajustado e zera a implantação, que não se repete.
create or replace function public.zela_renovacao_confirmar(p_renovacao_id uuid, p_primeiro_vencimento date default null)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_r public.zela_renovacoes%rowtype;
  v_o public.school_contratacoes%rowtype;
  v_cfg public.zela_config_comercial%rowtype;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_prim date;
  v_new uuid;
  v_nova public.school_contratacoes%rowtype;
  v_total numeric(12,2);
  v_parc numeric(12,2);
begin
  perform public.zela_exigir_developer();
  select * into v_r from public.zela_renovacoes where id = p_renovacao_id for update;
  if not found then raise exception 'Renovação não encontrada.'; end if;
  if v_r.status <> 'rascunho' then raise exception 'Renovação já % não pode ser confirmada.', v_r.status; end if;
  select * into v_o from public.school_contratacoes where id = v_r.origem_id for update;
  if v_o.status <> 'ativa' then raise exception 'O contrato de origem não está ativo (atual: %).', v_o.status; end if;
  if v_o.condicao_chave is null then
    raise exception 'Contrato antigo, sem condição de pagamento. Renove pelo modal Contratar.';
  end if;
  select * into v_cfg from public.zela_config_comercial where id;

  v_prim := coalesce(p_primeiro_vencimento, greatest(v_o.fim, v_hoje + v_cfg.vencimento_primeira_dias));
  v_new := public.contratar_plano_com_condicao(
    v_o.school_id, v_o.plano_id, v_o.condicao_chave, v_o.alunos_contratados, v_o.itens,
    array(select jsonb_array_elements_text(coalesce(v_o.snapshot -> 'extras', '[]'::jsonb))),
    null, 0, null, v_o.fim, v_prim, null
  );
  select * into v_nova from public.school_contratacoes where id = v_new for update;

  v_total := round(v_r.novo_mensal * (1 - v_nova.desconto_condicao_percent / 100.0) * v_nova.meses, 2);
  update public.school_contratacoes
     set valor_mensal = v_r.novo_mensal,
         valor_ciclo = v_total,
         implantacao_desconto_tipo = 'valor',
         implantacao_desconto = implantacao_base,
         implantacao_final = 0,
         desconto_motivo = 'Renovação: a implantação não se repete',
         snapshot = snapshot || jsonb_build_object('reajuste_ipca', jsonb_build_object(
           'ano', v_r.ipca_ano, 'percentual', v_r.ipca_percent, 'base_mensal', v_r.base_mensal, 'renovacao_id', v_r.id))
   where id = v_new;

  -- Parcelas: total dividido pelo nº de parcelas, centavos que sobram na última (igual à RPC de contratação).
  v_parc := round(v_total / v_nova.parcelas, 2);
  update public.zela_cobrancas
     set valor_implantacao = 0,
         valor_sistema = case when numero = v_nova.parcelas then v_total - v_parc * (v_nova.parcelas - 1) else v_parc end
   where contratacao_id = v_new and tipo = 'parcela';

  update public.zela_renovacoes
     set status = 'confirmada', nova_id = v_new, decidido_por = auth.uid(), decidido_em = now()
   where id = v_r.id;
  return v_new;
end;
$function$;

create or replace function public.zela_renovacao_descartar(p_renovacao_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  perform public.zela_exigir_developer();
  update public.zela_renovacoes
     set status = 'descartada', decidido_por = auth.uid(), decidido_em = now()
   where id = p_renovacao_id and status = 'rascunho';
  if not found then raise exception 'Só renovação em rascunho pode ser descartada.'; end if;
end;
$function$;

-- Rotina diária (cron). Idempotente. Não chama o Asaas: o status vencido também chega pelo webhook.
create or replace function public.zela_faturamento_rotina()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_cfg public.zela_config_comercial%rowtype;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_vencidas integer;
  v_suspensas integer;
  v_rascunhos integer;
  v_sem_ipca integer;
  v_ipca public.zela_ipca_anual%rowtype;
begin
  select * into v_cfg from public.zela_config_comercial where id;

  update public.zela_cobrancas set status = 'vencida'
   where status = 'pendente' and vencimento < v_hoje;
  get diagnostics v_vencidas = row_count;

  with s as (
    update public.school_contratacoes c set status = 'suspensa'
     where c.status = 'ativa' and exists (
       select 1 from public.zela_cobrancas b
        where b.contratacao_id = c.id and b.status = 'vencida'
          and b.vencimento + v_cfg.carencia_dias <= v_hoje)
    returning c.school_id
  )
  update public.schools set is_active = false where id in (select school_id from s);
  get diagnostics v_suspensas = row_count;

  select * into v_ipca from public.zela_ipca_anual order by ano desc limit 1;
  with candidatos as (
    select c.id, c.school_id, c.valor_mensal, c.fim
      from public.school_contratacoes c
     where c.status = 'ativa' and c.ciclo = 'ANUAL'
       and c.fim - v_hoje <= v_cfg.renovacao_antecedencia_dias
       and not exists (select 1 from public.zela_renovacoes r
                        where r.origem_id = c.id and r.status in ('rascunho', 'confirmada'))
  ), novos as (
    insert into public.zela_renovacoes (school_id, origem_id, ipca_ano, ipca_percent, base_mensal, novo_mensal)
    select k.school_id, k.id, v_ipca.ano, v_ipca.percentual, k.valor_mensal,
           round(k.valor_mensal * (1 + v_ipca.percentual / 100.0), 2)
      from candidatos k
     where v_ipca.ano is not null and v_ipca.ano >= extract(year from k.fim)::integer - 1
    returning 1
  )
  select (select count(*) from novos), (select count(*) from candidatos) - (select count(*) from novos)
    into v_rascunhos, v_sem_ipca;

  return jsonb_build_object('vencidas', v_vencidas, 'suspensas', v_suspensas,
                            'rascunhos_renovacao', v_rascunhos, 'renovacoes_sem_ipca', v_sem_ipca);
end;
$function$;

revoke execute on function public.zela_ipca_registrar(integer, numeric) from public, anon;
revoke execute on function public.zela_reajuste_mensal_registrar(uuid, integer, numeric) from public, anon;
revoke execute on function public.zela_renovacao_confirmar(uuid, date) from public, anon;
revoke execute on function public.zela_renovacao_descartar(uuid) from public, anon;
grant execute on function public.zela_ipca_registrar(integer, numeric) to authenticated;
grant execute on function public.zela_reajuste_mensal_registrar(uuid, integer, numeric) to authenticated;
grant execute on function public.zela_renovacao_confirmar(uuid, date) to authenticated;
grant execute on function public.zela_renovacao_descartar(uuid) to authenticated;
revoke execute on function public.zela_faturamento_rotina() from public, anon, authenticated;
grant execute on function public.zela_faturamento_rotina() to service_role;
