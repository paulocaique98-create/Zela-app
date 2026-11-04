-- Assinatura no portal da escola (plano de faturamento, item 10). Só leitura.
-- minhas_parcelas_zela(): todas as parcelas e implantações que o Zela cobra da escola do usuário.
--  * Só a Gestão recebe dados. Qualquer outro perfil (inclusive developer) e usuário sem escola recebem lista vazia.
--  * school_id vem só de users (nunca de parâmetro). Não usa get_my_school_id(), para a Gestão de uma escola
--    suspensa ainda enxergar as parcelas (a tela de bloqueio já mostra o link da vencida).
--  * Devolve só o que a tela precisa. Ficam de fora ids do Asaas, comprovante e quem marcou como paga.
--  * O link de pagamento só vai nas parcelas pendentes ou vencidas.
-- Nenhuma tabela, policy ou dado é alterado. Reversível: drop function public.minhas_parcelas_zela().

create or replace function public.minhas_parcelas_zela()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_role text;
  v_school uuid;
begin
  select u.role, u.school_id into v_role, v_school from public.users u where u.id = auth.uid();
  if v_role is distinct from 'gestao' or v_school is null then
    return '[]'::jsonb;
  end if;

  return coalesce((
    select jsonb_agg(x.linha order by x.vencimento, x.numero)
      from (
        select b.vencimento, b.numero,
               jsonb_build_object(
                 'tipo', b.tipo,
                 'numero', b.numero,
                 'competencia', b.competencia,
                 'vencimento', b.vencimento,
                 'valor', b.valor,
                 'status', b.status,
                 'paga_em', b.paga_em,
                 'invoice_url', case when b.status in ('pendente', 'vencida') then b.invoice_url else null end,
                 'contrato_ciclo', c.ciclo,
                 'contrato_status', c.status
               ) as linha
          from public.zela_cobrancas b
          join public.school_contratacoes c on c.id = b.contratacao_id
         where b.school_id = v_school
      ) x
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.minhas_parcelas_zela() from public, anon;
grant execute on function public.minhas_parcelas_zela() to authenticated, service_role;
