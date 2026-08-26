# FASE 12 — AUDITORIA FINAL DE DEPENDÊNCIAS DO PHOTO_URL

## 1. Resumo Executivo

Auditoria cruzada (código + banco + RPC + Edge Functions + triggers + migrations + Storage) não
encontrou nenhum escritor ativo de Base64, nenhum leitor crítico dependente exclusivamente de
`photo_url`, e nenhuma inconsistência entre banco e Storage. Existe, porém, um fallback de leitura
ainda presente no código (por design, desde a Fase 4) que hoje é tecnicamente redundante (0 registros
dependem dele de fato), mas seria acionado se `photo_url` fosse removido de forma abrupta sem também
ajustar o código. Por isso a classificação final não é "verde puro sem ressalva de código" — a coluna
pode ser removida com segurança do lado dos **dados**, mas o código precisa de um ajuste primeiro (não
executado nesta fase) para não referenciar mais a coluna.

## 2. Estado Real do Banco

Consulta SQL direta, agora:

| Situação | Quantidade |
|---|---:|
| Com Storage (só) | 24 |
| Com Base64 (só) | **0** |
| Ambos (Storage + Base64) | 3 |
| Sem foto | 55 |
| Inconsistente | 0 |
| **Total** | **82** |

## 3. Estado Real do Storage

- bucket `person-photos`: `public = false` (confirmado agora).
- `file_size_limit`: 5242880, `allowed_mime_types`: `image/png, image/jpeg, image/webp` — inalterados.
- Arquivos no bucket: **27**.
- Policies em `storage.objects` (todos os buckets): 9, inalteradas.

## 4. Integridade Database ↔ Storage

Consulta bidirecional direta, agora:

| Métrica | Resultado |
|---|---:|
| Registros com `photo_storage_path` | 27 |
| Arquivos no bucket | 27 |
| Registros sem arquivo | **0** |
| Arquivos órfãos | **0** |
| Paths duplicados | **0** |
| MIME inválido no bucket | **0** |
| Arquivos com tamanho 0 | **0** |

## 5. Quantidade de Registros com photo_url

`SELECT count(*) FROM authorized_persons WHERE photo_url IS NOT NULL` → **3**. Todos os 3 também têm
`photo_storage_path` preenchido (coexistência Base64+Storage, resultado intencional da Fase 11 —
nenhum Base64 foi apagado ainda).

## 6. Quantidade de Registros com photo_storage_path

`SELECT count(*) FROM authorized_persons WHERE photo_storage_path IS NOT NULL` → **27**. Corresponde
exatamente aos 27 arquivos do bucket (seção 4).

## 7. Auditoria de Escritores

Busca completa por `.insert(`/`.update(`/`.upsert(` em `authorized_persons`, em todo `src/` e
`supabase/`:

| Local | Linha | Escreve `photo_url`? |
|---|---|---|
| `src/App.jsx` — `togglePhoto()` | 638, 654 | Só na remoção explícita (`updates.photo_url = null`) — nunca grava Base64 |
| `src/App.jsx` — `handleSaveAuth()` (`dbPerson`, insert) | ~727-738 | Não — coluna nunca incluída |
| `src/components/AdminUserRegistration.jsx` | 565, 678 | Não — coluna nunca incluída |
| `src/components/AdminImportModal.jsx` | 301 | Não — coluna nunca incluída |
| RPC `approve_matricula` (`20260904_approve_matricula_rpc.sql:109,118`) | — | Não — coluna nem citada |

**Nenhum escritor ativo grava Base64.** Confirmado adicionalmente por evidência empírica direta da
Fase 10: 4 cadastros/trocas reais em produção pós-deploy, 4/4 sem Base64.

## 8. Auditoria de Leitores

Busca completa por `photo_url` em `src/` (37 ocorrências) — cada uma classificada individualmente na
seção 9. Resumo por componente:

| Tela | Fonte da foto | Fallback? | Depende de `photo_url` hoje? |
|---|---|---|---|
| `App.jsx` (`formattedAuth`, usado por Família/Admin) | `photo_storage_path` → signed URL, fallback `photo_url` | Sim | 🟡 Fallback presente, mas 0 registros o acionam de fato (todos com Storage) |
| `AdminFaceScanner.jsx` (confronto visual do Totem) | `photo_storage_path` → signed URL, fallback `photo_url` | Sim | 🟡 Idem |
| `AdminUserManagement.jsx` | `photo_storage_path` → signed URL, fallback `photo_url` | Sim | 🟡 Idem |
| `AdminFaceEnrollment.jsx` | Lê `person.photo_url` já resolvido por `App.jsx` | Indireto | 🟢 Não lê banco diretamente |
| `FamilyAuthorized.jsx` | Idem | Indireto | 🟢 Idem |
| `AdminPortal.jsx` (`requester`) | Idem | Indireto | 🟢 Idem |
| `TeacherMonitor.jsx` (`requester`) | Idem | Indireto | 🟢 Idem |
| `AdminPasswordLogin.jsx` | `u.photo_url` / `familyPerson.photo_url` | — | 🔴→🟢 **Código morto**: rastreei a origem de `u` (linha 254, de `matchedUsers`) e `familyPerson` (linha 176) — ambos vêm de queries que **nunca selecionam `photo_url`** (`select('id, name, role, doc_number, school_id')` e `select('*')` na tabela `students`, que não tem essa coluna). Essas duas referências **sempre avaliam `undefined`** — nunca renderizam, não são uma dependência real, é dead code pré-existente (não introduzido pela migração). |

## 9. Matriz Completa de Dependências

| Arquivo | Linha | Tipo | Uso | Ativo? | Depende de Base64? | Pode remover? |
|---|---|---|---|---|---|---|
| `App.jsx` | 398 | QUERY | `SELECT` inclui `photo_url` (leitura híbrida) | Sim | Não (só leitura) | Precisa remover a coluna do `select` junto |
| `App.jsx` | 483-499 | READ+FALLBACK | Resolve `photo_url` como fallback quando `photo_storage_path` é `NULL`/signed URL falha | Sim | Não | Requer ajuste de código antes de remover coluna |
| `App.jsx` | 610-611 | COMMENT | Explica a regra de não gravar mais Base64 | — | — | Pode remover junto com o código |
| `App.jsx` | 638 | WRITE | `updates.photo_url = null` na remoção explícita de foto | Sim | Não (só limpa) | Se a coluna não existir mais, essa linha vira no-op/erro — precisa remover |
| `App.jsx` | 667, 674 | WRITE/READ | Atualiza estado local com `photo_url` resolvido | Sim | Não | Requer ajuste |
| `AdminFaceScanner.jsx` | 236-237, 341 | COMMENT | Explica por que `photo_url` não entra no `select` de bulk | — | — | Pode remover |
| `AdminFaceScanner.jsx` | 335 | QUERY | `SELECT photo_url, photo_storage_path` (fetch individual pós-match) | Sim | Não | Requer ajuste |
| `AdminFaceScanner.jsx` | 346, 349 | READ+FALLBACK | Fallback pro Base64 legado no confronto visual do Totem | Sim | Não | Requer ajuste |
| `AdminFaceScanner.jsx` | 939-960 | READ (JSX) | Renderiza `matchedPerson.photo_url` (já resolvido) | Sim | Não | Requer ajuste |
| `AdminPortal.jsx` | 332-334 | READ (JSX) | Renderiza `requester.photo_url` (já resolvido) | Sim | Não | Requer ajuste |
| `AdminFaceEnrollment.jsx` | 73, 80, 244-245 | READ | Filtra/renderiza `person.photo_url` (já resolvido por `App.jsx`) | Sim | Não | Requer ajuste |
| `AdminPasswordLogin.jsx` | 261-262, 289-291 | READ (dead code) | `u.photo_url`/`familyPerson.photo_url` — fonte nunca inclui a coluna | **Não (nunca avalia truthy)** | Não | Pode remover sem nenhum efeito — já é inofensivo hoje |
| `AdminUserManagement.jsx` | 40, 52-53, 64, 211-212 | QUERY+READ+FALLBACK | Mesma lógica híbrida de `App.jsx`, em lote | Sim | Não | Requer ajuste |
| `FamilyAuthorized.jsx` | 137-138, 185 | READ (JSX) | Renderiza `person.photo_url` (já resolvido) | Sim | Não | Requer ajuste |
| `TeacherMonitor.jsx` | 77-79 | READ (JSX) | Renderiza `requester.photo_url` (já resolvido) | Sim | Não | Requer ajuste |
| `supabase/migrations/20260826_add_authorized_person_photo_storage.sql` | 1, 5, 15 | COMMENT/MIGRATION | Documenta a regra de não depender de `photo_url` | — | — | Migration histórica, não deve ser editada retroativamente |

**Conclusão da matriz**: nenhuma ocorrência é um escritor de Base64. Todas as ocorrências de leitura
real (não morta) fazem parte do mesmo padrão de fallback híbrido, **hoje redundante na prática** (0
registros o acionam — os 3 únicos com `photo_url` também têm `photo_storage_path`), mas ainda presente
*no código*. Isso significa: **remover a coluna do banco hoje não perderia nenhum dado nem quebraria
nenhum fluxo real** (porque nada depende de fato do valor), **mas quebraria o build/runtime** se o
código não for ajustado primeiro, porque várias linhas ainda fazem `SELECT ... photo_url ...` e
`updates.photo_url = null` — um `DROP COLUMN` faria essas queries falharem com erro de coluna
inexistente.

## 10. Auditoria de RPCs

Único RPC que insere em `authorized_persons`: `approve_matricula`
(`20260904_approve_matricula_rpc.sql`). Colunas inseridas: `family_id, school_id, name, relation,
has_photo, emergency_order`. **`photo_url` não é citada em nenhum lugar do arquivo.** Nenhuma
dependência.

## 11. Auditoria de Edge Functions

- `face-auth/index.ts`: `SELECT` em `authorized_persons` (linha 70) — **não inclui `photo_url`** no
  select (verificado: usa `face_descriptor`, `id`, `name`, etc., não a foto). Nenhuma dependência.
- `create-family-user/index.ts`: não cria `authorized_persons` (comentário explícito, linha 167).
- Demais 7 Edge Functions do projeto: nenhuma referencia `authorized_persons` ou `photo_url`.

## 12. Auditoria de Triggers

Busca em todas as migrations por `CREATE TRIGGER.*authorized_persons` → **0 resultados**. Nenhuma
trigger existe na tabela.

## 13. Auditoria de Migrations

- `20260826_add_authorized_person_photo_storage.sql`: cria `photo_storage_path` e o bucket; **não
  cria nem altera `photo_url`** — só a documenta em comentários.
- `20260826_fix_person_photos_rls_name_ambiguity.sql`: corrige RLS de `storage.objects`; não toca em
  `authorized_persons` nem `photo_url`.
- Nenhuma outra migration rastreada no repositório (`supabase/migrations/`) referencia `photo_url` —
  a coluna original foi criada fora do controle de migrations versionadas do projeto (antes da
  convenção atual), então **não existe migration de criação para reverter/espelhar** caso um `DROP
  COLUMN` seja feito no futuro — a única forma de restaurar seria um backup completo do banco ou a
  tabela `_fase8_backup_photo_url` (só cobre 20 dos 3+20=23 que já tiveram Base64 em algum momento; os
  3 atuais não têm backup próprio, mas continuam com `photo_url` intacto).

## 14. Auditoria de Queries

Toda query SQL/PostgREST que referencia `photo_url` foi listada na matriz (seção 9) — são
exclusivamente `SELECT` (leitura) e dois `UPDATE` que **zeram** o campo (`= null`), nunca um `UPDATE`
que grava conteúdo Base64.

## 15. Auditoria de Storage

- Bucket privado: confirmado (seção 3).
- Signed URLs: mecanismo inalterado desde a Fase 4, testado empiricamente com sucesso em todas as
  fases anteriores (Fase 8: 20/20 HTTP 200; Fase 11: 3/3 HTTP 200).
- Paths determinísticos: `{school_id}/{id}.{ext}`, confirmado 27/27 corretos.
- Nenhum código depende de bucket público.

## 16. Auditoria do Reconhecimento Facial

Grep em `AdminFaceScanner.jsx`, `AdminFaceEnrollment.jsx`, `FamilyAuthorized.jsx` por
`MATCH_THRESHOLD`, `MATCH_MARGIN`, `CONSISTENCY_FRAMES`, `DETECTION_INTERVAL_MS`, `STUCK_TIMEOUT_MS`,
`findSecureMatch`, `evaluateFramePosition`, `enhanceForLowLight` — todas as ocorrências são definições
e usos já existentes, **nenhuma delas referencia `photo_url` ou `photo_storage_path`**. O matching
opera exclusivamente sobre `face_descriptor` (vetor numérico, coluna separada, nunca tocada por esta
migração). `photo_url`/`photo_storage_path` só entram depois do match, exclusivamente para exibição
visual (confronto), nunca para decisão de matching. Nenhuma alteração nesta fase.

## 17. Auditoria Totem → Monitor → Recepção

Grep por `requestKioskAccess`, `updateStudentStatus` em todo `src/` — nenhuma ocorrência contém
`photo_url` na mesma função/escopo. Fluxo de Realtime de `students` não referencia `authorized_persons`
em nenhum momento. **Sem dependência.**

## 18. Auditoria Realtime

Nenhuma subscription (`students`, `chat_threads`, `emergency`) referencia `authorized_persons` ou
`photo_url`. Confirmado por grep, sem alteração de código nesta fase.

## 19. Auditoria de Segurança

- RLS de `authorized_persons`: nenhuma policy referencia `photo_url` na sua condição (`qual`) — só
  `family_id`, `school_id`, `id`, papéis. Confirmado por leitura das 5 policies já documentadas em
  fases anteriores desta sessão.
- Policies de `storage.objects`: dependem de `photo_storage_path` (via nome do arquivo), nunca de
  `photo_url`.
- Nenhuma policy quebraria com a remoção de `photo_url`.

## 20. Auditoria de Rollback

- Tabela `_fase8_backup_photo_url`: **20 registros**, confirmados intactos, não referenciada por
  nenhum código de produção (só pelos scripts de migração em `scratch/`, fora do Git).
- Os 3 registros migrados na Fase 11 **ainda têm `photo_url` no próprio banco** (não precisam de
  backup separado — o dado original está na própria coluna, intacto).
- Portanto, hoje existe cobertura de rollback para os 23 registros que já passaram por Base64 em algum
  momento (20 via tabela de backup + 3 via coluna original ainda preenchida). Se `photo_url` for
  removida sem mais nenhuma cópia, essa segunda camada de segurança desaparece — só restaria a tabela
  de backup (20/23).

## 21. Simulação Conceitual de photo_url Ausente

"Se `photo_url` deixasse de existir hoje, o que quebraria?"

**Dados**: nada quebraria — 0 registros dependem do valor para exibir foto corretamente (todos os 27
com foto têm `photo_storage_path` funcional).

**Código**: quebraria a compilação/execução, não a lógica de negócio. Especificamente:
- `App.jsx:398` — o `.select('...photo_url...')` falharia com erro de coluna inexistente (PostgREST
  retorna 400).
- `App.jsx:638` — `updates.photo_url = null` seria enviado ao `UPDATE`, mas a coluna não existiria →
  erro do PostgREST.
- `AdminFaceScanner.jsx:335` — mesmo problema no `.select('photo_url, photo_storage_path')`.
- `AdminUserManagement.jsx:40` — idem.

**Conclusão**: a remoção da coluna **exige, antes**, ajustar essas 4 queries e os pontos de leitura
associados (remover `photo_url` do `select`, remover a lógica de fallback, remover o
`updates.photo_url = null`) — isso é trabalho de código que **não foi feito nesta fase** (por
proibição explícita da Fase 12).

## 22. Problemas Encontrados

Nenhum problema de integridade, segurança ou dado. O único ponto relevante (não um "problema", uma
constatação): o código ainda tem 4 pontos que fariam uma query real por `photo_url` no banco, então um
`DROP COLUMN` direto hoje quebraria a aplicação — precisa de uma fase de ajuste de código antes.

## 23. Riscos

- **Risco de aplicação**: SIM — remover a coluna sem ajustar o código antes quebra 4 queries reais
  (seção 21). Não é risco de dado, é risco de build/runtime.
- **Risco de banco**: nenhum — sem função/trigger dependente.
- **Risco de segurança**: nenhum — nenhuma policy depende da coluna.
- **Risco de LGPD**: neutro a positivo — remover a coluna reduziria a superfície de dados biométricos
  armazenados (Base64 + Storage duplicado hoje), mas isso é uma decisão de fase futura, não desta.
- **Risco de reconhecimento facial**: nenhum — matching não depende da coluna.
- **Risco de Totem**: nenhum.
- **Risco de rollback**: BAIXO — cobertura via `_fase8_backup_photo_url` (20/23) + os 3 originais
  ainda no banco. Se a coluna for removida sem outra cópia de segurança, os 3 ficam sem backup
  próprio (mas continuam com `photo_storage_path` funcional, então não é perda de funcionalidade, só
  de possibilidade de rollback pro Base64 original).

## 24. Regra de Parada

**Não foi acionada.** Nenhuma das 20 condições de bloqueio da seção 5 do prompt foi encontrada
(nenhum escritor ativo, nenhum RPC/trigger/Edge Function dependente, nenhuma inconsistência
Database↔Storage, nenhuma dúvida razoável sobre segurança de dado).

## 25. Conclusão

Do ponto de vista de **dados e integridade**, o sistema está pronto: 100% das fotos protegidas pelo
Storage, zero Base64 desprotegido, zero órfãos, zero inconsistências, zero escritores ativos. Do ponto
de vista de **código**, a coluna ainda é referenciada em 4 queries reais e vários pontos de leitura —
não por necessidade funcional (o fallback nunca é acionado hoje), mas porque o código ainda a
menciona explicitamente. Remover a coluna do banco **sem antes remover essas referências do código
quebraria a aplicação**, mesmo sem perder nenhum dado.

## 26. Classificação Final

# 🟡 APROVADO COM RESSALVAS

**Motivo**: não existe nenhum risco de dado, segurança, integridade ou regressão funcional real —
todos os itens críticos da checklist da seção 30 do prompt estão comprovados. A única ressalva é que
o **código precisa ser ajustado antes** (remover os 4 pontos de query/fallback listados na seção 9/21)
— isso não é um bloqueio de segurança, é uma pré-condição técnica de sequenciamento que a própria Fase
12 pede para não confundir ("Fase 12 audita, Fase 13 decide"). Não posso classificar como 🟢 puro
porque o critério "0 queries críticas dependentes" da checklist da seção 30 não é 100% verdadeiro — são
4 queries que fariam a coluna ser lida ativamente (mesmo que sempre resultem em fallback não usado).

## 27. Recomendação Para Fase 13

**Não executar nada disso agora.**

Se e quando autorizada, a Fase 13 deveria, nesta ordem:

1. Ajustar o código (não o banco) para parar de referenciar `photo_url`: remover a coluna dos 4
   `.select()` (`App.jsx:398`, `AdminFaceScanner.jsx:335`, `AdminUserManagement.jsx:40` + a de
   `AdminFaceEnrollment`/outros que leem o campo já resolvido), remover a lógica de fallback híbrido
   (agora comprovadamente sem uso real) e remover `updates.photo_url = null` de `togglePhoto()`.
2. Buildar, testar, e só então commitar/deployar essa mudança de código (isoladamente, sem tocar no
   banco).
3. **Só depois do deploy do código ajustado**, considerar uma fase separada para `DROP COLUMN
   photo_url` — nesse ponto sim todos os 20 itens da checklist da seção 30 estariam verdadeiros.
4. Decidir separadamente o destino da tabela `_fase8_backup_photo_url` (manter por mais tempo, ou
   remover após confirmar estabilidade).

Nenhuma dessas ações foi executada nesta Fase 12.
