# FASE 5 — Migração Controlada Base64 → Storage

Status atual: **FASES 5.1 a 5.10 concluídas. MIGRAÇÃO REALIZADA COM SUCESSO (21/21).**

## 1. Objetivo

Migrar os registros legados de `authorized_persons.photo_url` (Base64) para o Supabase Storage
(bucket `person-photos`), preenchendo `authorized_persons.photo_storage_path`, **sem apagar
`photo_url`** nesta fase.

## 2. FASE 5.1 — Diagnóstico

Consulta direta em produção, sem presumir os números do relatório da Fase 4.

| Métrica | Esperado anterior | Estado atual |
|---|---|---|
| authorized_persons (total) | 78 | **78** |
| photo_url Base64 (`data:image/%`) | 21 | **21** |
| photo_storage_path preenchidos | 0 | **0** |
| photo_storage_path + photo_url ambos preenchidos | 0 | **0** |
| Sem foto (nem photo_url nem photo_storage_path) | — | **57** |
| Arquivos no bucket `person-photos` | 0 | **0** |

**Nenhuma divergência** em relação ao relatório da Fase 4/5.4 anterior. Prosseguindo.

Todos os 21 candidatos pertencem à mesma escola (`5135570d-...`) — dado apenas observacional, não é um problema.

## 3. FASE 5.2 — Dry-run

Nenhum upload e nenhum UPDATE foi executado nesta etapa. Para cada um dos 21 candidatos
(`photo_url IS NOT NULL AND photo_url LIKE 'data:image/%' AND photo_storage_path IS NULL`):

1. Extraí o Base64 do banco para um arquivo temporário local (fora do repositório, na pasta
   scratchpad da sessão), processei com um script Node local, e **apaguei o arquivo temporário
   imediatamente após a validação** — o Base64 não foi impresso em nenhum log, console ou este
   relatório.
2. Decodifiquei cada Base64 e comparei o MIME declarado no prefixo `data:image/...` contra o
   MIME real detectado pelos **magic bytes** (`FF D8 FF` = JPEG, `89 50 4E 47` = PNG, `RIFF...WEBP` = WEBP).
3. Calculei o tamanho real em bytes do conteúdo decodificado (não uma estimativa).
4. Determinei o path determinístico `{school_id}/{authorized_person_id}.{ext}` para cada um.
5. Verifiquei conflitos de path entre os 21 candidatos.

### Resultado

| ID | Escola (prefixo) | MIME declarado | MIME real | Tamanho (KB) | Resultado |
|----|---|---|---|---|---|
| 0ceed8d1-3b3d-4e42-a54f-3eb73e056540 | 5135570d... | image/jpeg | image/jpeg | 586.2 | READY |
| 169186a4-bee0-4a6e-8e80-ad049765f808 | 5135570d... | image/jpeg | image/jpeg | 58.6 | READY |
| 2a21e8d8-60ca-46e1-aa83-8ca75c36e84a | 5135570d... | image/png | image/png | 2094.8 | READY |
| 401588c3-43af-4f59-9ddd-ebb0a4b57271 | 5135570d... | image/jpeg | image/jpeg | 111.5 | READY |
| 4da5f95b-5a80-470f-a183-a7b39778fb17 | 5135570d... | image/jpeg | image/jpeg | 1425.1 | READY |
| 4ea2b768-a990-4a69-aad3-fbea1d73d720 | 5135570d... | image/jpeg | image/jpeg | 2050.9 | READY |
| 5fa3a7f0-b23d-4c7e-80e6-cbb1e88133ce | 5135570d... | image/jpeg | image/jpeg | 54.0 | READY |
| 6ed3e80a-e189-4992-a70a-ca9724044cef | 5135570d... | image/jpeg | image/jpeg | 4103.5 | READY |
| 703101b6-dadb-4419-ab93-8f02da4fde66 | 5135570d... | image/jpeg | image/jpeg | 40.6 | READY |
| 892fe989-3582-47ac-aa29-1f48728f82c4 | 5135570d... | image/jpeg | image/jpeg | 1861.9 | READY |
| 8a5876f9-6070-4483-8146-6e72694a5dcc | 5135570d... | image/jpeg | image/jpeg | 114.8 | READY |
| 8ce745e6-8383-4884-a2e2-7bec971b8f1c | 5135570d... | image/jpeg | image/jpeg | 1631.8 | READY |
| 910abae5-4100-49ec-8762-7c2e323b340f | 5135570d... | image/jpeg | image/jpeg | 4792.3 | READY |
| acff6730-d16a-4edd-a978-3ee781116ed5 | 5135570d... | image/jpeg | image/jpeg | 344.4 | READY |
| bf5d0b77-f9f1-4d6f-ac71-f38815f9cf1d | 5135570d... | image/jpeg | image/jpeg | 3962.9 | READY |
| d0ed7b43-820d-4ce2-8e3a-1bc3bfeffcd6 | 5135570d... | image/jpeg | image/jpeg | 4226.4 | READY |
| da45d234-f8e6-4e60-9335-d2f31ad97499 | 5135570d... | image/jpeg | image/jpeg | 4294.0 | READY |
| de15abcc-47c5-4fd4-ba90-d3cac1e9eea0 | 5135570d... | image/jpeg | image/jpeg | 201.5 | READY |
| eadd8dd5-fa00-4179-9896-091c6f2c7cea | 5135570d... | image/jpeg | image/jpeg | 200.7 | READY |
| f412f1cb-7505-47d3-9a2c-a11a0ebcd6fb | 5135570d... | image/jpeg | image/jpeg | 1720.8 | READY |
| ff46b2ae-c6d1-4753-8cc8-f99eaee64d5b | 5135570d... | image/jpeg | image/jpeg | 129.9 | READY |

**Total candidatos:** 21
**Válidos (READY):** 21
**Inválidos (Base64/conteúdo):** 0
**Muito grandes (> 5 MB):** 0 (o maior tem 4792.3 KB, abaixo do limite de 5120 KB)
**MIME incompatível declarado × real:** 0
**Conflitos de path:** 0
**Prontos para migração:** 21

Maior arquivo: 4792.3 KB (`910abae5-...`) — dentro do limite de 5 MB do bucket, mas próximo o
suficiente para merecer atenção durante a execução real (upload mais lento, maior chance de timeout
de rede — será tratado individualmente, sem afetar os demais).

## 4. FASE 5.3 — Conclusão do dry-run

Nenhuma condição de parada foi disparada:
- número de candidatos (21) bate com o esperado;
- nenhum Base64 inválido;
- nenhum MIME inesperado ou divergente entre declarado e real;
- nenhum arquivo acima de 5 MB;
- nenhum conflito de path;
- nenhuma inconsistência de schema/bucket/policy detectada.

## 5. FASE 5.4 — PARADA OBRIGATÓRIA

Conforme instruído, a execução para aqui. **Nenhum upload foi feito. Nenhum UPDATE foi executado.
Nenhum dado foi migrado ou alterado.** `photo_url`, `photo_storage_path` e o bucket `person-photos`
seguem exatamente no mesmo estado do diagnóstico da seção 2.

Autorização recebida do usuário: "Pode seguir com a fase 5 seguindo o nosso padrão até agora".

## 6. FASE 5.5 — Execução real

Reaproveitei `uploadAuthorizedPersonPhoto` (mesma função de `src/lib/storage.js` usada pelo app) via
um script Node local (`scratch/fase5_migrate.mjs`, pasta ignorada pelo Git — não entra em nenhum
commit), autenticado com a **service role key** (necessária porque um script fora do navegador não
tem sessão de usuário admin/família para passar pela RLS de `storage.objects`; a chave foi fornecida
pelo usuário, usada só na memória do processo, nunca gravada em arquivo do repositório nem impressa em
log, e apagada do disco temporário logo após o uso).

Processamento **sequencial** (1 registro por vez, não paralelo), seguindo exatamente os 15 passos do
protocolo: valida Base64 → decodifica → valida MIME real (magic bytes) → valida tamanho → determina
extensão/path determinístico → checa se já existe → upload (`upsert:true`) → confirma existência do
arquivo → `UPDATE` apenas de `photo_storage_path` → confirma persistência → gera signed URL → valida
que a signed URL realmente serve uma imagem (HTTP 200 + `Content-Type: image/*`) → só então classifica
`MIGRATED`. Em nenhum momento `photo_url` foi lido para escrita nem alterado.

### Resultado por registro

Todos os 21 candidatos identificados no dry-run retornaram **MIGRATED**:

| Status | Quantidade |
|---|---|
| MIGRATED | **21** |
| Qualquer outro estado (falha/inconsistência) | 0 |

Nenhum `UPLOAD_FAILED`, `UPLOAD_OK_DB_UPDATE_FAILED`, `ORPHAN_FILE_REQUIRES_CLEANUP`,
`SIGNED_URL_VALIDATION_FAILED` ou `INCONSISTENT_STORAGE` ocorreu.

## 7. FASE 5.6/5.7 — Validação individual e global pós-migração

Consulta direta em produção após a migração:

| Métrica | Antes (Fase 5.1) | Depois | Observação |
|---|---|---|---|
| authorized_persons (total) | 78 | **79** | +1 registro novo, ver nota abaixo |
| photo_url Base64 | 21 | **22** | 21 migrados + 1 registro novo (ver nota) |
| photo_storage_path preenchidos | 0 | **21** | Exatamente os 21 migrados |
| photo_storage_path + photo_url ambos preenchidos | 0 | **21** | Confirma que `photo_url` NÃO foi apagado em nenhum dos migrados |
| Arquivos no bucket `person-photos` | 0 | **21** | Bate exatamente com os 21 `photo_storage_path` preenchidos |

**Nota sobre a divergência 78→79 / 21→22:** durante a janela de execução do script (poucos segundos,
processamento sequencial), um **novo registro real** (`723454a8-2685-41a6-ab98-05f1bc1740b3`) foi
criado em produção — uma família cadastrando uma foto pelo app ao vivo. Esse registro não fazia parte
da lista de 21 candidatos porque foi criado *depois* da consulta que o script fez para montar a lista
de candidatos. Ele **não foi tocado, não foi migrado, e continua em Base64** — o que é o comportamento
correto e esperado, já que o código da Fase 4 (leitura/escrita híbrida) ainda **não foi commitado nem
deployado** em produção (ver seção 9 — Git), então o app em produção ainda grava novos cadastros em
Base64 puro. Este registro fica pendente para uma futura rodada da migração (fora do escopo desta
execução, que tinha alvo fechado nos 21 candidatos identificados no dry-run).

Validação individual: os 21 arquivos confirmados no bucket têm path no formato exato
`{school_id}/{id}.{ext}` e cada um foi validado via signed URL real (HTTP 200, `Content-Type`
começando com `image/`) durante a própria execução — não é uma alegação, é o critério que classificou
cada um como `MIGRATED` (ver seção 6).

## 8. Segurança

- RLS: **não alterada** (nenhuma migration nova nesta fase).
- Policies do bucket `person-photos`: as mesmas 3 criadas na Fase 3, não tocadas.
- Bucket: continua **privado**.
- Nenhum secret foi persistido em arquivo do repositório. A service role key usada existiu apenas
  como variável de ambiente do processo do script e num arquivo temporário fora do repositório,
  apagado imediatamente após o uso.
- Nenhum Base64, signed URL ou token foi impresso em console/log/relatório.

## 9. Reconhecimento facial e Totem → Monitor → Recepção

Grep de regressão no diff de `src/App.jsx` e `src/components/AdminFaceScanner.jsx` (únicos arquivos
com código de reconhecimento facial e do fluxo do Totem) restrito a linhas efetivamente alteradas
(`+`/`-`, não contexto): **zero ocorrências** de `MATCH_THRESHOLD`, `MATCH_MARGIN`,
`CONSISTENCY_FRAMES`, `DETECTION_INTERVAL_MS`, `STUCK_TIMEOUT_MS`, `findSecureMatch`,
`evaluateFramePosition`, `enhanceForLowLight`, `requestKioskAccess`, `updateStudentStatus`. Nenhum
código foi alterado nesta fase (o diff é idêntico ao da Fase 4 — a Fase 5 só tocou dados/Storage via
script externo, não código do app).

## 10. Build

`npm run build` → **PASS**, sem erros.

## 11. Git

- Commit: **NÃO**
- Push: **NÃO**
- Deploy: **NÃO**
- `git status --short`: mesmos 7 arquivos modificados desde a Fase 4 (`src/App.jsx`,
  `src/components/AdminFaceScanner.jsx`, `src/components/AdminPortal.jsx`,
  `src/components/AdminUserManagement.jsx`, `src/hooks/useChatUnreadCount.js`, `src/lib/storage.js`,
  `vercel.json`) + 2 arquivos novos não rastreados (`FASE_5_MIGRACAO_STORAGE.md`, a migration da
  Fase 3). Nada mudou no diff de código nesta fase.
- `scratch/fase5_migrate.mjs`: dentro de pasta ignorada pelo `.gitignore` (`scratch/`), não aparece
  no `git status` e não será commitado.

## 12. Conclusão

**MIGRAÇÃO COMPLETA (21/21)**, não parcial. Todos os critérios da "Regra de Sucesso" foram atendidos:
todos os 21 candidatos válidos processados, cada um com arquivo confirmado no Storage, cada um com
`photo_storage_path` preenchido, cada um com signed URL validada como funcional durante a execução,
`photo_url` original permanece intacto em todos os 21 (e em todos os outros 58 registros da tabela),
nenhuma perda de dados, nenhuma policy/RLS alterada, build passou, nenhum código protegido alterado,
nenhum commit/push/deploy feito.

**Pendência identificada (não é falha desta fase):** 1 registro novo criado durante a janela de
execução (`723454a8-...`) permanece em Base64, fora do escopo desta migração — candidato natural para
uma futura rodada, junto com quaisquer outros cadastros feitos em Base64 enquanto o código da Fase 4
não for deployado em produção.

## 13. Próximos passos (NÃO iniciados)

- Deploy do código da Fase 4 (commit/push, fora do escopo desta sessão sem autorização explícita) —
  só depois disso novos cadastros passam a ir direto pro Storage em produção, eliminando o tipo de
  divergência descrita na seção 7.
- Testes funcionais reais (login de cada papel, upload real pela UI, teste de isolamento RLS entre
  duas escolas, reconhecimento facial no totem físico) — **NÃO TESTADO** nesta fase, que foi focada em
  migração de dados via script, não em fluxo de usuário.
- Uma futura rodada de migração para pegar o registro `723454a8-...` (e quaisquer outros criados
  depois), quando fizer sentido.
- Remoção do `photo_url` legado (Base64) dos 21 registros migrados — **explicitamente fora do escopo**
  desta fase e de qualquer fase futura sem autorização própria e específica, conforme regra do
  prompt master.
