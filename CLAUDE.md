# Instruções do projeto Zela

## Sempre registrar em "Sistema > Atualizações" (system_updates)

Toda vez que uma funcionalidade nova ou uma correção visível pro usuário for
concluída, testada (build + `npx vitest run`) e o commit/push for autorizado
pelo usuário, é OBRIGATÓRIO inserir uma linha em `system_updates` ANTES de
considerar a tarefa encerrada — no mesmo passo do commit, nunca depois.

Isso já esqueceu de ser feito mais de uma vez (ver histórico: Liveness
Detection e os ajustes da Presença Diária de 21/09/2026 só foram lançados
depois que o usuário percebeu a ausência). Esta seção existe justamente pra
isso parar de acontecer.

Como inserir (mesmo padrão usado até aqui, `title` curto + `summary` em
português simples, sem jargão técnico, explicando o que MUDA pra quem usa o
sistema, não como foi implementado):

```sql
insert into system_updates (title, summary) values
('Título curto da novidade', 'Explicação em 1-3 frases, linguagem de usuário final.');
```

Aplicar direto no banco linkado:
`npx supabase db query --linked -f <arquivo.sql>`

Não registrar: mudanças internas que o usuário não percebe (refactor, testes,
migração invisível), nem trabalho ainda não aprovado/commitado pelo usuário.

## Módulos contratados: tudo começa desativado

Regra definida pelo usuário em 28/09/2026: todo e qualquer módulo, adicional
ou recurso que precise ser ativado começa DESATIVADO. Escola nova nasce só
com o plano base (sempre incluso, não se ativa). Ao criar um módulo ou
adicional novo: registrar no catálogo `src/lib/modulosCatalogo.js` (nasce
desligado) e, nos portais, ler a chave como `features.x === true` (ausente =
desligado), nunca `!== false`. O teste "REGRA: todo módulo, adicional ou
chave técnica começa desativado" em `modulosCatalogo.test.js` garante isso.

## Fluxo padrão de trabalho neste repositório

- Nunca commitar/dar push sem autorização explícita do usuário, mesmo que uma
  tarefa anterior tenha sido autorizada — cada commit precisa do próprio aval.
- Sempre rodar `npm run build` e `npx vitest run` (suíte completa) depois de
  qualquer mudança, e só reportar sucesso depois de ver os dois passarem.
- Os testes de integração rodam SÓ no Supabase local (desde 27/09/2026),
  nunca na produção: antes da suíte, garantir o Docker no PATH (ver abaixo) e
  `npx supabase start`. Credenciais locais em `.env.test.local` (fora do
  git; recriar com `npx supabase status -o env`, ver src/test/envForTests.js).
  Sem o Supabase local de pé, os testes de integração PULAM -- conferir que
  não houve "skipped" antes de reportar sucesso. Mudança de estrutura nova:
  aplicar primeiro no local (`npx supabase migration up` ou `db reset`),
  testar, e só então `db push --linked` na produção.
- Migrações (mudança de estrutura: tabela, coluna, policy, função, trigger)
  seguem o fluxo do Supabase CLI desde 27/09/2026 — o histórico começa na
  linha de base `supabase/migrations/20260927170000_baseline_producao.sql`
  (as antigas ficam em `supabase/migrations_legado/`, só pra consulta):
  1. `npx supabase migration new <nome_curto>` (gera o arquivo com timestamp
     no formato certo; NUNCA criar à mão com nome tipo `20260927k_...`);
  2. escrever o SQL no arquivo gerado;
  3. `npx supabase db push --linked` (aplica e registra no histórico).
  NUNCA aplicar mudança de estrutura com `db query -f` — ela não registra
  no histórico e o repositório volta a divergir da produção.
- Queries ad-hoc (consultas, correção pontual de dados, insert em
  `system_updates`) continuam com `npx supabase db query --linked -f
  <arquivo.sql>`. Funções de borda: `npx supabase functions deploy <nome>`.
- Docker Desktop está instalado (usuário atual, fora do PATH do bash): antes
  de comandos que precisam dele (`db dump`, `db start`, `start`), rodar
  `export PATH="/c/Users/User/AppData/Local/Programs/DockerDesktop/resources/bin:$PATH"`.
  Jobs do pg_cron de produção ficam fora das migrações (apontam pra URL de
  produção) — referência em `supabase/cron_jobs_producao.sql`.
- Nunca usar hífen ("-") em texto voltado ao usuário (UI, relatórios,
  notificações, textos de `system_updates`) — usar "·" no lugar. Exceção:
  quando o próprio usuário pede um formato específico com "-" explicitamente
  numa conversa (aí seguir o que foi pedido para aquele caso pontual).
- Responder ao usuário sempre em português.
