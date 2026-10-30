-- Faturamento do Zela Edu (PLANO_FATURAMENTO_ZELA.md, item 2).
-- zela_cobrancas: cada link de pagamento da escola ao Zela (conta Asaas oficial do Zela, não a da escola).
-- zela_billing_eventos: ids dos eventos do webhook, para a idempotência.
-- RLS: developer lê tudo; a Gestão da escola lê só as cobranças da própria escola; ninguém grava pelo
-- cliente (escrita só pelo servidor: RPC security definer e Edge Functions com service_role).
-- Nada aqui toca as tabelas de cobrança escola->família (create-payment e payment-webhook seguem iguais).

create table if not exists public.zela_cobrancas (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  contratacao_id uuid not null references public.school_contratacoes(id) on delete cascade,
  tipo text not null default 'parcela' check (tipo in ('parcela', 'implantacao')),
  numero integer not null check (numero >= 1),
  competencia date not null,
  vencimento date not null,
  valor_sistema numeric(12,2) not null check (valor_sistema >= 0),
  valor_implantacao numeric(12,2) not null default 0 check (valor_implantacao >= 0),
  valor numeric(12,2) generated always as (valor_sistema + valor_implantacao) stored,
  status text not null default 'pendente' check (status in ('pendente', 'paga', 'vencida', 'cancelada', 'estornada')),
  asaas_customer_id text,
  asaas_payment_id text unique,
  invoice_url text,
  paga_em timestamptz,
  paga_manual boolean not null default false,
  marcada_paga_por uuid,
  marcada_paga_em timestamptz,
  comprovante text check (comprovante is null or length(comprovante) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (contratacao_id, tipo, numero)
);
create index if not exists zela_cobrancas_school_idx on public.zela_cobrancas (school_id, vencimento);
create index if not exists zela_cobrancas_status_idx on public.zela_cobrancas (status, vencimento);

create table if not exists public.zela_billing_eventos (
  event_id text primary key,
  evento text not null,
  asaas_payment_id text,
  cobranca_id uuid references public.zela_cobrancas(id) on delete set null,
  payload jsonb,
  recebido_em timestamptz not null default now()
);
create index if not exists zela_billing_eventos_cobranca_idx on public.zela_billing_eventos (cobranca_id);

create or replace function public.zela_cobrancas_carimbar()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  new.updated_at := now();
  return new;
end;
$function$;
revoke execute on function public.zela_cobrancas_carimbar() from public, anon, authenticated;

drop trigger if exists zela_cobrancas_carimbar_trg on public.zela_cobrancas;
create trigger zela_cobrancas_carimbar_trg before update on public.zela_cobrancas
for each row execute function public.zela_cobrancas_carimbar();

alter table public.zela_cobrancas enable row level security;
alter table public.zela_billing_eventos enable row level security;

revoke all on public.zela_cobrancas, public.zela_billing_eventos from anon;
revoke insert, update, delete on public.zela_cobrancas, public.zela_billing_eventos from authenticated;
grant select on public.zela_cobrancas, public.zela_billing_eventos to authenticated;

drop policy if exists "Developer le as cobrancas do Zela" on public.zela_cobrancas;
create policy "Developer le as cobrancas do Zela" on public.zela_cobrancas
  for select to authenticated using (public.get_my_role() = 'developer');

-- Gestão lê só as cobranças da própria escola. get_my_school_id() é NULL para escola suspensa
-- (20261012130000), então a escola bloqueada vê o link da cobrança por função própria (etapa do bloqueio).
drop policy if exists "Gestao le as cobrancas da propria escola" on public.zela_cobrancas;
create policy "Gestao le as cobrancas da propria escola" on public.zela_cobrancas
  for select to authenticated using (
    public.get_my_role() = 'gestao' and school_id = public.get_my_school_id()
  );

drop policy if exists "Developer le os eventos de cobranca" on public.zela_billing_eventos;
create policy "Developer le os eventos de cobranca" on public.zela_billing_eventos
  for select to authenticated using (public.get_my_role() = 'developer');
