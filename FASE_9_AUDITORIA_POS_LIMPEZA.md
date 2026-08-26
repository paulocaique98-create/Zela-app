# FASE 9 — AUDITORIA PÓS-LIMPEZA

## 1. Estado inicial

Continuação direta do fim da Fase 8 (limpeza de 20 registros). Nenhuma ação destrutiva foi executada
nesta fase — só leitura/auditoria.

## 2. Git

- branch: `main`, commit: `dd0ebb0` (local = remoto).
- `git status --short`: `FASE_6_AUDITORIA_BASE64.md` modificado (relatório); `FASE_7_VALIDACAO_POS_DEPLOY.md`,
  `FASE_7_4_VALIDACAO_FINAL_PRODUCAO.md`, `FASE_8_LIMPEZA_BASE64.md` e a migration de correção de RLS,
  não rastreados. Nada foi descartado, resetado ou stashado.
- `git diff dd0ebb0 --stat -- src/ supabase/functions/` → **vazio**. Confirmado por evidência direta
  (não presunção): zero arquivos de código alterados desde o deploy.

## 3. Banco

**Fonte: consulta SQL direta, agora, não relatório anterior.**

| Estado | Quantidade |
|---|---:|
| Storage + Base64 | **0** |
| Storage sem Base64 | 24 |
| Base64 sem Storage | 3 |
| Sem foto | 55 |
| Inconsistente | 0 |
| **Total** | **82** |

`Storage + Base64 = 0` é a prova direta de que a Fase 8 zerou a sobreposição — nenhum registro
protegido pelo Storage ainda carrega Base64.

## 4. Storage

- bucket `person-photos`: `public = false` — confirmado por consulta direta agora.
- `file_size_limit`: 5242880 (inalterado).
- `allowed_mime_types`: `image/png, image/jpeg, image/webp` (inalterado).
- policies em `storage.objects` (todos os buckets): **9** — mesmo número desde a correção da Fase 6,
  nenhuma alterada/criada/removida nesta fase.
- total de arquivos no bucket `person-photos`: **24**.

## 5. Integridade Database ↔ Storage

**Fonte: consulta SQL direta (JOIN bidirecional), agora.**

- Direção A (Database → Storage): `db_sem_arquivo = 0` — 100% dos registros com `photo_storage_path`
  têm arquivo físico correspondente.
- Direção B (Storage → Database): `arquivos_orfaos = 0` — 100% dos arquivos do bucket têm registro
  correspondente.
- `total_arquivos (24) = total_com_path (24)` — correspondência exata 1:1.

## 6. Registros da Fase 8

**Fonte: consulta SQL direta cruzando a tabela `_fase8_backup_photo_url` com o estado atual, agora.**

- Backup: **20 registros, 20 IDs únicos, 20 com Base64 salvo** — sem duplicação, sem perda.
- Cruzamento Backup → Database → Storage, para os 20:
  - ID ainda existe em `authorized_persons`: **20/20**
  - `photo_url` está `NULL` agora: **20/20**
  - `photo_storage_path` preenchido: **20/20**
  - Arquivo correspondente existe no bucket: **20/20**

Todos os 20 registros da Fase 8 continuam íntegros, consistentes e com o backup disponível para
rollback caso necessário.

## 7. Registros Base64 restantes

**Fonte: consulta SQL direta, agora — não presumido a partir de relatórios anteriores.**

Total de registros com `photo_url LIKE 'data:image/%'`: **3**. Exatamente os mesmos 3 já identificados
nas Fases 6/7/8 — nenhum Base64 novo apareceu, nenhum desses 3 mudou de estado.

## 8. Os 3 registros fora da proteção

| ID | school_id | `photo_storage_path` | Tem backup na Fase 8? |
|---|---|---|---|
| `1401cbf8-a717-4ab1-bd52-f354ab4381e5` | `5135570d-...` | NULL | Não (corretamente — nunca foi elegível) |
| `19671f65-cb6c-43a9-b85b-78aab5819e3c` | `5135570d-...` | NULL | Não |
| `723454a8-2685-41a6-ab98-05f1bc1740b3` | `5135570d-...` | NULL | Não |

Nenhum deles foi tocado, migrado ou alterado. `photo_url` original permanece 100% intacto em todos os
3 (mesmo comportamento documentado desde a Fase 5/6: criados/alterados em produção antes do deploy do
código novo, quando o app ainda gravava Base64 diretamente).

## 9. Auditoria dos escritores

Reconfirmado nesta fase (não reaproveitado sem verificação — `git diff` rodado agora, seção 2):
zero escritores de `authorized_persons` capazes de gravar Base64 no código atual. Mapa (idêntico ao
das Fases 6/7/8, revalidado por diff vazio):

| Escritor | Pode gravar Base64? | Usa Storage? |
|---|---|---|
| `App.jsx` — `togglePhoto()` | NÃO | SIM |
| `App.jsx` — `handleSaveAuth()` | NÃO (nunca inclui foto) | N/A |
| `AdminUserRegistration.jsx` | NÃO (nunca inclui foto) | N/A |
| `AdminImportModal.jsx` | NÃO (nunca inclui foto) | N/A |
| RPC `approve_matricula` | NÃO (nunca inclui foto) | N/A |

## 10. Auditoria dos leitores

`App.jsx`, `AdminFaceScanner.jsx`, `AdminUserManagement.jsx`: leitura híbrida inalterada
(`photo_storage_path ? signedUrl||photo_url : photo_url`). `FamilyAuthorized.jsx` e
`AdminFaceEnrollment.jsx`: usam Data URL temporária (câmera/`FileReader`) só como estágio intermediário
antes de chamar `togglePhoto()` — não persistem Base64 diretamente. Nenhuma mudança desde a última
auditoria (diff vazio).

## 11. Auditoria do frontend

Nenhuma alteração de código nesta fase — auditoria estática reconfirma a arquitetura já documentada:
captura (câmera/upload) → Data URL temporária em memória → `uploadAuthorizedPersonPhoto()` → Storage →
`photo_storage_path` → leitura via signed URL, com fallback pro `photo_url` legado só quando
`photo_storage_path` é `NULL` (hoje, só os 3 registros da seção 8).

## 12. Auditoria do backend/RPC/Edge Functions

`approve_matricula` (RPC): nunca grava foto. `face-auth` (Edge Function): só leitura (`SELECT`).
`create-family-user`: não cria `authorized_persons` (removido em fase anterior desta sessão).
Nenhuma trigger em `authorized_persons` encontrada nas migrations. Nenhuma mudança desde a Fase 6/7.

## 13. Segurança

- RLS: intacta — nenhuma alteração nesta fase.
- Policies do bucket: intactas (9, mesmo número).
- Secrets: nenhuma service role key persistida em arquivo do repositório (`git ls-files | grep env` →
  só `.env.example`).
- Logs: nenhum Base64/signed URL impresso nesta fase (só contadores e status).

## 14. Multi-tenant

**Classificação: Auditado estaticamente — NÃO validado em runtime.** Só existe 1 escola real no banco
de produção (mesma limitação já documentada nas Fases 7/7.4). As policies de `storage.objects`
continuam validando `school_id` via `(storage.foldername(name))[1] = get_my_school_id()::text` **e**
posse do registro via `EXISTS` contra `authorized_persons` (não confiam só no path) — essa lógica não
foi alterada em nenhum momento desta sessão, só a referência de coluna ambígua foi corrigida (Fase 6).
Não declaro isolamento multi-tenant como "provado em produção" por falta de uma segunda escola para
testar de fato.

## 15. Backup da Fase 8

Confirmado (seção 6): tabela `_fase8_backup_photo_url` existe, 20 registros, 20 IDs únicos, sem
duplicação, todos com Base64 presente. **Não foi alterada nem removida nesta fase.**

## 16. Reconhecimento facial

`MATCH_THRESHOLD`, `MATCH_MARGIN`, `CONSISTENCY_FRAMES`, `DETECTION_INTERVAL_MS`, `STUCK_TIMEOUT_MS`,
`findSecureMatch`, `evaluateFramePosition`, `enhanceForLowLight`, câmera, canvas, descriptor, matching,
fallback QR/senha, cadastro biométrico: **nenhuma alteração** — confirmado por diff de código vazio
(seção 2). Adicionalmente, o usuário confirmou por teste real (fora desta fase, na Fase 7.4) que o
reconhecimento funcionou repetidas vezes após a migração.

## 17. Totem → Monitor → Recepção

`requestKioskAccess`, `updateStudentStatus`, Realtime de `students`, Monitor, Recepção, check-in,
check-out: **nenhuma alteração** — confirmado por diff de código vazio.

## 18. Realtime

Nenhuma alteração em subscriptions, channels, filters, cleanup, chat, notifications, students,
emergency — confirmado por diff de código vazio. Intacto.

## 19. Build

- `npm run build`: **PASS**, sem erros.
- `npm run lint` (oxlint — script existe, executado agora pela primeira vez nesta sessão): **PASS**,
  só warnings de estilo pré-existentes (imports/parâmetros não usados) em arquivos não relacionados à
  migração de fotos (`FamilyMatriculas.jsx`, `AdminPortal.jsx`, `Header.jsx`, etc.) — nenhum warning
  relacionado a `photo_url`, Storage ou Base64.
- `typecheck`: **NÃO DISPONÍVEL** (sem script, projeto JS puro).
- `test`: **NÃO DISPONÍVEL** (sem script configurado).

## 20. Testes

| Teste | Fonte da evidência | Resultado |
|---|---|---|
| Integridade Database↔Storage | Consulta SQL direta, nesta fase | PASS — testado realmente |
| Backup Fase 8 íntegro | Consulta SQL direta, nesta fase | PASS — testado realmente |
| Zero Base64 novo | Consulta SQL direta, nesta fase | PASS — testado realmente |
| Build | Execução real, nesta fase | PASS — testado realmente |
| Lint | Execução real, nesta fase | PASS — testado realmente |
| Cadastro/troca de foto | Herdado da Fase 7.4 (usuário real) | PASS — testado realmente (rodada anterior) |
| Reconhecimento facial | Herdado da Fase 7.4 (usuário real, 2 dispositivos) | PASS — testado realmente (rodada anterior) |
| Confirmação Monitor/Recepção | — | NÃO TESTADO EM RUNTIME |
| Realtime (múltiplas sessões) | — | NÃO TESTADO EM RUNTIME |
| Isolamento multi-tenant | — | NÃO TESTADO EM RUNTIME (impossível — só 1 escola) |
| Chat | — | NÃO TESTADO EM RUNTIME |

## 21. Riscos

- **BAIXO**: tabela de backup `_fase8_backup_photo_url` contém 20 cópias de dados biométricos
  sensíveis dentro do banco de produção — mesma sensibilidade que já existia, duplicada
  temporariamente para rollback. Recomenda-se removê-la só depois de um período de estabilidade
  comprovada.
- **BAIXO**: 3 registros seguem sem proteção de Storage (não é risco novo, é o mesmo estado já
  documentado e monitorado desde a Fase 5).
- **BAIXO**: testes de Monitor/Recepção, Realtime multi-sessão e isolamento multi-tenant seguem sem
  validação em runtime (nenhum indício de problema, só ausência de teste direto).

## 22. Pendências

- Decidir o destino dos 3 registros sem Storage (migrar como na Fase 5, ou deixá-los como estão
  indefinidamente).
- Validar em runtime, quando possível: confirmação completa Monitor→Recepção, Realtime multi-sessão,
  isolamento multi-tenant (requer uma segunda escola real).
- Decidir quando remover a tabela de backup `_fase8_backup_photo_url` (recomendo aguardar).

## 23. Conclusão

Todos os critérios verificáveis por auditoria estática, consulta direta ao banco e testes de
build/lint foram comprovados com evidência real nesta fase. Os critérios que dependem de
hardware/múltiplas sessões/segunda escola permanecem sem teste direto (não por falha, por
impossibilidade do ambiente atual), mas herdam confirmação real da Fase 7.4 para as partes mais
críticas (cadastro, troca de foto, reconhecimento facial).

### 🟡 FASE 9 — APROVADA COM RESSALVAS

Todos os pontos de segurança e integridade de dados foram comprovados com evidência real. As
ressalvas são exclusivamente testes de runtime que exigem múltiplas sessões/hardware/segunda escola —
nenhuma delas indica risco, apenas ausência de cobertura direta.

## 24. Recomendação para a Fase 10

**Não executar nada nesta mensagem — apenas recomendação para decisão futura.**

A Fase 10 deveria tratar, separadamente e com autorização própria:

1. Decisão sobre os 3 registros restantes (migrar via processo igual ao da Fase 5, ou manter como
   estão).
2. Eventual remoção definitiva da dependência de `photo_url` no código (remover o fallback, já que
   hoje só protegeria 3 registros).
3. Eventual remoção da coluna `photo_url` (schema change destrutivo — precisa de decisão explícita e
   separada).
4. Eventual remoção da tabela `_fase8_backup_photo_url` (só depois de período de estabilidade).
5. Migration final de limpeza de schema, se aprovada.
6. Validação pós-migration.
7. Plano de rollback para essa fase futura.

Nenhuma dessas ações foi executada ou iniciada nesta Fase 9.
