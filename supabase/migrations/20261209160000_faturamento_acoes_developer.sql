-- Faturamento do Zela Edu, etapa B (PLANO_FATURAMENTO_ZELA.md, item 9).
-- Ações manuais do Portal do Dev sobre cobranças e contratações. A tabela zela_cobrancas continua sem
-- policy de escrita: tudo passa por estas funções (security definer, só developer, validadas no servidor).
-- Estas ações mexem só no banco do Zela; a sincronização com o Asaas (novo vencimento, cancelamento) é da etapa C.
--  - zela_cobranca_marcar_paga: baixa manual; ativa a contratação (aguardando_pagamento) ou reativa a
--    suspensa quando não restar parcela vencida.
--  - zela_cobranca_novo_vencimento: pendente ou vencida, data de hoje em diante.
--  - zela_cobranca_cancelar: pendente ou vencida.
--  - zela_contratacao_cancelar_pendente: só contratação aguardando_pagamento; cancela também as parcelas em aberto.
--  - zela_contratacao_suspender / zela_contratacao_reativar: suspensão derruba o acesso da escola (schools.is_active).

create or replace function public.zela_exigir_developer()
returns void
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
begin
  if coalesce(public.get_my_role(), '') <> 'developer' then
    raise exception 'Apenas o suporte (developer) pode alterar o faturamento.';
  end if;
end;
$function$;
revoke execute on function public.zela_exigir_developer() from public, anon;
grant execute on function public.zela_exigir_developer() to authenticated;

create or replace function public.zela_cobranca_marcar_paga(p_cobranca_id uuid, p_comprovante text default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_cb public.zela_cobrancas%rowtype;
  v_status text;
begin
  perform public.zela_exigir_developer();
  if p_comprovante is not null and length(p_comprovante) > 500 then
    raise exception 'O comprovante aceita até 500 caracteres.';
  end if;

  select * into v_cb from public.zela_cobrancas where id = p_cobranca_id for update;
  if not found then raise exception 'Cobrança não encontrada.'; end if;
  if v_cb.status not in ('pendente', 'vencida') then
    raise exception 'Só cobrança pendente ou vencida pode ser marcada como paga (atual: %).', v_cb.status;
  end if;

  update public.zela_cobrancas
     set status = 'paga', paga_em = now(), paga_manual = true,
         marcada_paga_por = auth.uid(), marcada_paga_em = now(),
         comprovante = nullif(btrim(p_comprovante), '')
   where id = v_cb.id;

  select status into v_status from public.school_contratacoes where id = v_cb.contratacao_id for update;
  if v_status = 'aguardando_pagamento' then
    perform public.zela_ativar_contratacao(v_cb.contratacao_id);
  elsif v_status = 'suspensa'
        and not exists (select 1 from public.zela_cobrancas where contratacao_id = v_cb.contratacao_id and status = 'vencida') then
    perform public.zela_ativar_contratacao(v_cb.contratacao_id);
  end if;
end;
$function$;

create or replace function public.zela_cobranca_novo_vencimento(p_cobranca_id uuid, p_vencimento date)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_cb public.zela_cobrancas%rowtype;
begin
  perform public.zela_exigir_developer();
  if p_vencimento is null or p_vencimento < current_date then
    raise exception 'O novo vencimento não pode ser no passado.';
  end if;
  select * into v_cb from public.zela_cobrancas where id = p_cobranca_id for update;
  if not found then raise exception 'Cobrança não encontrada.'; end if;
  if v_cb.status not in ('pendente', 'vencida') then
    raise exception 'Só cobrança pendente ou vencida aceita novo vencimento (atual: %).', v_cb.status;
  end if;
  update public.zela_cobrancas set vencimento = p_vencimento, status = 'pendente' where id = v_cb.id;
end;
$function$;

create or replace function public.zela_cobranca_cancelar(p_cobranca_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_cb public.zela_cobrancas%rowtype;
begin
  perform public.zela_exigir_developer();
  select * into v_cb from public.zela_cobrancas where id = p_cobranca_id for update;
  if not found then raise exception 'Cobrança não encontrada.'; end if;
  if v_cb.status not in ('pendente', 'vencida') then
    raise exception 'Só cobrança pendente ou vencida pode ser cancelada (atual: %).', v_cb.status;
  end if;
  update public.zela_cobrancas set status = 'cancelada' where id = v_cb.id;
end;
$function$;

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
end;
$function$;

create or replace function public.zela_contratacao_suspender(p_contratacao_id uuid)
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
  if v_ct.status <> 'ativa' then
    raise exception 'Só contratação ativa pode ser suspensa (atual: %).', v_ct.status;
  end if;
  update public.school_contratacoes set status = 'suspensa' where id = v_ct.id;
  update public.schools set is_active = false where id = v_ct.school_id;
end;
$function$;

create or replace function public.zela_contratacao_reativar(p_contratacao_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_status text;
begin
  perform public.zela_exigir_developer();
  select status into v_status from public.school_contratacoes where id = p_contratacao_id for update;
  if not found then raise exception 'Contratação não encontrada.'; end if;
  if v_status <> 'suspensa' then
    raise exception 'Só contratação suspensa pode ser reativada (atual: %).', v_status;
  end if;
  perform public.zela_ativar_contratacao(p_contratacao_id);
end;
$function$;

revoke execute on function public.zela_cobranca_marcar_paga(uuid, text) from public, anon;
revoke execute on function public.zela_cobranca_novo_vencimento(uuid, date) from public, anon;
revoke execute on function public.zela_cobranca_cancelar(uuid) from public, anon;
revoke execute on function public.zela_contratacao_cancelar_pendente(uuid) from public, anon;
revoke execute on function public.zela_contratacao_suspender(uuid) from public, anon;
revoke execute on function public.zela_contratacao_reativar(uuid) from public, anon;
grant execute on function public.zela_cobranca_marcar_paga(uuid, text) to authenticated;
grant execute on function public.zela_cobranca_novo_vencimento(uuid, date) to authenticated;
grant execute on function public.zela_cobranca_cancelar(uuid) to authenticated;
grant execute on function public.zela_contratacao_cancelar_pendente(uuid) to authenticated;
grant execute on function public.zela_contratacao_suspender(uuid) to authenticated;
grant execute on function public.zela_contratacao_reativar(uuid) to authenticated;
