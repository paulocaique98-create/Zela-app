-- Diagnostico temporario: o envio de push (webpush.sendNotification) falhava
-- em silencio sempre que o erro nao era 410/404 (subscription morta) --
-- nenhum log ficava registrado em lugar nenhum acessivel, entao nao dava pra
-- saber POR QUE um push especifico nao chegou no aparelho do responsavel.
-- Esta tabela guarda o resultado de cada tentativa de envio (sucesso ou
-- motivo da falha) pra permitir diagnostico real do problema relatado em
-- producao (push de checkout nao chegou pro pai da Maite Oliveira Santana).
create table if not exists push_delivery_attempts (
  id uuid primary key default gen_random_uuid(),
  family_id uuid,
  endpoint text,
  success boolean not null,
  status_code int,
  error_message text,
  created_at timestamptz not null default now()
);

alter table push_delivery_attempts enable row level security;

-- Só a service role (Edge Functions) escreve/lê aqui; não é dado de família.
create policy "service role only" on push_delivery_attempts
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
