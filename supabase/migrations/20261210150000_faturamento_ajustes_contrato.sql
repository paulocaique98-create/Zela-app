-- Faturamento do Zela Edu, fase 4 (9B): ajustes na ficha do contrato (PLANO_FATURAMENTO_ZELA.md, seção 7B).
-- Só developer, motivo obrigatório, quem e quando, antes e depois. Parcela paga (ou cancelada, estornada) nunca muda.
--  - zela_cobranca_ajustes: auditoria. Sem policy de escrita: só as RPCs abaixo (security definer) gravam.
--  - zela_ajustar_vencimentos: novo vencimento em lote (pendente ou vencida, de hoje em diante).
--  - zela_reparcelar_saldo: cancela parcelas abertas escolhidas e recria o saldo em N parcelas (mesmo total).
--  - zela_aplicar_desconto_mensalidade: percentual da configuração, a partir de uma parcela, só pendentes futuras.
--    Calcula sempre sobre o valor original (zela_cobrancas.valor_sistema_original), então não acumula.
--    Recusa Mensal com assinatura recorrente no Asaas (decisão de 03/11).
-- A sincronização com o Asaas é da Edge Function create-zela-charge (service role marca o ajuste como sincronizado).

alter table public.zela_cobrancas add column if not exists valor_sistema_original numeric(12,2);

create table if not exists public.zela_cobranca_ajustes (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  contratacao_id uuid not null references public.school_contratacoes(id) on delete cascade,
  tipo text not null check (tipo in ('vencimentos', 'reparcelamento', 'desconto_mensalidade')),
  motivo text not null check (length(btrim(motivo)) >= 3 and length(motivo) <= 500),
  antes jsonb not null,
  depois jsonb not null,
  feito_por uuid not null,
  feito_em timestamptz not null default now(),
  sincronizado_asaas boolean not null default false,
  sincronizado_em timestamptz,
  erro_asaas text
);
create index if not exists zela_cobranca_ajustes_contrato_idx on public.zela_cobranca_ajustes (contratacao_id, feito_em desc);

alter table public.zela_cobranca_ajustes enable row level security;
revoke all on public.zela_cobranca_ajustes from anon, authenticated;
grant select on public.zela_cobranca_ajustes to authenticated;

drop policy if exists "Developer le os ajustes de cobranca" on public.zela_cobranca_ajustes;
create policy "Developer le os ajustes de cobranca" on public.zela_cobranca_ajustes
  for select to authenticated using (public.get_my_role() = 'developer');

-- Vencimentos em lote. p_itens: [{ "cobranca_id": uuid, "vencimento": "AAAA-MM-DD" }]
create or replace function public.zela_ajustar_vencimentos(p_contratacao_id uuid, p_itens jsonb, p_motivo text)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_ct public.school_contratacoes%rowtype;
  v_item jsonb;
  v_cb public.zela_cobrancas%rowtype;
  v_venc date;
  v_antes jsonb := '[]'::jsonb;
  v_depois jsonb := '[]'::jsonb;
  v_id uuid;
begin
  perform public.zela_exigir_developer();
  if p_motivo is null or length(btrim(p_motivo)) < 3 then raise exception 'Informe o motivo do ajuste.'; end if;
  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 or jsonb_array_length(p_itens) > 60 then
    raise exception 'Informe de 1 a 60 parcelas.';
  end if;
  select * into v_ct from public.school_contratacoes where id = p_contratacao_id for update;
  if not found then raise exception 'Contratação não encontrada.'; end if;

  for v_item in select value from jsonb_array_elements(p_itens) loop
    v_venc := (v_item->>'vencimento')::date;
    if v_venc is null or v_venc < current_date then raise exception 'O novo vencimento não pode ser no passado.'; end if;
    select * into v_cb from public.zela_cobrancas
      where id = (v_item->>'cobranca_id')::uuid and contratacao_id = v_ct.id for update;
    if not found then raise exception 'Cobrança não pertence a este contrato.'; end if;
    if v_cb.status not in ('pendente', 'vencida') then
      raise exception 'A parcela % está % e não pode ser alterada.', v_cb.numero, v_cb.status;
    end if;
    v_antes := v_antes || jsonb_build_object('id', v_cb.id, 'tipo', v_cb.tipo, 'numero', v_cb.numero, 'vencimento', v_cb.vencimento, 'status', v_cb.status);
    update public.zela_cobrancas set vencimento = v_venc, status = 'pendente' where id = v_cb.id;
    v_depois := v_depois || jsonb_build_object('id', v_cb.id, 'tipo', v_cb.tipo, 'numero', v_cb.numero, 'vencimento', v_venc, 'status', 'pendente');
  end loop;

  insert into public.zela_cobranca_ajustes (school_id, contratacao_id, tipo, motivo, antes, depois, feito_por)
  values (v_ct.school_id, v_ct.id, 'vencimentos', btrim(p_motivo), v_antes, v_depois, auth.uid())
  returning id into v_id;
  return v_id;
end;
$function$;

-- Reparcelamento. p_cobranca_ids: parcelas abertas a juntar; p_vencimentos: um por parcela nova.
create or replace function public.zela_reparcelar_saldo(p_contratacao_id uuid, p_cobranca_ids uuid[], p_vencimentos date[], p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_ct public.school_contratacoes%rowtype;
  v_cb public.zela_cobrancas%rowtype;
  v_n integer := coalesce(array_length(p_vencimentos, 1), 0);
  v_qtd integer := coalesce(array_length(p_cobranca_ids, 1), 0);
  v_sis numeric(12,2) := 0;
  v_imp numeric(12,2) := 0;
  v_sis_p numeric(12,2);
  v_imp_p numeric(12,2);
  v_max integer;
  v_antes jsonb := '[]'::jsonb;
  v_depois jsonb := '[]'::jsonb;
  v_novas uuid[] := '{}';
  v_novo uuid;
  v_id uuid;
  i integer;
begin
  perform public.zela_exigir_developer();
  if p_motivo is null or length(btrim(p_motivo)) < 3 then raise exception 'Informe o motivo do ajuste.'; end if;
  if v_qtd = 0 or v_qtd > 60 then raise exception 'Escolha de 1 a 60 parcelas em aberto.'; end if;
  if v_n < 1 or v_n > 24 then raise exception 'O novo parcelamento aceita de 1 a 24 parcelas.'; end if;
  if exists (select 1 from unnest(p_vencimentos) d where d is null or d < current_date) then
    raise exception 'Os vencimentos não podem ser no passado.';
  end if;
  select * into v_ct from public.school_contratacoes where id = p_contratacao_id for update;
  if not found then raise exception 'Contratação não encontrada.'; end if;
  if v_ct.status not in ('aguardando_pagamento', 'ativa', 'suspensa') then
    raise exception 'Contratação % não aceita reparcelamento.', v_ct.status;
  end if;
  if v_ct.pagamento = 'mes_a_mes' and v_ct.asaas_subscription_id is not null then
    raise exception 'Contrato Mensal com assinatura recorrente no Asaas não aceita reparcelamento.';
  end if;

  for v_cb in
    select * from public.zela_cobrancas
     where contratacao_id = v_ct.id and id = any(p_cobranca_ids) order by numero for update
  loop
    if v_cb.tipo <> 'parcela' or v_cb.status not in ('pendente', 'vencida') then
      raise exception 'A cobrança % (%) não pode ser reparcelada: está %.', v_cb.numero, v_cb.tipo, v_cb.status;
    end if;
    v_sis := v_sis + v_cb.valor_sistema;
    v_imp := v_imp + v_cb.valor_implantacao;
    v_antes := v_antes || jsonb_build_object('id', v_cb.id, 'numero', v_cb.numero, 'vencimento', v_cb.vencimento,
      'status', v_cb.status, 'valor', v_cb.valor, 'asaas_payment_id', v_cb.asaas_payment_id);
  end loop;
  if jsonb_array_length(v_antes) <> (select count(distinct x) from unnest(p_cobranca_ids) x) then
    raise exception 'Alguma parcela escolhida não pertence a este contrato.';
  end if;

  update public.zela_cobrancas set status = 'cancelada'
   where contratacao_id = v_ct.id and id = any(p_cobranca_ids);

  select coalesce(max(numero), 0) into v_max from public.zela_cobrancas where contratacao_id = v_ct.id and tipo = 'parcela';
  v_sis_p := round(v_sis / v_n, 2);
  v_imp_p := round(v_imp / v_n, 2);
  for i in 1..v_n loop
    insert into public.zela_cobrancas (school_id, contratacao_id, tipo, numero, competencia, vencimento, valor_sistema, valor_implantacao)
    values (
      v_ct.school_id, v_ct.id, 'parcela', v_max + i, date_trunc('month', p_vencimentos[i])::date, p_vencimentos[i],
      case when i = v_n then v_sis - v_sis_p * (v_n - 1) else v_sis_p end,
      case when i = v_n then v_imp - v_imp_p * (v_n - 1) else v_imp_p end
    ) returning id into v_novo;
    v_novas := v_novas || v_novo;
    v_depois := v_depois || jsonb_build_object('id', v_novo, 'numero', v_max + i, 'vencimento', p_vencimentos[i],
      'valor', case when i = v_n then v_sis - v_sis_p * (v_n - 1) + v_imp - v_imp_p * (v_n - 1) else v_sis_p + v_imp_p end);
  end loop;

  insert into public.zela_cobranca_ajustes (school_id, contratacao_id, tipo, motivo, antes, depois, feito_por)
  values (v_ct.school_id, v_ct.id, 'reparcelamento', btrim(p_motivo), v_antes, v_depois, auth.uid())
  returning id into v_id;
  return jsonb_build_object('ajuste_id', v_id, 'novas', to_jsonb(v_novas));
end;
$function$;

-- Desconto na mensalidade a partir da parcela p_a_partir (p_percentual 0 remove o desconto).
create or replace function public.zela_aplicar_desconto_mensalidade(p_contratacao_id uuid, p_a_partir integer, p_percentual numeric, p_motivo text)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_ct public.school_contratacoes%rowtype;
  v_cb public.zela_cobrancas%rowtype;
  v_opcoes numeric[];
  v_base numeric(12,2);
  v_novo numeric(12,2);
  v_antes jsonb := '[]'::jsonb;
  v_depois jsonb := '[]'::jsonb;
  v_id uuid;
begin
  perform public.zela_exigir_developer();
  if p_motivo is null or length(btrim(p_motivo)) < 3 then raise exception 'Informe o motivo do ajuste.'; end if;
  if p_a_partir is null or p_a_partir < 1 then raise exception 'Informe a partir de qual parcela.'; end if;
  select desconto_mensalidade_opcoes into v_opcoes from public.zela_config_comercial where id = true;
  if p_percentual is null or p_percentual < 0 or p_percentual >= 100
     or (p_percentual <> 0 and not (p_percentual = any(coalesce(v_opcoes, '{}')))) then
    raise exception 'Percentual fora das opções da Configuração do faturamento.';
  end if;
  select * into v_ct from public.school_contratacoes where id = p_contratacao_id for update;
  if not found then raise exception 'Contratação não encontrada.'; end if;
  if v_ct.status not in ('aguardando_pagamento', 'ativa', 'suspensa') then
    raise exception 'Contratação % não aceita desconto.', v_ct.status;
  end if;
  if v_ct.pagamento = 'mes_a_mes' and v_ct.asaas_subscription_id is not null then
    raise exception 'Contrato Mensal com assinatura recorrente no Asaas não aceita desconto por parcela.';
  end if;

  for v_cb in
    select * from public.zela_cobrancas
     where contratacao_id = v_ct.id and tipo = 'parcela' and numero >= p_a_partir
       and status = 'pendente' and vencimento >= current_date
     order by numero for update
  loop
    v_base := coalesce(v_cb.valor_sistema_original, v_cb.valor_sistema);
    v_novo := round(v_base * (1 - p_percentual / 100.0), 2);
    if v_novo + v_cb.valor_implantacao <= 0 then raise exception 'A parcela % ficaria sem valor.', v_cb.numero; end if;
    v_antes := v_antes || jsonb_build_object('id', v_cb.id, 'numero', v_cb.numero, 'valor', v_cb.valor, 'valor_sistema', v_cb.valor_sistema);
    update public.zela_cobrancas
       set valor_sistema = v_novo,
           valor_sistema_original = case when p_percentual = 0 then null else v_base end
     where id = v_cb.id;
    v_depois := v_depois || jsonb_build_object('id', v_cb.id, 'numero', v_cb.numero, 'valor', v_novo + v_cb.valor_implantacao,
      'valor_sistema', v_novo, 'percentual', p_percentual);
  end loop;
  if jsonb_array_length(v_antes) = 0 then raise exception 'Nenhuma parcela futura em aberto a partir da parcela %.', p_a_partir; end if;

  insert into public.zela_cobranca_ajustes (school_id, contratacao_id, tipo, motivo, antes, depois, feito_por)
  values (v_ct.school_id, v_ct.id, 'desconto_mensalidade', btrim(p_motivo), v_antes, v_depois, auth.uid())
  returning id into v_id;
  return v_id;
end;
$function$;

revoke execute on function public.zela_ajustar_vencimentos(uuid, jsonb, text) from public, anon;
revoke execute on function public.zela_reparcelar_saldo(uuid, uuid[], date[], text) from public, anon;
revoke execute on function public.zela_aplicar_desconto_mensalidade(uuid, integer, numeric, text) from public, anon;
grant execute on function public.zela_ajustar_vencimentos(uuid, jsonb, text) to authenticated;
grant execute on function public.zela_reparcelar_saldo(uuid, uuid[], date[], text) to authenticated;
grant execute on function public.zela_aplicar_desconto_mensalidade(uuid, integer, numeric, text) to authenticated;
