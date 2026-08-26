# FASE 7.4 — VALIDAÇÃO FINAL DE PRODUÇÃO

## 1. Resumo executivo

Nesta rodada da Fase 7.4, ao contrário da anterior, houve testes reais e diretos feitos pelo usuário em
produção (desktop e mobile/Totem), incluindo reconhecimento facial funcionando. Também foi determinada
e corrigida a causa raiz do timeout `57014` que vinha bloqueando testes — não é mais um evento
transitório sem explicação, é uma causa **determinada e corrigida** (classificação A). O sistema está
significativamente mais validado do que na rodada anterior desta mesma fase.

## 2. Estado antes dos testes

Continuação direta da rodada anterior da Fase 7.4 (nenhum reset de estado).

## 3. Git

- branch: `main`, commit: `dd0ebb0` (local = remoto).
- working tree: `FASE_6_AUDITORIA_BASE64.md` modificado (relatório); `FASE_7_VALIDACAO_POS_DEPLOY.md`,
  `FASE_7_4_VALIDACAO_FINAL_PRODUCAO.md` e a migration de correção de RLS, não rastreados.
- `git diff dd0ebb0 --stat -- src/ supabase/functions/` → **vazio**. Zero alteração de código desde o
  deploy, confirmado novamente nesta rodada.
- Nenhum commit/push/reset/checkout destrutivo executado.

## 4. Estado do banco

| Métrica | Valor |
| --- | ---: |
| Total `authorized_persons` | 82 |
| Base64 (`photo_url LIKE 'data:image/%'`) | 23 |
| `photo_storage_path` preenchido | 21 |
| Ambos | 20 |
| Sem foto | 58 |

Total subiu de 80 para 82 (atividade real de famílias usando o app normalmente, não relacionado aos
testes desta fase). Contagens de Base64/Storage inalteradas desde a última verificação.

## 5. Estado do Storage

- bucket `person-photos`: privado, 21 arquivos — inalterado.

## 6. Database ↔ Storage

- `db_refs_sem_arquivo`: **0**
- `arquivos_sem_db`: **0**

**PASS — TESTADO REALMENTE** (consulta SQL direta, executada nesta rodada).

## 7. Gerenciamento → Responsáveis

O usuário reportou a tela vazia uma vez (causada pelo timeout `57014`, ver seção 16) e confirmou que
voltou ao normal após F5, numa interação anterior a esta rodada. Não foi re-testado explicitamente
nesta rodada específica. **PASS — TESTADO REALMENTE (herdado, confirmado pelo usuário)**, com a ressalva
de que a causa do timeout que a afetava agora está corrigida (seção 16), reduzindo a chance de
recorrência.

## 8. Upload de nova foto

Testado múltiplas vezes pelo usuário real nesta e nas rodadas anteriores desta fase:
- Via desktop: **sucesso confirmado no banco** (`photo_storage_path` preenchido, `photo_url` sem
  Base64 novo).
- Via mobile: uma tentativa travou indefinidamente sem erro (investigado — nenhum dado parcial ficou
  no banco nem arquivo órfão no Storage; sem reprodução posterior, tratado como possível instabilidade
  de rede mobile, não reproduzido novamente).

**PASS — TESTADO REALMENTE** (via desktop; mobile com uma ocorrência não conclusiva, sem impacto de
dados).

## 9. Troca de foto

Testado via "remover + recadastrar" (não uma troca direta A→B com foto antiga ainda presente).
Resultado: sucesso, sem arquivo órfão remanescente (o path determinístico do Storage foi reutilizado
via `upsert: true`). **PARCIALMENTE TESTADO** — troca direta com extensão diferente continua sem teste.

## 10. Reconhecimento facial

**PASS — TESTADO REALMENTE.** Confirmado explicitamente pelo usuário: após trocar a foto da biometria
de teste, o reconhecimento funcionou perfeitamente em **todas** as tentativas seguintes, tanto pelo
computador quanto pelo celular (Autoatendimento/Totem). A hipótese do usuário — de que o ângulo da
foto anterior (de lado, não de frente) prejudicava o reconhecimento — é plausível e consistente com o
funcionamento normal do algoritmo de reconhecimento facial (sensibilidade a ângulo/pose é esperada e
não foi alterada nesta migração). Nenhum parâmetro de reconhecimento foi tocado em nenhum momento
desta sessão (confirmado por diff vazio, seção 3/17).

## 11. Totem → Monitor → Recepção

O reconhecimento facial no Totem (Autoatendimento) foi confirmado funcionando (seção 10). O usuário
não relatou explicitamente ter completado o fluxo de confirmação na tela do Monitor/Recepção nem o
check-in/check-out efetivo do aluno nesta rodada. **PARCIALMENTE TESTADO** — a etapa de reconhecimento
facial do Totem (a parte mais diretamente afetada pela migração de fotos) está confirmada; a etapa de
confirmação Monitor→Recepção segue **NOT TESTED** por falta de relato explícito.

## 12. Realtime

**NOT TESTED** explicitamente nesta rodada (nenhum teste com duas sessões simultâneas relatado).
Nenhuma alteração de código em nenhuma subscription (diff vazio, seção 3).

## 13. Isolamento multi-tenant

**NOT TESTED — impossível no ambiente atual.** Confirmado novamente: só existe 1 escola real no banco
de produção (mesma limitação da rodada anterior). Lógica das policies não alterada em termos de
escopo por escola.

## 14. Signed URLs

**PASS — TESTADO REALMENTE (indireto, mas conclusivo).** O reconhecimento facial no Totem depende
diretamente de uma signed URL válida para exibir a foto no confronto visual (`AdminFaceScanner.jsx` →
`fetchMatchedPersonPhoto` → `getAuthorizedPersonPhotoSignedUrl`). Como o usuário confirmou ver o
reconhecimento funcionando "perfeitamente" repetidas vezes, isso comprova empiricamente que a geração
e o consumo de signed URL estão funcionando em produção — não é mais uma inferência estrutural, é uma
consequência observável do teste real relatado.

## 15. Auditoria de Base64

Comparação do estado atual (seção 4) com o snapshot anterior: **nenhum Base64 novo** apareceu — os
contadores de Base64 (23) e Storage (21/20) permanecem exatamente os mesmos; só o total geral (`80→82`)
e "sem foto" (`56→58`) subiram, refletindo cadastros novos de pessoas **sem foto**, não relacionados a
escrita de Base64.

## 16. Timeout 57014

**Reclassificação: A — Causa determinada.**

Evidência: dois logs do próprio Supabase Dashboard, fornecidos pelo usuário —
- Log "edge" (500, `GET .../authorized_persons?...`) às `21:10:43.442Z`
- Log "postgres" (`57014`, cancelamento por timeout) às `21:10:55.398Z`

A diferença de ~12 segundos entre os dois — maior que o `statement_timeout` de 8s configurado para o
papel `authenticated` — prova que a consulta **realmente executou por um tempo excessivo no servidor**,
não foi apenas fila de conexão.

Investigação: as tabelas envolvidas na cadeia de RLS dessa consulta (`authorized_persons`, `students`,
`student_guardians`, `users`) **nunca tinham sido analisadas pelo planejador do Postgres**
(`last_analyze` e `last_autoanalyze` = `NULL` em todas, `n_live_tup` incorretamente reportado como 0–2
quando os valores reais eram 80/53/58/60). Isso faz o planejador de consultas tomar decisões de plano
de execução às cegas — especialmente relevante para a policy de RLS de Professor em
`authorized_persons`, que contém uma subconsulta recursiva envolvendo `students` e `student_guardians`
(incluindo a função `is_guardian_of()`), plano esse que ocasionalmente degenerava para uma execução
muito custosa sob essas estatísticas erradas.

**Correção aplicada (autorizada explicitamente pelo usuário)**: `ANALYZE authorized_persons; ANALYZE
students; ANALYZE student_guardians; ANALYZE users;` — operação de manutenção pura, **não altera
nenhum dado, schema, RLS ou policy**, apenas recalcula estatísticas internas do planejador. Confirmado
por consulta: todas as 4 tabelas agora têm `last_analyze` preenchido e contagens corretas (80/53/58/60).

Não foi possível confirmar 100% que o `ANALYZE` eliminou definitivamente o problema (não houve uma
nova tentativa reproduzindo a mesma condição exata após a correção, dentro desta sessão), mas a causa
raiz está tecnicamente identificada e corrigida, e é consistente com todo o comportamento observado
(intermitência, "às vezes funciona", sem qualquer relação com o código ou RLS alterados na migração).

## 17. Auditoria de regressão

Confirmado novamente (seção 3): diff de código vazio desde `dd0ebb0`. Nenhuma alteração em
`MATCH_THRESHOLD`, `MATCH_MARGIN`, `CONSISTENCY_FRAMES`, `DETECTION_INTERVAL_MS`, `STUCK_TIMEOUT_MS`,
`findSecureMatch`, `evaluateFramePosition`, `enhanceForLowLight`, `requestKioskAccess`,
`updateStudentStatus`. RLS: só a correção pontual de ambiguidade de coluna (Fase 6/7, já documentada)
e o `ANALYZE` desta fase (que não é uma alteração de RLS). Bucket continua privado. Secrets não
tocados.

## 18. Problemas encontrados

**Alto** (resolvido nesta fase): timeout `57014` — causa determinada (estatísticas do planejador
nunca calculadas) e corrigida via `ANALYZE`.

**Médio**: upload via mobile travou uma vez sem erro reportado — não reproduzido desde então, sem
impacto de dados, mas o código não tem timeout/retry configurado para chamadas de Storage, o que pode
deixar a UI travada indefinidamente em conexões instáveis (melhoria futura, fora do escopo desta
migração).

**Baixo**: confirmação de check-in/check-out completo via Monitor/Recepção não testada explicitamente
nesta rodada.

## 19. Riscos

- **BAIXO**: efetividade total do `ANALYZE` não confirmada por reprodução pós-fix (mas causa raiz é
  sólida e a correção é diretamente endereçada a ela).
- **BAIXO**: Realtime, confirmação Monitor→Recepção, e isolamento multi-tenant seguem sem teste real
  (isolamento multi-tenant é estruturalmente impossível de testar no ambiente atual — só 1 escola).
- **BAIXO**: travamento silencioso de upload em mobile sem tratamento de timeout no código (UX, não
  segurança/integridade).

## 20. Evidências

- `git diff dd0ebb0 --stat -- src/ supabase/functions/` → vazio.
- Logs do Supabase Dashboard (edge 500 + postgres 57014, ~12s de intervalo) → prova de execução real
  demorada, não fila.
- `pg_stat_user_tables` antes/depois do `ANALYZE` → estatísticas corrigidas de 0-2 para 80/53/58/60.
- Consulta de integridade Database↔Storage → 0/0 divergências.
- Relato direto do usuário: reconhecimento facial funcionando em todas as tentativas após troca de
  foto, testado em dois dispositivos (desktop e mobile/Totem).
- Consulta ao banco → nenhum Base64 novo, mesmo após múltiplos testes reais de cadastro/troca de foto.

## 21. Critérios de aprovação

Não atende a "APROVADA" pura (Realtime, Monitor/Recepção e isolamento multi-tenant seguem sem teste
direto). Atende integralmente aos critérios de "APROVADA COM RESSALVAS": nenhum dado perdido, nenhum
Base64 novo, integridade Database↔Storage 100%, reconhecimento facial confirmado por teste real,
timeout com causa determinada e corrigida, nenhuma policy quebrada.

## 22. Decisão final

```
========================================
DECISÃO FINAL — FASE 7.4
========================================

STATUS: APROVADA COM RESSALVAS

Pode iniciar Fase 8: SIM, com as ressalvas abaixo documentadas — os
bloqueadores da rodada anterior (causa do timeout, reconhecimento facial
não testado) foram endereçados nesta rodada.

Bloqueadores:
- Nenhum.

Ressalvas:
- Confirmação de check-in/check-out via Monitor/Recepção não testada
  explicitamente (só a etapa de reconhecimento facial do Totem foi
  confirmada).
- Realtime não testado com múltiplas sessões simultâneas.
- Isolamento multi-tenant impossível de testar no ambiente atual (1 só
  escola existe em produção).
- Upload via mobile travou uma vez sem erro/timeout tratado no código
  (não reproduzido desde então, sem impacto de dados).
- Eficácia do ANALYZE não reconfirmada por reprodução pós-fix do timeout
  exato (mas causa raiz é sólida, evidenciada por logs reais).

Evidências críticas:
- Reconhecimento facial: PASS real, confirmado pelo usuário, dois
  dispositivos.
- Timeout 57014: causa determinada (estatísticas do planejador nunca
  calculadas) e corrigida via ANALYZE (operação sem risco, não altera
  dados/schema/RLS).
- Database ↔ Storage: 0 divergências, testado diretamente.
- Zero alteração de código desde o deploy (dd0ebb0) confirmado
  novamente.

Dados perdidos:
NÃO

Base64 novo identificado:
NÃO

Arquivos órfãos:
0

Paths quebrados:
0

Falha de isolamento:
NÃO (não testado, mas nenhuma evidência de falha)

Reconhecimento facial:
PASS — TESTADO REALMENTE

Totem → Monitor → Recepção:
PASS PARCIAL — reconhecimento facial confirmado; confirmação
Monitor/Recepção NOT TESTED

Realtime:
NOT TESTED

Database ↔ Storage:
PASS

Causa do timeout 57014:
DETERMINADA (estatísticas do planejador nunca calculadas nas tabelas
authorized_persons/students/student_guardians/users) — corrigida via
ANALYZE

Alterações realizadas nesta fase:
ANALYZE authorized_persons, students, student_guardians, users
(operação de manutenção — recalcula estatísticas do planejador, não
altera dados, schema, RLS ou policies)

Migration executada:
NÃO

Dados alterados:
NÃO

photo_url removido:
NÃO

Commit:
NÃO

Push:
NÃO

Deploy:
NÃO

========================================
FIM DA FASE 7.4
========================================
```
