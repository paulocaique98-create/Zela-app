-- NFS-e via Asaas, fase 1 (PLANO_EXPANSAO_GESTAO.md item 15; docs/PLANO_NFSE_ASAAS.md).
-- Só tabelas, funções e policies novas: nada existente é alterado ou apagado. NÃO aplicada sem pedido.
--  * Módulo `nfse` (adicional, desligado): schools.features_enabled->>'nfse'.
--  * Vale para qualquer município do Brasil: município e inscrição municipal já vivem em schools
--    (codigo_ibge, inscricao_municipal); aqui ficam código de serviço e alíquotas POR ESCOLA, sem
--    valor padrão de imposto. A escola (com a contabilidade dela) preenche e confirma; só a Gestão grava.
--  * A configuração só pode ficar ativa com: código de serviço, ISS informado, alíquotas confirmadas
--    (quem e quando), código IBGE e inscrição municipal da escola.
--  * Notas (`financial_invoices`): só a Gestão lê; quem grava é o webhook/Edge Function (service_role).
--  * Nenhuma credencial aqui: o token do Asaas continua no Vault (school_gateway_accounts).

-- ═══ 1. Tabelas ═══
create table if not exists public.school_fiscal_config (
  school_id uuid primary key references public.schools(id) on delete cascade,
  ativo boolean not null default false,
  -- Código do serviço no município (ex.: "1.01" ou o código da prefeitura) e seu nome.
  municipal_service_id text check (municipal_service_id is null or length(btrim(municipal_service_id)) between 1 and 20),
  municipal_service_name text check (municipal_service_name is null or length(btrim(municipal_service_name)) between 1 and 200),
  observacoes text check (observacoes is null or length(observacoes) <= 300),
  -- Alíquotas em percentual. ISS fica nulo até a escola informar; os demais começam em zero.
  iss_percent numeric(5,2) check (iss_percent is null or iss_percent between 0 and 100),
  retain_iss boolean not null default false,
  pis_percent numeric(5,2) not null default 0 check (pis_percent between 0 and 100),
  cofins_percent numeric(5,2) not null default 0 check (cofins_percent between 0 and 100),
  csll_percent numeric(5,2) not null default 0 check (csll_percent between 0 and 100),
  inss_percent numeric(5,2) not null default 0 check (inss_percent between 0 and 100),
  ir_percent numeric(5,2) not null default 0 check (ir_percent between 0 and 100),
  aliquotas_confirmadas_em timestamptz,
  aliquotas_confirmadas_por uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.users(id) on delete set null
);

create table if not exists public.financial_invoices (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  contract_id uuid references public.financial_contracts(id) on delete set null,
  charge_id uuid references public.financial_charges(id) on delete set null,
  gateway_invoice_id text not null check (length(gateway_invoice_id) between 5 and 80),
  status text not null check (status in ('SCHEDULED', 'SYNCHRONIZED', 'AUTHORIZED', 'PROCESSING_CANCELLATION',
                                         'CANCELED', 'CANCELLATION_DENIED', 'ERROR')),
  invoice_number text check (invoice_number is null or length(invoice_number) <= 40),
  validation_code text check (validation_code is null or length(validation_code) <= 80),
  pdf_url text check (pdf_url is null or length(pdf_url) <= 500),
  xml_url text check (xml_url is null or length(xml_url) <= 500),
  value_cents integer check (value_cents is null or value_cents >= 0),
  error_reason text check (error_reason is null or length(error_reason) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, gateway_invoice_id)
);
create index if not exists idx_financial_invoices_contract on public.financial_invoices(contract_id);
create index if not exists idx_financial_invoices_charge on public.financial_invoices(charge_id);
create index if not exists idx_financial_invoices_escola_status on public.financial_invoices(school_id, status);

alter table public.school_fiscal_config enable row level security;
alter table public.financial_invoices enable row level security;
revoke all on public.school_fiscal_config from anon;
revoke all on public.financial_invoices from anon;

-- ═══ 2. Quem pode usar ═══
create or replace function public.nfse_modulo_ligado()
returns boolean
language sql stable security definer
set search_path to 'public'
as $$
  select coalesce((select (s.features_enabled ->> 'nfse') = 'true'
                     from public.schools s
                    where s.id = public.get_my_school_id()), false);
$$;

create or replace function public.nfse_pode_gerir()
returns boolean
language sql stable security definer
set search_path to 'public'
as $$
  select public.nfse_modulo_ligado() and coalesce(public.get_my_role(), '') = 'gestao';
$$;

revoke execute on function public.nfse_modulo_ligado() from public, anon;
revoke execute on function public.nfse_pode_gerir() from public, anon;
grant execute on function public.nfse_modulo_ligado() to authenticated;
grant execute on function public.nfse_pode_gerir() to authenticated;

-- ═══ 3. Validação e carimbo de confirmação ═══
create or replace function public.school_fiscal_config_valida()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  esc record;
begin
  new.updated_at := now();
  new.updated_by := auth.uid();

  -- Qualquer mudança de alíquota ou de serviço invalida a confirmação anterior.
  if tg_op = 'UPDATE' and (
       new.iss_percent is distinct from old.iss_percent
    or new.retain_iss is distinct from old.retain_iss
    or new.pis_percent <> old.pis_percent
    or new.cofins_percent <> old.cofins_percent
    or new.csll_percent <> old.csll_percent
    or new.inss_percent <> old.inss_percent
    or new.ir_percent <> old.ir_percent
    or new.municipal_service_id is distinct from old.municipal_service_id
  ) and new.aliquotas_confirmadas_em is not distinct from old.aliquotas_confirmadas_em then
    new.aliquotas_confirmadas_em := null;
    new.aliquotas_confirmadas_por := null;
  end if;

  -- A confirmação é sempre de quem está logado, nunca de valor vindo do cliente.
  if new.aliquotas_confirmadas_em is not null
     and (tg_op = 'INSERT' or new.aliquotas_confirmadas_em is distinct from old.aliquotas_confirmadas_em) then
    new.aliquotas_confirmadas_em := now();
    new.aliquotas_confirmadas_por := auth.uid();
  end if;

  if new.ativo then
    select codigo_ibge, inscricao_municipal into esc from public.schools where id = new.school_id;
    if new.municipal_service_id is null or new.municipal_service_name is null then
      raise exception 'Informe o código e o nome do serviço antes de ativar a nota fiscal.';
    end if;
    if new.iss_percent is null then
      raise exception 'Informe a alíquota de ISS antes de ativar a nota fiscal.';
    end if;
    if new.aliquotas_confirmadas_em is null then
      raise exception 'Confirme as alíquotas com a contabilidade antes de ativar a nota fiscal.';
    end if;
    if coalesce(esc.codigo_ibge, '') = '' or coalesce(btrim(esc.inscricao_municipal), '') = '' then
      raise exception 'Preencha o código do município (IBGE) e a inscrição municipal da escola antes de ativar a nota fiscal.';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_school_fiscal_config_valida on public.school_fiscal_config;
create trigger trg_school_fiscal_config_valida before insert or update on public.school_fiscal_config
  for each row execute function public.school_fiscal_config_valida();

-- ═══ 4. Policies ═══
-- Configuração fiscal: só a Gestão da própria escola, com o módulo ligado.
create policy "Nfse gestao le configuracao fiscal" on public.school_fiscal_config
  for select using (school_id = public.get_my_school_id() and public.nfse_pode_gerir());
create policy "Nfse gestao cria configuracao fiscal" on public.school_fiscal_config
  for insert with check (school_id = public.get_my_school_id() and public.nfse_pode_gerir());
create policy "Nfse gestao edita configuracao fiscal" on public.school_fiscal_config
  for update using (school_id = public.get_my_school_id() and public.nfse_pode_gerir())
  with check (school_id = public.get_my_school_id() and public.nfse_pode_gerir());

-- Notas: só a Gestão da escola lê, com o módulo ligado (financeiro é da Gestão; a Recepção não entra).
-- Sem policy de escrita: só o service_role (webhook) grava.
create policy "Nfse gestao le notas" on public.financial_invoices
  for select using (school_id = public.get_my_school_id() and public.nfse_pode_gerir());

-- ═══ 5. Contrato: se a nota ficou configurada no Asaas ═══
-- Preenchido só pelo servidor (service_role). nfse_erro guarda o motivo curto quando a configuração
-- falhou; a mensalidade continua funcionando mesmo assim.
alter table public.financial_contracts
  add column if not exists nfse_configurada_em timestamptz,
  add column if not exists nfse_erro text check (nfse_erro is null or length(nfse_erro) <= 300);

-- ═══ 6. Cobranças avulsas e preço ═══
-- A nota das avulsas (matrícula, eventos) é escolha da escola; começa desligada.
alter table public.school_fiscal_config
  add column if not exists emitir_avulsas boolean not null default false;

-- Preço provisório (fora de pacotes; o Zela ajusta depois pelo Portal do Dev).
insert into public.zela_modulo_precos (item_id, tipo_cobranca, valor, custo_estimado, chaves)
values ('nfse', 'por_aluno', 1.00, 0.10, array['nfse'])
on conflict (item_id) do nothing;
