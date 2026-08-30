# RELATÓRIO FINAL — FASE 1

## AUDITORIA DA ARQUITETURA ATUAL (pré-requisito do Módulo Financeiro)

---

## 1. Objetivo

Entender profundamente a arquitetura existente do Zela (schema, matrícula, RLS, Edge Functions, notificações, menu) para identificar o ponto de conexão mais seguro entre `MATRÍCULA → CONTRATO FINANCEIRO → RECORRÊNCIA → COBRANÇA → PIX/BOLETO/CARTÃO → WEBHOOK → PAGAMENTO CONFIRMADO`, sem escrever código, sem criar/executar migration, sem chamar nenhuma API financeira.

## 2. Diagnóstico Inicial

**Resposta às 4 perguntas obrigatórias da Fase 1:**

- **Existe entidade de matrícula?** Sim — `matricula_solicitacoes`. É um fluxo de **solicitação cadastral** (família preenche → admin aprova/rejeita), não um contrato. Ao ser aprovada, vira registros em `students`, `student_guardians` e `authorized_persons` via a função `approve_matricula()`.
- **Existe contrato financeiro?** **Não existe.** Nenhuma tabela, nenhum campo, nenhuma menção a valor/plano/mensalidade em lugar nenhum do schema ou do código.
- **Onde identificar o responsável financeiro?** Já existe um sinalizador pronto: `student_guardians.is_financial boolean`. Durante a matrícula, os dados desse responsável (nome, CPF, endereço, contato) já são coletados em `matricula_solicitacoes.responsavel_financeiro` (jsonb) e persistidos em `users` na aprovação. **Esse vínculo é 100% reaproveitável** como "quem paga" — não precisa ser reinventado.
- **Onde armazenar valor da mensalidade?** Em lugar nenhum hoje — campo inexistente em `students`, em `matricula_solicitacoes` e em qualquer outra tabela. **Precisa ser criado do zero na Fase 2/5.**
- **Melhor gatilho pra gerar recorrência?** O ponto natural é a aprovação de matrícula (`approve_matricula()`, `supabase/migrations/20260904_approve_matricula_rpc.sql`), já que é onde o aluno passa a existir de fato e o responsável financeiro já está resolvido. Mas essa função **hoje não cria nada financeiro** — estender esse gatilho é uma decisão de modelo pra Fase 2, não desta fase.

## 3. Arquivos Auditados

**Schema (consulta direta, só leitura, via `supabase db query --linked`)**: `students`, `users`, `student_guardians`, `matricula_solicitacoes`.

**Código**: `src/components/AdminMatriculas.jsx`, `src/components/FamilyMatriculas.jsx`, `src/components/AdminPortal.jsx` (linhas 1-140), `src/components/AdminUserRegistration.jsx` (trechos com `guardian_type`), busca global (`grep -rniE`) por termos financeiros em `src/` e `supabase/`.

**Migrations**: `supabase/migrations/20260720_fix_rls_recursion.sql`, `20260716_add_guardian_student_fields.sql`, `20260831_add_matriculas.sql`, `20260904_approve_matricula_rpc.sql`, listagem completa dos 63 arquivos em `supabase/migrations/`.

**Edge Functions**: todos os 13 diretórios em `supabase/functions/` (nomes e padrão de autenticação, sem ler o corpo completo de todas — já auditadas em detalhe em fase anterior as 3 de push).

**Catálogo de componentes**: todos os arquivos `Admin*.jsx` (28) e `Family*.jsx` (17) em `src/components/`.

## 4. Arquivos Modificados

**Nenhum.** Esta fase é exclusivamente de leitura — nenhum arquivo de código, config, `.env` ou migration foi criado, editado ou executado.

## 5. Banco

```text
Schema alterado? NÃO
Migration criada? NÃO
Migration executada? NÃO
Dados alterados? NÃO
```

Todas as consultas ao banco foram `SELECT` em `information_schema.columns` (leitura de schema) — nenhum `INSERT`/`UPDATE`/`DELETE`/`ALTER`/`CREATE` foi executado.

## 6. Segurança

Nenhuma alteração de segurança nesta fase. Observação relevante pra fases futuras: o padrão de autorização em Edge Functions já estabelecido no projeto (client com `SERVICE_ROLE_KEY` para a ação privilegiada + revalidação da role do caller no banco via JWT, nunca confiando em role vinda do client) é diretamente reaproveitável para as futuras `create-payment`/`process-payment-webhook` — **não é necessário inventar um padrão novo**.

## 7. Multi-Tenant

Confirmado o padrão universal: `public.get_my_school_id()` e `public.get_my_role()` (`SECURITY DEFINER`, definidas em `20260720_fix_rls_recursion.sql:4-22`), e toda tabela nova desde então segue `USING (school_id = get_my_school_id() AND get_my_role() = '<role>')` como base da policy. **Qualquer tabela financeira nova deve seguir exatamente esse mesmo esqueleto** — não há necessidade de um mecanismo de isolamento diferente do já validado em produção.

## 8. Gateway

Não avaliado nesta fase (é escopo da Fase 3, "Auditoria do Asaas"). Nenhuma chamada de API financeira foi feita.

## 9. Webhooks

Não implementado nesta fase (escopo da Fase 8). Observação de arquitetura: nenhuma Edge Function hoje expõe um endpoint público sem autenticação de app (todas exigem `Authorization` do caller ou são de uso interno via `SERVICE_ROLE_KEY`) — um endpoint de webhook do gateway financeiro será o **primeiro caso do projeto que precisa aceitar uma requisição de origem externa não-Supabase**, autenticada por um mecanismo diferente (assinatura/segredo do próprio gateway, não JWT de usuário). Isso é uma peça nova de arquitetura a desenhar na Fase 4/8, não um padrão já existente pra copiar.

## 10. Recorrência

Não implementado nesta fase (escopo da Fase 2/9). Nenhum mecanismo de recorrência (cron, scheduler, job agendado) foi encontrado no projeto além de `daily-reset` (reset diário de status de presença dos alunos — não financeiro) — não há um "cron runner" genérico hoje que a Fase 9 possa simplesmente reaproveitar; isso também será uma peça nova a desenhar.

## 11. PIX Copia e Cola

Não aplicável nesta fase — nenhuma integração de gateway foi feita.

## 12. Build

Não executado nesta fase (nenhum código foi alterado, não há necessidade de validar build).

## 13. Lint

Não executado nesta fase (mesmo motivo).

## 14. Testes

| Teste | Resultado | Evidência |
|---|---|---|
| Nenhum arquivo de código alterado | PASS | `git status --short` mostra apenas o novo arquivo de relatório desta fase |
| Nenhuma migration criada/executada | PASS | Nenhum arquivo novo em `supabase/migrations/`; nenhum comando `CREATE`/`ALTER`/`INSERT`/`UPDATE`/`DELETE` executado nesta sessão |
| Nenhuma chamada a API financeira | PASS | Nenhuma requisição de rede a gateway algum foi feita |
| Campo financeiro realmente ausente em `students`/`matricula_solicitacoes` | PASS | Confirmado por leitura direta do schema via `information_schema.columns` |

## 15. QA Sênior

**QA 1 (implementador)**: consultas de schema batem com o código que as usa (`AdminMatriculas.jsx`/`FamilyMatriculas.jsx` manipulam exatamente as colunas jsonb encontradas em `matricula_solicitacoes`); nenhuma contradição entre o que o código assume e o que o banco realmente tem.

**QA 2 (auditor independente, assumindo que a Fase 1 errou em algo)**: revisei especificamente se não haveria um campo financeiro "escondido" em outra tabela não óbvia (ex.: `schools.limits`, `schools.plan`) — esses campos existem mas são sobre **o plano de assinatura da escola no próprio Zela** (SaaS B2B), não sobre a mensalidade que a escola cobra dos pais (B2B2C) — são conceitos financeiros completamente diferentes e não devem ser confundidos nem reaproveitados na Fase 2. Também busquei por qualquer trigger ou função Postgres com nome relacionado a cobrança/pagamento — nenhuma encontrada.

## 16. Problemas Encontrados

Nenhum problema de código, segurança ou dados encontrado nesta fase — é esperado, já que nenhuma funcionalidade financeira existe ainda para ter problemas. O único "achado" é a **ausência confirmada** de qualquer estrutura financeira prévia, o que é informação, não um bug.

## 17. Riscos Restantes

1. A Fase 2 vai precisar decidir onde a "aprovação de matrícula" se conecta (ou não) à criação de um contrato financeiro — se isso ficar implícito/automático, há risco de criar contratos financeiros pra matrículas que não deveriam ter cobrança (ex.: bolsistas, casos especiais) sem uma flag explícita de opt-out.
2. `student_guardians.is_financial` hoje é só um rótulo informativo — ainda não foi testado se pode haver mais de um `is_financial=true` por aluno (não relevante nesta fase, mas a Fase 2 deve confirmar essa regra antes de usar esse campo como âncora do responsável que efetivamente paga).
3. Nenhum mecanismo de job agendado/cron genérico existe no projeto — a Fase 9 (recorrência automática) vai precisar decidir a infraestrutura (Supabase Cron? Vercel Cron? chamada externa?) do zero.

## 18. Git

```text
Commit? NÃO
Push? NÃO
Deploy? NÃO
```

`git status --short` mostra apenas `FASE_1_AUDITORIA_ARQUITETURA_FINANCEIRO.md` como arquivo novo, não rastreado. Nada foi adicionado ao stage, nada foi commitado.

## 19. Regra de Parada

```text
ATIVADA? NÃO
```

Nenhuma das 14 condições de parada (perda de dados, RLS ambígua, cross-school, segredo no frontend, webhook sem validação, pagamento duplicado, migration destrutiva, incompatibilidade de schema, alteração em Totem/reconhecimento facial/Monitor, cobrança real acidental, falta de idempotência, dúvida sobre gateway) se aplica — esta fase não tocou em nenhuma dessas áreas.

## 20. Próxima Fase

```text
PODE AVANÇAR? SIM (tecnicamente, a base está mapeada o suficiente para a Fase 2)
REQUER AUTORIZAÇÃO? SIM
```

Aguardando sua instrução explícita para iniciar a **FASE 2 — Decisão do Modelo Financeiro**.
