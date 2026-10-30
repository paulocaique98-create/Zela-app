-- Régua de cobrança, WhatsApp pelas notificações nativas do Asaas (decisão D12, opção a).
-- Só uma coluna com default, uma tabela nova e a ampliação de um CHECK; nada é apagado.
--  * billing_rules.whatsapp_asaas: interruptor por escola (desligado). Ligar faz a Edge Function
--    sync-asaas-whatsapp ativar o WhatsApp nas notificações dos clientes da própria conta Asaas da escola.
--  * billing_channel_prefs aceita o canal 'whatsapp' (o responsável pode desligar; o servidor respeita).
--  * asaas_whatsapp_sync guarda o que já foi aplicado em cada cliente do Asaas, para a sincronização
--    ser incremental. Só leitura para a Gestão; a escrita é do service_role.

alter table public.billing_rules
  add column if not exists whatsapp_asaas boolean not null default false;

alter table public.billing_channel_prefs drop constraint if exists billing_channel_prefs_canal_check;
alter table public.billing_channel_prefs
  add constraint billing_channel_prefs_canal_check check (canal in ('push', 'email', 'whatsapp'));

create table if not exists public.asaas_whatsapp_sync (
  school_id uuid not null references public.schools(id) on delete cascade,
  customer_id text not null check (length(customer_id) between 5 and 60),
  family_id uuid references public.users(id) on delete set null,
  aplicado boolean not null default false,
  telefone text check (telefone is null or length(telefone) <= 15),
  erro text check (erro is null or length(erro) <= 300),
  atualizado_em timestamptz not null default now(),
  primary key (school_id, customer_id)
);
create index if not exists idx_asaas_whatsapp_sync_familia on public.asaas_whatsapp_sync(family_id);

alter table public.asaas_whatsapp_sync enable row level security;

create policy "Regua gestao le sincronia do whatsapp" on public.asaas_whatsapp_sync
  for select using (school_id = public.get_my_school_id() and public.regua_pode_gerir());
