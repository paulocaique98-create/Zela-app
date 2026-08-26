# FASE 10 — AUDITORIA DE FECHAMENTO DA MIGRAÇÃO

## 1. Diagnóstico Inicial

Consulta SQL direta, agora (não presunção):

| Categoria | Quantidade |
|---|---:|
| Total `authorized_persons` | 82 |
| `photo_url IS NOT NULL` | 3 |
| `photo_url` é Base64 | 3 |
| `photo_storage_path IS NOT NULL` | 24 |
| `photo_url` NULL + Storage preenchido | 24 |
| `photo_url` + Storage ambos preenchidos | **0** |
| `photo_url` preenchido + Storage NULL | 3 |

Idêntico ao estado do fim da Fase 9 — nenhuma mudança de dado entre as fases.

## 2. Estado dos 3 Registros

| ID | Nome | MIME real (magic bytes) | Tamanho | Arquivo já existe no Storage? | Classificação |
|---|---|---|---:|---|---|
| `1401cbf8-a717-4ab1-bd52-f354ab4381e5` | Luanna Almeida Esteves | image/jpeg (confere com declarado) | 1655.2 KB | Não | **A — MIGRÁVEL COM SEGURANÇA** |
| `19671f65-cb6c-43a9-b85b-78aab5819e3c` | Vitor José Testoni Gomes | image/jpeg (confere com declarado) | 187.6 KB | Não | **A — MIGRÁVEL COM SEGURANÇA** |
| `723454a8-2685-41a6-ab98-05f1bc1740b3` | Joíse Flor Cezar Rosa | image/jpeg (confere com declarado) | 3170.6 KB | Não | **A — MIGRÁVEL COM SEGURANÇA** |

Validação: decodifiquei o Base64 de cada um localmente (nunca impresso, apagado logo após), confirmei
os magic bytes reais (`FF D8 FF` = JPEG) batendo com o MIME declarado, e que nenhum excede o limite de
5MB do bucket. Nenhum tem `photo_storage_path` nem arquivo pré-existente no bucket com o mesmo ID —
ou seja, uma eventual migração futura não teria conflito de path.

**Nenhuma migração foi executada nesta fase.** Esta é só a classificação — a decisão de migrar (ou
não) estes 3 fica para uma fase futura com autorização própria.

## 3. Auditoria de Escritores de photo_url

| Local | Operação | Lê/Escreve | Ativo? | Necessário? | Ação |
|---|---|---|---|---|---|
| `src/App.jsx` — `togglePhoto()` | Escreve `photo_storage_path` (não `photo_url`) para foto nova; zera ambos na remoção explícita | Escreve | Sim | Sim (fluxo de foto) | Nenhuma |
| `src/App.jsx` — `handleSaveAuth()` | INSERT sem `photo_url`/`photo_storage_path` | Escreve (sem foto) | Sim | Sim (cadastro de nome) | Nenhuma |
| `AdminUserRegistration.jsx` | INSERT/UPDATE sem foto | Escreve (sem foto) | Sim | Sim | Nenhuma |
| `AdminImportModal.jsx` | INSERT sem foto | Escreve (sem foto) | Sim | Sim | Nenhuma |
| RPC `approve_matricula` | INSERT sem foto | Escreve (sem foto) | Sim | Sim | Nenhuma |

**Nenhum caminho ativo grava Base64 em `photo_url`.** Confirmado por auditoria de código (diff vazio
desde `dd0ebb0`) **e** por evidência empírica direta (seção 8 — 4 cadastros/trocas reais pós-deploy,
0 geraram Base64).

## 4. Auditoria de Leitores de photo_url

| Local | Operação | Lê/Escreve | Ativo? | Necessário? | Ação |
|---|---|---|---|---|---|
| `App.jsx` (`formattedAuth`) | Leitura híbrida: `photo_storage_path ? signedUrl\|\|photo_url : photo_url` | Lê | Sim | **Sim, enquanto existirem os 3 registros sem Storage** | Manter |
| `AdminFaceScanner.jsx` (`fetchMatchedPersonPhoto`) | Mesma lógica híbrida | Lê | Sim | Sim, mesma razão | Manter |
| `AdminUserManagement.jsx` | Mesma lógica híbrida, em lote | Lê | Sim | Sim, mesma razão | Manter |
| `FamilyAuthorized.jsx`, `AdminFaceEnrollment.jsx`, `TeacherMonitor.jsx`, `AdminSettings.jsx` | Só exibem `.photo_url` já resolvido pelos componentes acima | Lê (indireto) | Sim | Sim, mesma razão | Manter |

**O fallback para `photo_url` continua funcionalmente necessário HOJE**, exclusivamente por causa dos
3 registros da seção 2. Se esses 3 forem migrados (ou removidos) numa fase futura, o fallback deixa de
ter qualquer caso de uso real — mas ainda assim eu recomendaria mantê-lo no código por segurança
adicional, e só reavaliar sua remoção separadamente.

## 5. Auditoria de RPCs / Edge Functions / Triggers

- **RPC `approve_matricula`**: não grava foto (confirmado, seção 3).
- **Edge Function `face-auth`**: só `SELECT` em `authorized_persons` — não escreve.
- **Edge Function `create-family-user`**: não cria `authorized_persons` (comentário explícito no
  código confirma isso, decisão de fase anterior).
- **Triggers em `authorized_persons`**: busca em todas as migrations por
  `CREATE TRIGGER.*authorized_persons` → **0 resultados**. Nenhuma trigger existe.
- **Views/procedures**: nenhuma encontrada referenciando `photo_url`.
- **Jobs agendados**: nenhum encontrado no projeto relacionado a fotos/Storage.

**Nenhum mecanismo do banco escreve `photo_url`.**

## 6. Integridade Database ↔ Storage

Consulta SQL direta, agora:

| Métrica | Resultado |
|---|---:|
| Registros com `photo_storage_path` | 24 |
| Arquivos no bucket `person-photos` | 24 |
| Registros sem arquivo correspondente | **0** |
| Arquivos órfãos (sem registro) | **0** |
| MIME inválido no bucket | **0** |
| Paths duplicados | **0** |

Correspondência exata 1:1, sem nenhuma inconsistência.

## 7. Integridade do Backup

`_fase8_backup_photo_url`: **20 registros, 20 IDs únicos** — sem duplicação, sem perda, não alterada
nesta fase.

## 8. Novos Cadastros Pós-Deploy

Consulta por `biometric_consent_at` posterior à conclusão do deploy (`2026-08-25 19:52:32Z`) — o
timestamp é gravado em toda chamada de `togglePhoto()`, então captura qualquer atividade real de
cadastro/troca de foto desde então:

| ID | `photo_url` | `photo_storage_path` | Situação |
|---|---|---|---|
| `169186a4-bee0-4a6e-8e80-ad049765f808` | NULL | preenchido | Storage — sem Base64 |
| `6e877213-32a6-4b08-8fad-50ff15e730ba` | NULL | preenchido | Storage — sem Base64 |
| `9e25ae61-4c3b-462f-b161-6aa757313752` | NULL | preenchido | Storage — sem Base64 |
| `6f009168-059c-4486-a8fc-b343d92522b6` | NULL | preenchido | Storage — sem Base64 |

**4/4 atividades reais de foto desde o deploy foram para o Storage, 0/4 geraram Base64.** Esta é a
evidência mais direta possível — não é análise estática, é comportamento real observado em produção.

## 9. Reconhecimento Facial

`MATCH_THRESHOLD`, `MATCH_MARGIN`, `CONSISTENCY_FRAMES`, `DETECTION_INTERVAL_MS`, `STUCK_TIMEOUT_MS`,
`findSecureMatch`, `evaluateFramePosition`, `enhanceForLowLight`: **nenhuma alteração** — confirmado
por `git diff dd0ebb0 --stat -- src/ supabase/functions/` vazio, reconfirmado nesta fase.

## 10. Totem → Monitor → Recepção

`requestKioskAccess`, `updateStudentStatus`, fluxo de confirmação: **nenhuma alteração** — mesma
evidência (diff vazio).

## 11. Realtime

Subscriptions de `students`, `emergency`, `chat`, `notifications`: **nenhuma alteração** — mesma
evidência (diff vazio). **NÃO TESTADO EM RUNTIME** com múltiplas sessões simultâneas (sem ambiente
disponível para isso).

## 12. Segurança / RLS

- RLS: intacta, nenhuma alteração nesta fase.
- Policies do bucket `person-photos`: 9 policies em `storage.objects` (mesmo número desde a correção
  da Fase 6), nenhuma tocada.
- Bucket: `public = false`, confirmado.
- Secrets: nenhuma chave persistida em arquivo versionado.

## 13. Build

`npm run build` → **PASS**, sem erros.

## 14. Lint

`npm run lint` (oxlint) → **PASS**, só warnings de estilo pré-existentes em arquivos não relacionados
à migração (`AdminPasswordLogin.jsx`, `AdminChat.jsx`, `AdminCardapio.jsx`, etc. — variáveis/parâmetros
não usados). Nenhum warning novo, nenhum relacionado a `photo_url`/Storage/Base64.

## 15. Testes Manuais Pendentes

Não invento resultado para nenhum destes — seguem como pendências reais:

| Teste | Status |
|---|---|
| Cadastro de novo responsável com foto | **PASS — já testado realmente** (seção 8, 4 ocorrências reais) |
| Alteração de foto | **PASS — já testado realmente** (seção 8) |
| Exclusão de foto | **PASS — já testado realmente** (Fase 7, registro `169186a4`) |
| Reconhecimento facial | **PASS — já testado realmente** (Fase 7.4, usuário confirmou 2 dispositivos) |
| Totem → Monitor → Recepção (fluxo completo de confirmação) | **NÃO TESTADO EM RUNTIME** — só a etapa de reconhecimento facial do Totem foi confirmada, não a confirmação na tela de Recepção |
| Realtime (duas sessões simultâneas) | **NÃO TESTADO EM RUNTIME** |
| Multi-tenant (Escola A vs Escola B) | **NÃO TESTÁVEL NESTE AMBIENTE** — só existe 1 escola em produção |

## 16. Condições para Remover photo_url

| Condição | Status |
|---|---|
| Nenhum novo Base64 sendo gravado | ✅ Comprovado (seção 8) |
| Nenhum código ativo escreve `photo_url` | ✅ Comprovado (seção 3) |
| Nenhum RPC escreve `photo_url` | ✅ Comprovado (seção 5) |
| Nenhuma Edge Function escreve `photo_url` | ✅ Comprovado (seção 5) |
| Nenhum trigger escreve `photo_url` | ✅ Comprovado (seção 5) |
| Nenhuma tela depende funcionalmente de `photo_url` | ❌ **FALSO** — as telas ainda dependem dele como fallback para os 3 registros da seção 2 |
| Todos os registros com fotos possuem `photo_storage_path` | ❌ **FALSO** — 3 registros ainda só têm Base64 |
| Todos os arquivos possuem correspondência | ✅ Comprovado (seção 6) |
| Nenhum arquivo órfão | ✅ Comprovado (seção 6) |
| Nenhum registro sem arquivo | ✅ Comprovado (seção 6) |
| Signed URLs funcionando | ✅ Comprovado (Fase 8, teste HTTP real 20/20) |
| Leitura via Storage funcionando | ✅ Comprovado (seção 8, atividade real) |
| Novos cadastros funcionando | ✅ Comprovado (seção 8) |
| Troca de foto funcionando | ✅ Comprovado (seção 8) |
| Exclusão de foto funcionando | ✅ Comprovado (Fase 7) |
| Fallback legado não é mais necessário | ❌ **FALSO** — ainda protege os 3 registros |
| Backup necessário foi preservado | ✅ Comprovado (seção 7) |
| Testes de produção relevantes concluídos | 🟡 Parcial — Monitor/Recepção e Realtime seguem sem teste direto |

**Conclusão: a remoção de `photo_url` NÃO pode ser recomendada ainda.** 3 de 18 condições falham
diretamente por causa dos 3 registros pendentes, e mais 2 seguem parciais por falta de teste de
runtime. Isso não é um bloqueio de segurança — é a barra alta e correta que a própria fase pede antes
de um DROP definitivo.

## 17. Riscos

- **BAIXO**: 3 registros seguem sem proteção de Storage (mesmo risco já monitorado desde a Fase 5,
  sem mudança).
- **BAIXO**: testes de Monitor/Recepção e Realtime multi-sessão seguem sem validação direta.
- **BAIXO**: tabela de backup `_fase8_backup_photo_url` continua guardando dados biométricos
  duplicados temporariamente (mesma observação da Fase 9).

Nenhum risco médio, alto ou crítico identificado.

## 18. Alterações Realizadas

Nenhuma. Esta fase foi exclusivamente de leitura/auditoria (consultas SQL `SELECT`, `git diff`,
`npm run build`, `npm run lint` — nenhum `UPDATE`/`INSERT`/`DELETE`/migration executado).

## 19. Alterações NÃO Realizadas

- Nenhuma migração dos 3 registros restantes.
- Nenhuma remoção de `photo_url`.
- Nenhuma remoção do backup.
- Nenhuma alteração de RLS/policies.
- Nenhum commit/push/deploy.

## 20. Git

- `git status --short`: mesmos arquivos não rastreados/modificados de sempre (relatórios + migration
  de RLS), nada novo.
- `git diff dd0ebb0 --stat -- src/ supabase/functions/`: vazio.
- Nenhum commit, push, reset ou checkout destrutivo executado.

## 21. Regra de Parada

Não foi acionada. Nenhuma das condições de bloqueio (Base64 sem possibilidade de migração segura,
MIME inválido, arquivo corrompido, escritor ativo, RLS alterada, bucket público, etc.) foi encontrada.

## 22. Recomendação para Fase 11

**Não executar nada disso agora — apenas recomendação.**

1. Decidir se os 3 registros restantes (classificados como A — migráveis com segurança) devem ser
   migrados usando o mesmo processo validado da Fase 5 (dry-run → autorização → execução → validação
   individual).
2. Só depois de migrados (ou de uma decisão explícita de não migrá-los), reavaliar as condições da
   seção 16 — nesse ponto, "nenhuma tela depende funcionalmente de `photo_url`" e "todos os registros
   com fotos possuem `photo_storage_path`" passariam a ser verdadeiras.
3. Buscar validar, quando possível, os testes de runtime pendentes (Monitor/Recepção, Realtime
   multi-sessão) — não bloqueiam a decisão sobre `photo_url`, mas fecham a cobertura de testes.
4. Só então considerar uma fase específica para remoção do fallback de código e, separadamente, do
   `DROP COLUMN photo_url` — sempre como decisão explícita e isolada, nunca implícita numa fase de
   auditoria.

---

## Classificação Final

# 🟡 FASE 10 — APROVADA COM RESSALVAS

Todas as auditorias de segurança, integridade de dados e ausência de escritores Base64 foram
comprovadas com evidência real e direta (incluindo o teste mais forte possível: atividade real de
produção pós-deploy, 4/4 sem Base64). As ressalvas são exclusivamente: (1) 3 registros ainda
pendentes de decisão/migração, e (2) testes de runtime que exigem múltiplas sessões/hardware
específico, sem indício de problema, só ausência de cobertura direta. **A remoção de `photo_url` não
está autorizada nesta fase** — as condições da seção 16 ainda não são todas verdadeiras.
