# Runbook: migração do Supabase de Canada Central para São Paulo (sa-east-1)

Status: F0–F4 EXECUTADAS em 2026-11-13 (corte feito; F5 confirmada pelo usuário; F6/F7 pendentes). Criado em 2026-11-12.
Projeto atual (produção): `orafqopnomdrvwlvxrkz` (Canada Central). Neste documento: OLD_REF.
Projeto novo: NEW_REF (a criar em South America / São Paulo).

## 0. Princípios (valem para todo o processo)

1. **O projeto antigo nunca é alterado de forma destrutiva.** Só desligamos os crons e o colocamos em modo somente leitura (as duas ações são reversíveis). Ele é o rollback.
2. **A fonte da verdade é a PRODUÇÃO, não o repositório.** Várias migrations e Edge Functions existem só no local ou na main e NÃO estão em produção. Exemplos: Recepção só visualiza, guarda de bloqueio em 28 functions, Control iD fases 5/6 e token curto, `notify-families` sem `admin`. Por isso:
   - o schema vem de `pg_dump` da produção, nunca de `supabase db push` nem das migrations;
   - as Edge Functions vêm de `supabase functions download` da produção, nunca da main.
3. **Congelamento de mudanças:** a partir de agora e até o fim, nenhuma migration, nenhum deploy de function e nenhuma alteração de RLS na produção.
4. **Cada comando que toca a produção é confirmado antes de ser executado.** O Claude propõe e o usuário aprova.
5. **Dumps contêm biometria e dados de menores (LGPD, art. 11 e 14).**
   - Guardar só em pasta fora do repositório, em disco criptografado (ex.: `D:\zela-migracao\`, com BitLocker).
   - Nunca em `.scratch/`, nunca em commit, nunca em nuvem pessoal.
   - Apagar no D+30.
6. **Segredos** (senhas do banco, service_role, PAT) ficam só em variáveis de ambiente da sessão do terminal. Nunca em arquivo.
7. **Regras de aborto:**
   - Se o Go/No-Go 1 (fim da Fase 3) não estiver verde até **T+5h**, aborta. Sem impacto, porque a produção segue no Canadá.
   - Depois da abertura aos usuários (Go/No-Go 2) não há rollback sem perda de dados. Daí em diante, só correção para frente.

## 1. Linha do tempo (T = início)

| Fase | Quando | Downtime | Duração estimada |
|---|---|---|---|
| F0 Pré-requisitos e inventário | T+0 | não | 45 min |
| F1 Criar projetos | T+0:45 | não | 15 min |
| F2 Configurar o projeto definitivo (sem dados) | T+1:00 | não | 60 min |
| F3 Ensaio completo + cópia do Storage | T+1:00 (em paralelo) | não | 90–120 min |
| **Go/No-Go 1** | até T+5h | — | — |
| F4 Janela de corte | madrugada | **sim** | 45–90 min |
| F5 Smoke test + **Go/No-Go 2** | logo após | sim | 30 min |
| F6 Externos (Asaas, apps) + monitoramento | após abrir | não | manhã |
| F7 Pós-migração (D+1 a D+30) | — | não | — |

As durações de F3 e F4 dependem do tamanho do banco e do Storage, medidos em F0. Se o Storage tiver dezenas de GB, refazer a conta antes de seguir.

## F0. Pré-requisitos e inventário (só leitura na produção)

### F0.1 Ferramentas (máquina do usuário)
- [ ] Supabase CLI atualizado (`npx supabase --version`).
- [ ] Docker funcionando (`docker ps`). O `supabase db dump` depende dele. **Sem Docker = NO-GO.**
- [ ] `psql` versão ≥ à do Postgres de produção (instalar PostgreSQL client 17).
- [ ] `rclone` instalado (cópia do Storage via protocolo S3).
- [ ] Personal Access Token do Supabase (`SUPABASE_ACCESS_TOKEN`) para a Management API.
- [ ] Conexão pelo **Session pooler (IPv4, porta 5432)**. A conexão direta `db.<ref>.supabase.co` é só IPv6.

### F0.2 Segredos que o usuário precisa ter em mãos
O Supabase não devolve os valores dos secrets das Edge Functions; o painel mostra só o hash.

| Secret | Pode gerar novo? | Observação |
|---|---|---|
| VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT | **NÃO** | Chave nova invalida todas as inscrições de web push |
| FCM_SERVICE_ACCOUNT | não | JSON do Firebase |
| ASAAS_API_KEY, ASAAS_API_BASE_URL | não | |
| ZELA_ASAAS_API_KEY | não | |
| ZELA_BILLING_WEBHOOK_TOKEN | sim | Se for novo, atualizar no painel Asaas da Zela |
| RESEND_API_KEY, RESEND_FROM_EMAIL | não | |
| GEMINI_API_KEY, GEMINI_MODEL | não | |
| DAILY_RESET_AUTH_KEY, NOTIFY_CRITICAL_ERROR_AUTH_KEY | sim | Precisam bater com o que crons, Vault e triggers enviam |
| EXTRA_ALLOWED_ORIGINS | não | |
| Senha SMTP do Auth (Resend) | não | Não volta pela API |

SUPABASE_URL, SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY são injetados automaticamente pelo projeto novo.

### F0.3 Inventário da produção (consultas só de leitura, salvar a saída em D:\zela-migracao\inventario\)
1. Versão do Postgres e tamanho: `select version(); select pg_size_pretty(pg_database_size('postgres'));`
2. Storage por bucket (quantidade e bytes) em `storage.objects`. Os buckets conhecidos são: comunicados-anexos, matriculas-docs, mural-fotos, person-photos, student-documents.
3. Contagem exata de linhas de **todas** as tabelas de `public` e `auth` (script gera a lista; vira o gabarito da validação).
4. Extensões instaladas, com versão.
5. Crons reais: `select jobname, schedule, command, active from cron.job`. Usar isto, não `cron_jobs_producao.sql`, que pode estar desatualizado.
6. Nomes (não valores) dos segredos do Vault: `select name from vault.secrets`. **O Vault é criptografado com chave do projeto e não migra.** Os valores serão recriados.
7. Configurações de banco e roles: `select * from pg_db_role_setting` (ex.: timezone, statement_timeout).
8. Tabelas na publicação `supabase_realtime`.
9. Policies por schema (`public`, `storage`), com md5 da definição. Triggers em `auth.users` e em `storage.objects` (objetos custom fora de `public` NÃO vêm no dump padrão).
10. Funções, triggers e crons que contêm `orafqopnomdrvwlvxrkz` no corpo (`pg_proc.prosrc`, `cron.job.command`). Ex.: trigger de erro crítico e crons com URL fixa.
11. **Dados** que contêm `orafqopnomdrvwlvxrkz`, em colunas de texto (ex.: URLs públicas de fotos salvas em tabela).
12. Via Management API, salvar em JSON:
    - config de Auth (`GET /v1/projects/OLD_REF/config/auth`);
    - PostgREST (`/postgrest`: schemas expostos, `max_rows = 1000`);
    - Storage (limite de arquivo);
    - lista de functions com `verify_jwt`.
13. Add-ons da produção: compute, PITR, SSL enforcement, network restrictions.
14. Backup: baixar o backup diário mais recente pelo painel (cópia extra de segurança).

### F0.4 Respostas (12/11)
- Apps móveis: NÃO há usuários reais, só o web app (Vercel). Basta trocar as env vars na Vercel.
- Secrets: o usuário tem todos os valores guardados (conferir a lista de F0.2 item por item, sobretudo VAPID).
- Docker: instalado, mas o daemon estava parado no teste (abrir o Docker Desktop). psql/pg_dump: ausentes; usar via `docker run --rm postgres:17 ...`, sem instalar. rclone: ausente (`winget install Rclone.Rclone`).
- Asaas: nenhuma escola usa. Os itens Asaas de F6 viram só "atualizar a URL no painel da Zela, se houver webhook cadastrado". Confirmado (12/11): as 4 linhas em `school_gateway_accounts` (TESTE LTDA e Montessori de Vitória) e os `gateway_key:asaas*` do Vault são só teste de integração; não recriar.
- Totens/tablets: o usuário vai às escolas pela manhã para logar de novo.
- Control iD em produção: NÃO há equipamento apontando para a URL atual. O item Control iD de F6 não se aplica.
- rclone: instalado pelo usuário (12/11).

### F0.3 Resultados (12/11, itens 1–14 concluídos; saídas em D:\zela-migracao\inventario\)
- Postgres 17.6, 68 MB. Pooler da produção: `aws-1-ca-central-1.pooler.supabase.com:5432` (usuário `postgres.<ref>`).
- Storage: 10 buckets, todos privados; 162 objetos, ~59 MB (person-photos: 154 objetos, 58 MB). Buckets: comunicados-anexos, expense-attachments, incident-files, lesson-plans, library-covers, matriculas-docs, mural-fotos, person-photos, scholarships, student-documents.
- Gabarito de contagem: `f03_item3_contagens.txt` (193 tabelas). Policies: 440 (403 public, 37 storage.objects) com md5 em `f03_item9_policies.txt`.
- Extensões: pg_cron 1.6.4, pg_net 0.20.3 (schema public), supabase_vault 0.3.1, pgcrypto, unaccent (schema public), uuid-ossp, pg_stat_statements.
- Crons ativos: ids 1, 2, 4, 5, 7, 8 têm a URL do OLD_REF fixa (reescrever); 6 e 9 só chamam função SQL. Autenticam via `public.get_cron_secret(nome)`, que lê `public.cron_secrets (name -> vault_secret_id)` + Vault.
- Vault não migra. Recriar só 4 segredos (check_attendance_delays_auth_key, daily_reset_auth_key, financial_reminders_auth_key, notify_critical_error_auth_key) e religar `cron_secrets.vault_secret_id` no `pos_restore`. Os ~300 `vitest_gw_*` e `gateway_key:asaas*` são resíduo de teste (não recriar). `service_role_key` do Vault: nenhuma função de public o usa.
- Fora do dump padrão (recriar no `pos_restore`): triggers em `auth.users` (`contas_vinculadas_email_mudou`, `on_auth_password_changed_clear_flag`); publicação `supabase_realtime` (attendance_logs, notifications, schemas, students).
- Referência ao OLD_REF: só em `public.notify_critical_error_log` (URL, trigger `trg_notify_critical_error`) e nos 6 crons. Em dados: 0 ocorrências.
- Não há Database Webhooks (schema `supabase_functions` ausente) nem event triggers custom. `supabase_migrations.schema_migrations` existe (decidir na F2 se leva o histórico).
- Atenção: testes do Vitest já gravaram no Vault de produção (resíduo `vitest_gw_*`). Tratar após a migração.
- Itens 12/13 (Management API, só GET, segredos mascarados; JSONs em `inventario\api\`): projeto Zela Portal, ca-central-1, Postgres 17.6.1.141, ACTIVE_HEALTHY. Sem add-ons (sem PITR nem compute extra). Rede aberta (0.0.0.0/0 e ::/0), SSL enforcement desligado, postgres-config vazio (padrões).
  - Auth a replicar: `site_url=https://sensekids.vercel.app/`, `uri_allow_list=https://sensekids.vercel.app/reset-password#`, `mailer_autoconfirm=true`, `disable_signup=false`, `jwt_exp=3600`, rotação de refresh token ligada (reuse 10s), `sessions_inactivity_timeout=24`, `password_min_length=6`, MFA TOTP ligado (máx. 10 fatores), phone/anonymous/OAuth/SAML/hooks desligados, `mailer_otp_length=8`, rate limits: e-mail 2, refresh 150, verify 30, otp 30, sms 30, anonymous 30. Templates de e-mail: padrão (não customizados).
  - **SMTP custom NÃO está configurado** no Auth (`smtp_host` nulo, e-mails de Auth usam o mailer padrão do Supabase). A linha "Senha SMTP do Auth (Resend)" de F0.2 não se aplica hoje.
  - PostgREST: `db_schema=public,graphql_public`, `max_rows=1000`, `db_extra_search_path=public, extensions`. Storage: `fileSizeLimit=50MB` global, imageTransformation e s3Protocol ligados (o S3 é o que o rclone usa).
  - 53 Edge Functions ativas. **`verify_jwt=false` em 7**: check-attendance-delays, daily-reset, self-register-family, payment-webhook, notify-critical-error, zela-billing-webhook, controlid-push. As outras 46 têm `verify_jwt=true`. No deploy novo, as 7 precisam de `--no-verify-jwt` (o `functions download` não traz isso).
  - JWT secret muda no projeto novo: todas as sessões atuais invalidam (já previsto: todos logam de novo) e as chaves anon/service_role mudam (Vercel, secrets das functions, totens).
  - Formato dos 4 segredos de `cron_secrets` (só tipo/tamanho, valores não lidos): `daily_reset_auth_key` e `notify_critical_error_auth_key` têm 64 caracteres, não JWT (devem igualar os secrets de function DAILY_RESET_AUTH_KEY e NOTIFY_CRITICAL_ERROR_AUTH_KEY; pode gerar novos, gravando o mesmo valor nos dois lados). `check_attendance_delays_auth_key` e `financial_reminders_auth_key` têm 219 caracteres e começam com `eyJ` (JWT, provavelmente a service_role legada; confirmar o claim `role` na F2). Os crons de functions com `verify_jwt=true` (send-financial-reminders, notify-biblioteca-prazos, purge-scholarship-documents, run-billing-rules) usam `financial_reminders_auth_key`, então ele precisa ser um JWT válido do projeto NOVO.
- Item 14 (12/11): o painel só oferece backup físico (Restaurar, sem download). Substituído por dump lógico `pg_dump -Fc` em `D:\zela-migracao\backup\zela_prod_20261112.dump` (11,2 MB, 207 tabelas com dados, `pg_restore -l` ok, log sem erro). Inclui auth, metadados de storage e vault.secrets.
- BitLocker (12/11): D: (Dev Drive) criptografado, XTS-AES 256, proteção ativada, protetores senha + chave de recuperação (guardada fora do D:). `rclone` v1.76.0 instalado via winget (fora do PATH da sessão do agente).
- Pendente na F0.3: revogar o PAT usado nos itens 12/13.

### F0.4b Perguntas originais
- App Android/iOS (Capacitor) está nas mãos de usuários reais? O app embute a URL no build. Se houver usuários reais, ele quebra na virada até sair build novo e a loja aprovar, o que pode levar mais de 24 h.
- Algum equipamento Control iD em produção aponta para `controlid-push` do OLD_REF?
- Quantas escolas têm webhook Asaas configurado com a URL antiga? Ver `ONBOARDING_FINANCEIRO_ESCOLA.md:53`.
- Os totens/tablets e a Recepção vão precisar logar de novo de manhã. Há alguém em cada escola com as credenciais?

## F1. Criar projetos (painel do Supabase)

- **Criados em 12/11:** `zela-sp` (definitivo) = `krfabcwmufmzavkcukdr`; `zela-sp-ensaio` = `wmubammvuckreyqsjovs`. Opções de Security iguais nos dois (Data API e "Automatically expose new tables" marcados, "automatic RLS" desmarcado: o dump da produção tem default privileges em `public` e nenhum event trigger de RLS). Postgres 17.11 nos dois (produção 17.6, minor mais novo, ok para restore). Compute do `zela-sp` = Micro (igual à produção, sem add-on); disco 2 GB com auto-expand até 8 GB, spend cap ligado (deixar). F1 concluída em 12/11. Senhas e chaves só no gerenciador do usuário.
- [ ] **Projeto definitivo** `zela-sp`, na mesma organização, região **South America (São Paulo)**:
  - compute ≥ produção;
  - senha forte do banco;
  - PITR se a produção tiver;
  - SSL enforcement e network restrictions iguais.
- [ ] **Projeto de ensaio** `zela-sp-ensaio` (temporário, compute mínimo). Serve só para testar o restore e medir tempo. Apagar ao final.
- [ ] Anotar NEW_REF e as chaves (anon e service_role). Postgres da mesma major da produção, se o painel permitir. Se for maior, o ensaio valida.

Por que dois projetos: o definitivo recebe o restore uma única vez, limpo, na janela. Não existe "limpar o ensaio" dentro do projeto definitivo.

## F2. Configurar o projeto definitivo (sem dados, sem downtime)

1. **Auth:** copiar via Management API.
   - Fluxo: GET no OLD, remover campos de segredo, PATCH no NEW.
   - O que vai: Site URL, Redirect URLs, provedores, MFA/TOTP ativo, política de senha, proteção contra senha vazada, rate limits, expiração do JWT, templates de e-mail.
   - Recolocar a senha SMTP do Resend à mão.
   - Conferir por diff dos dois JSONs.
2. **PostgREST:** schemas expostos e `max_rows = 1000`. O valor tem de ser idêntico; várias telas dependem dele (ver `lib/buscarTodos`).
3. **Storage:** limite global de tamanho de arquivo.
4. **Secrets das Edge Functions:** `supabase secrets set --project-ref NEW_REF ...`, com os valores de F0.2.
5. **Edge Functions (53):**
   - `supabase functions download <nome> --project-ref OLD_REF`, uma a uma, para a pasta `D:\zela-migracao\functions\`. Essa pasta é o código que está **rodando** em produção.
   - Deploy de cada uma no NEW_REF com o mesmo `verify_jwt` da lista de F0.3-12.
   - **Não fazer deploy a partir da main.**
   - Conferir: lista de functions e `verify_jwt` idênticos (diff).
6. **Chaves S3 do Storage:** gerar no OLD e no NEW (Settings > Storage > S3 access keys) e configurar dois remotes no rclone.
7. **Frontend:** o código já lê `VITE_SUPABASE_URL`. Os fallbacks com OLD_REF em `AdminUserRegistration.jsx:709` e `FamilyGerenciarResponsaveis.jsx:84` não atrapalham. Nenhuma mudança de código na janela.

**Progresso F2 (12/11):** item 5, download das 53 funções concluído em `D:\zela-migracao\functions\supabase\functions\` (53 pastas + `_shared`, 489 KB, batem com `functions.json`, via `functions download --remote=OLD --use-api` rodado fora do repo). Deploy no NEW ainda não feito. Os 7 `verify_jwt=false` seguem a lista de F0.3-12.
Itens 1 a 3 (12/11): Auth, PostgREST e Storage aplicados no `zela-sp` pelo painel e conferidos por diff via API (só GET, `inventario\api_novo\diff.txt` vazio, segredos ignorados). Única divergência inicial: `mfa_max_enrolled_factors` 6 → 10, corrigida. Item 4 (13/11): 9 secrets gravados no `zela-sp` (VAPID x3, ASAAS_API_KEY, ZELA_ASAAS_API_KEY, ZELA_BILLING_WEBHOOK_TOKEN, GEMINI_API_KEY, DAILY_RESET_AUTH_KEY e NOTIFY_CRITICAL_ERROR_AUTH_KEY novos, 64 hex, gravados em `D:\zela-migracao\segredos\cron_auth_keys.txt` para o Vault no pos_restore). Pulados de propósito: ASAAS_API_BASE_URL (padrão sandbox), RESEND_API_KEY e RESEND_FROM_EMAIL (Resend não integrado; código tolera), GEMINI_MODEL (padrão no código), EXTRA_ALLOWED_ORIGINS e FCM_SERVICE_ACCOUNT (só app nativo; confirmar se há usuários reais antes do corte). Item 5 (13/11): 53 funções implantadas no `zela-sp` a partir do código baixado da produção (`--use-api --yes`, `--no-verify-jwt` nas 7); conferência por API: 53 OK, 0 falhas, lista e `verify_jwt` idênticos à produção (`functions\deploy\resumo.txt`). Item 6 (13/11): chaves S3 criadas no OLD e no `zela-sp` (no gerenciador do usuário). **F2 concluída em 13/11**; PATs de leitura e escrita revogados. (texto antigo:) Revogar os PATs de leitura e de escrita no fim da F2.

## F3. Ensaio completo (produção só é lida)

**Decisões (13/11):** (1) migrations 20261213110000 e 20261212200000 NÃO vão para o OLD; migra-se o estado atual e as duas são aplicadas no `zela-sp` depois do corte. (2) App nativo sem usuários reais: `FCM_SERVICE_ACCOUNT` e `EXTRA_ALLOWED_ORIGINS` seguem sem gravar. (3) VAPID: validar com `send-test-push` na F5. **Progresso F3 (13/11):** F3.1 dump ~3,6 min (data.sql 20 MB). F3.2 restore no ensaio ~250 s. F3.3 pos_restore 4,6 s. F3.4 verde (acl, func, policy, rls, índices, triggers, colunas, crons, default_acl, realtime, buckets: 0 diferenças; sobra só 1 constraint `trad_config_media_recuperacao_check` com deparse diferente, 2 versões de extensão e 2 configs de roles da plataforma). Pipeline em `D:\zela-migracao\scripts\` (`ensaio_tudo.ps1` encadeia reset, restore, pos_restore e validação). **Lições para a F4 (já embutidas nos scripts):** (a) `pg_dump` só emite GRANT, nunca REVOKE: antes do schema, `ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ... FROM anon, authenticated, service_role`, senão tabelas e funções ficam mais abertas que no OLD; (b) não reescrever o dump com ReadAllLines/WriteAllLines (CRLF muda md5 de funções), usar texto bruto; (c) do `schema.sql` tirar `CREATE SCHEMA public` e as 12 `ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin`; de `storage_data.sql` tirar os blocos vazios de `buckets_vectors` e `vector_indexes`; roles.sql não é restaurado (só roles gerenciados); (d) pooler do ensaio é `aws-0-sa-east-1`; (e) a service_role usada nos 2 segredos JWT do Vault tem de ser a legada (JWT) do projeto de destino.
**F3.5 (13/11) verde:** `f35_storage.ps1` criou os 10 buckets no `zela-sp` a partir do dump e copiou por rclone (OLD só lido): 162 objetos, 59 MB, contagem e bytes iguais, `rclone check` ok, metadados (bucket, nome, tamanho, mimetype) 0 diferenças contra o dump (~1 min no total). Pooler do `zela-sp` é `aws-1-sa-east-1`. **Para a F4:** o restore definitivo NÃO carrega `storage.buckets` nem `storage.objects` (já existem); rodar só o delta do rclone.
**F3.6 (13/11) verde:** `f36_2fa.ps1` no ensaio com conta developer real: login com a senha antiga OK (aal1), 1 fator TOTP verificado, código atual do app aceito (aal2). **O 2FA migra; plano B (desvincular fatores) não é necessário.** Auth config do ensaio não foi replicada (só do `zela-sp`), o que não afeta o teste. **Go/No-Go 1: verde** (F3.4, F3.5 e F3.6 ok; tempos medidos: dump ~3,6 min, restore ~4,2 min, pos_restore 5 s, validação ~10 s, rclone ~1 min).
F3.1: script `D:\zela-migracao\scripts\dump_f31.ps1` (pg_dump/pg_dumpall via docker postgres:17, read-only, saída em `D:\zela-migracao\ensaio\dump_f31\`, 6 arquivos: roles, schema, data, auth_storage_schema, auth_data, storage_data).

### F3.1 Dump (do OLD, sem congelar)
```
supabase db dump --db-url "$OLD_DB" -f roles.sql  --role-only
supabase db dump --db-url "$OLD_DB" -f schema.sql
supabase db dump --db-url "$OLD_DB" -f data.sql   --use-copy --data-only
supabase db dump --db-url "$OLD_DB" -f auth_storage_schema.sql --schema auth,storage
```
De `auth_storage_schema.sql` extrair **só** os objetos custom levantados em F0.3-9 (policies de `storage.objects`, triggers em `auth.users`) para `custom_auth_storage.sql`. **As policies de Storage não vêm no `schema.sql`**; se forem esquecidas, os buckets privados ficam sem regra.

### F3.2 Restore (no ENSAIO)
```
psql --single-transaction -v ON_ERROR_STOP=1 \
  --file roles.sql --file schema.sql \
  --command "SET session_replication_role = replica" \
  --file data.sql --dbname "$ENSAIO_DB"
psql -v ON_ERROR_STOP=1 --file custom_auth_storage.sql --dbname "$ENSAIO_DB"
```
- `replica` desliga triggers durante a carga. Assim nenhum trigger dispara notificação, push ou e-mail, e os triggers de cadastro não duplicam dados.
- Erro em qualquer linha faz rollback total. Anotar o erro, ajustar e repetir.
- Medir o tempo de cada etapa. É a estimativa da janela.

### F3.3 Pós-restore (script `pos_restore.sql`, revisado antes de rodar)
1. Substituir OLD_REF por NEW_REF nas funções e triggers de F0.3-10. Reaplicar com `CREATE OR REPLACE`, usando a definição exportada; nada de editar à mão.
2. Dados com URL antiga (F0.3-11): `UPDATE ... replace(col, OLD_REF, NEW_REF)` só nas colunas listadas, com contagem antes e depois.
3. Vault: recriar os segredos (nomes de F0.3-6) com os valores de F0.2.
4. Crons: recriar a partir de `cron.job` da produção, com a URL trocada, **todos com `active = false`**. Ninguém pode disparar `daily-reset` ou cobrança antes da hora.
5. Configurações de banco e roles de F0.3-7.
6. Conferir a publicação `supabase_realtime` (mesmas tabelas de F0.3-8).

### F3.4 Validação automática (script compara OLD × ENSAIO; tudo precisa ser IGUAL)
- [ ] Contagem de linhas de cada tabela de `public` e `auth` (users, identities, mfa_factors, refresh_tokens).
- [ ] Policies: quantidade e md5 por tabela (`public` e `storage`). RLS ativo nas mesmas tabelas.
- [ ] Funções (nome + md5 do corpo, exceto as alteradas de propósito em F3.3-1), triggers, índices, constraints, grants.
- [ ] Extensões, publicação Realtime, buckets (`public = false` nos privados, limites e MIME).
- [ ] Sequences: `last_value` ≥ ao do OLD.
- [ ] Nenhuma ocorrência de OLD_REF em funções, crons ou dados.

### F3.5 Storage (cópia em massa para o projeto DEFINITIVO, sem downtime)
- `rclone copy old:<bucket> new:<bucket> --checksum --transfers 8`, para os 5 buckets.
- Conferir quantidade e bytes por bucket.
- **Decisão validada no ensaio:** como fica `storage.objects` quando os arquivos chegam antes do restore. Em F4, o restore definitivo deve excluir os dados de `storage.objects` do `data.sql`, porque o rclone já cria os metadados. Se alguma policy de Storage usar a coluna `owner` (F0.3-9), aplicar `UPDATE owner` a partir do dump.

### F3.6 Teste de 2FA e senha (no ENSAIO)
- Login com conta developer real: senha antiga funciona?
- O 2FA (TOTP) continua válido? O segredo do TOTP pode depender de chave do projeto.
- Se o 2FA não migrar: plano B = desvincular os fatores e pedir novo cadastro no primeiro login. Decidir aqui, não na janela.

### Go/No-Go 1
Tudo de F3.4 verde, 2FA resolvido, Storage copiado, tempo medido cabe na janela. Se não, **aborta** (produção intacta).

## F4. Janela de corte (downtime)

Comunicar às escolas antes: "manutenção das HH:MM às HH:MM; será preciso entrar de novo no sistema".

| # | Ação | Validação |
|---|---|---|
| 1 | OLD: salvar estado dos crons e `update cron.job set active = false` | `select jobname, active from cron.job` |
| 2 | OLD: `alter database postgres set default_transaction_read_only = on;` e reiniciar o projeto (painel) para derrubar conexões abertas | Uma escrita de teste falha |
| 3 | Dump final (os 4 arquivos de F3.1) | Arquivos gerados, tamanho coerente |
| 4 | Inventário final do OLD (contagens) = gabarito | Salvo |
| 5 | Restore no DEFINITIVO (F3.2) + `custom_auth_storage.sql` + `pos_restore.sql` (F3.3) | Sem erro |
| 6 | Validação automática (F3.4) OLD congelado × DEFINITIVO | **100% igual, senão para e avalia rollback** |
| 7 | Storage delta: `rclone copy` de novo nos 5 buckets | Quantidade e bytes iguais |
| 8 | Ativar os crons no DEFINITIVO (`active = true`, como no estado salvo no passo 1) | Lista igual à do OLD |
| 9 | Vercel (Production): `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` → NEW. **Redeploy do deployment de produção atual** (mesmo commit, sem código novo) | Bundle aponta para NEW_REF |
| 10 | GitHub secrets `PROD_VITE_SUPABASE_URL` e `PROD_VITE_SUPABASE_ANON_KEY` → NEW; `.env` local; `supabase link --project-ref NEW_REF` | — |

**Progresso F4 (13/11, executada; scripts em `D:\zela-migracao\scripts\f4\`, logs em `D:\zela-migracao\f4\logs\`):** preflight do `zela-sp` vazio ok. OLD congelado (8 crons desativados, estado salvo; `default_transaction_read_only=on` só passou a valer **depois de reiniciar o projeto** no painel, o pooler reaproveita conexões antigas; o script confere `transaction_read_only=on` antes do dump). Dump final: schema 68 s, data 41 s, auth 17 s, storage 16 s. Restore no `zela-sp` 216 s (156 tabelas, 192 usuários, 37 policies de storage, 119 migrations), pós-restore 3,7 s. Storage: delta com `copy=0`/`check=0` nos 10 buckets (162 objetos, 59 MB). Validação OLD congelado × `zela-sp`: 0 diferenças, exceto as aceitas (constraint `trad_config_media_recuperacao_check`, versões pg_net 0.20.4/vault 0.3.2, configs de roles; o read-only do OLD só existe no OLD). 8 crons ativados no `zela-sp`, lista igual à do OLD. Vercel (Production) apontado para `krfabcwmufmzavkcukdr` e redeploy feito; bundle de `zelaedu.com.br` conferido sem a ref antiga (só `index` e 5 chunks). Secrets `PROD_VITE_*` do GitHub não existem (só o `ios-release.yml` os usa; iOS adiado). **Lições:** (1) o `psql` imprime boolean como `true` com `||`, não `t`; (2) `to_regclass` não basta para `cron.job` sem `pg_cron`, usar SQL dinâmico; (3) S3 key do OLD precisa estar válida antes da janela. **Rollback preparado:** `f4_99_rollback_old.ps1` (OLD sem read-only e crons reativados) mais Vercel de volta.

## F5. Smoke test (produção nova, contas reais, escola de teste quando houver escrita)
- [ ] Login de cada role: admin/Recepção, gestão, family, teacher, financeiro, developer, marketing. Com 2FA onde houver.
- [ ] Isolamento: usuário da escola A não vê nada da escola B (uma consulta adversarial).
- [ ] Fluxo check-in/out ponta a ponta: totem → solicitação → Monitor da Recepção (Realtime) → confirmar → histórico.
- [ ] Reconhecimento facial e fotos privadas carregando (signed URL do NEW).
- [ ] Upload em bucket privado; acesso negado sem permissão.
- [ ] Push (web e Android) com `send-test-push`.
- [ ] Uma Edge Function com JWT (ex.: `create-family-user` em escola de teste) e uma sem JWT (webhook com token).
- [ ] Portal do Dev: `error_logs` gravando no NEW.

### Go/No-Go 2 (ponto sem volta)
- **Verde:** liberar o acesso.
- **Vermelho — rollback, cerca de 10 min:**
  1. OLD: `alter database postgres reset default_transaction_read_only;` e reiniciar;
  2. reativar os crons (estado do passo 1);
  3. Vercel e GitHub de volta para OLD + redeploy.

  Nada foi escrito no NEW por usuários, então não há perda.

## F6. Externos e manhã seguinte
- [ ] Asaas da Zela: URL do `zela-billing-webhook` → NEW (e token, se mudou). Reativar a fila de webhooks se o Asaas a pausou.
- [ ] Asaas de cada escola: URL do `payment-webhook` → NEW. Reativar a fila. Conferir no Asaas os eventos da janela e reprocessar se preciso.
- [ ] Control iD (se em produção): URL de push nos equipamentos.
- [ ] Apps móveis (se em uso): build novo com as URLs do NEW (`ios-release.yml` e equivalente Android). Até sair, o app não funciona; comunicar.
- [ ] Monitorar `/resumo-erros`, os logs do Supabase (API, Auth, Functions) e a primeira execução de cada cron.
- [ ] Recepções: login nos totens e tablets no início do expediente.

## F7. Pós-migração
- **D+1:** atualizar a documentação.
  - `ONBOARDING_FINANCEIRO_ESCOLA.md:53`, `cron_jobs_producao.sql` (URLs), `docs/ZELA_STATUS.md`, `ZELA_CHANGELOG`.
  - Trocar o fallback OLD_REF em `AdminUserRegistration.jsx:709` e `FamilyGerenciarResponsaveis.jsx:84`.
  - Comandos de deploy (`--remote=orafqopnomdrvwlvxrkz` no status).
- **D+1:** apagar o projeto `zela-sp-ensaio`.
- **D+7:** projeto antigo segue somente leitura e com crons desligados, sem uso. Se tudo estiver estável, último backup baixado e guardado criptografado.
- **D+30 (LGPD):**
  - apagar o projeto do Canadá e os dumps locais;
  - registrar a exclusão;
  - atualizar a política de privacidade e o RIPD: "dados armazenados no Brasil (São Paulo)";
  - revisar os subprocessadores fora do Brasil (Gemini, Resend, FCM, Asaas).
