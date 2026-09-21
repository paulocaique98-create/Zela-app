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

## Fluxo padrão de trabalho neste repositório

- Nunca commitar/dar push sem autorização explícita do usuário, mesmo que uma
  tarefa anterior tenha sido autorizada — cada commit precisa do próprio aval.
- Sempre rodar `npm run build` e `npx vitest run` (suíte completa) depois de
  qualquer mudança, e só reportar sucesso depois de ver os dois passarem.
- Migrações e queries ad-hoc são aplicadas direto no projeto Supabase linkado
  (não há Supabase local/Docker neste projeto): `npx supabase db query
  --linked -f <arquivo.sql>`. Funções de borda: `npx supabase functions
  deploy <nome>`.
- Nunca usar hífen ("-") em texto voltado ao usuário (UI, relatórios,
  notificações, textos de `system_updates`) — usar "·" no lugar. Exceção:
  quando o próprio usuário pede um formato específico com "-" explicitamente
  numa conversa (aí seguir o que foi pedido para aquele caso pontual).
- Responder ao usuário sempre em português.
