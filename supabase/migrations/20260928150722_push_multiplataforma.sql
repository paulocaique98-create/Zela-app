-- Inscrições de notificação para web E para os apps (PLANO_APPS_MOBILE.md,
-- Fase 3). Hoje só existe 'web' (Web Push do navegador); os apps Android e
-- iOS vão gravar um token do FCM. Nada muda para as inscrições atuais:
-- todas viram platform = 'web'.

alter table public.push_subscriptions add column if not exists platform text not null default 'web';
alter table public.push_subscriptions add column if not exists token text;
alter table public.push_subscriptions add column if not exists app_version text;
alter table public.push_subscriptions add column if not exists last_seen_at timestamptz;

alter table public.push_subscriptions alter column endpoint drop not null;
alter table public.push_subscriptions alter column p256dh drop not null;
alter table public.push_subscriptions alter column auth drop not null;

alter table public.push_subscriptions drop constraint if exists push_subscriptions_platform_check;
alter table public.push_subscriptions add constraint push_subscriptions_platform_check
  check (platform in ('web', 'android', 'ios'));

-- Web precisa das 3 chaves do navegador; app precisa do token.
alter table public.push_subscriptions drop constraint if exists push_subscriptions_dados_por_plataforma;
alter table public.push_subscriptions add constraint push_subscriptions_dados_por_plataforma
  check (
    (platform = 'web' and endpoint is not null and p256dh is not null and auth is not null)
    or (platform in ('android', 'ios') and token is not null)
  );

-- Um aparelho (token) pertence a uma conta por vez: o app faz upsert pelo
-- token ao logar, e a conta anterior no mesmo celular deixa de receber.
alter table public.push_subscriptions drop constraint if exists push_subscriptions_token_key;
alter table public.push_subscriptions add constraint push_subscriptions_token_key unique (token);
