# RELATÓRIO FINAL — FASE 7

## 1. Diagnóstico inicial

Objetivo: provar, com evidência real (não presunção), que o deploy da Fase 4 está em produção, que o
Storage está íntegro, e que nenhum caminho ativo volta a gravar Base64. Durante esta fase, um teste
real do usuário revelou e permitiu corrigir um bug estrutural de RLS (documentado nas seções 14 e 19)
que bloqueava uploads de família desde a Fase 3 — corrigido e re-testado com sucesso dentro desta
mesma janela de trabalho.

## 2. Git

- branch: `main`
- commit anterior à Fase 7: `dd0ebb0` (confirmado local e remoto)
- commit esperado: `dd0ebb0` — **presente**
- alterações encontradas no início: nenhuma alteração de código; `FASE_6_AUDITORIA_BASE64.md`
  modificado (relatório) e `supabase/migrations/20260826_fix_person_photos_rls_name_ambiguity.sql`
  novo, não rastreado (a correção de RLS aplicada ao vivo durante a investigação do bug real relatado
  pelo usuário, autorizada explicitamente por ele antes desta Fase 7 começar).
- Nenhum `git commit`/`push` foi feito nesta fase.

## 3. Deploy

- commit publicado: `dd0ebb0`
- status: **`success`** — confirmado via GitHub Deployment Status API (fonte independente da Vercel,
  não apenas `git log`): `context: Vercel`, `description: "Deployment has completed"`.
- data/hora: `2026-08-25T19:52:32Z`
- **Confirmação adicional por conteúdo real do bundle**: baixei `index-QdSliR1F.js` diretamente de
  `https://sensekids.vercel.app/` e confirmei a presença de `photo_storage_path` e da string de erro
  exata do `togglePhoto()` novo (`"...salvar a foto..."`). **Prova direta, não indireta.**
- resultado: **DEPLOY CONFIRMADO.**

## 4. Banco

| Métrica | Antes (fim Fase 6) | Depois (agora) |
| --- | ---: | ---: |
| Total | 80 | 80 |
| Base64 (`photo_url LIKE 'data:image/%'`) | 24 | 23 |
| Storage (`photo_storage_path IS NOT NULL`) | 21 | 21 |
| Ambos | 21 | 20 |
| Sem foto | 56 | 56 |

**Explicação da variação Base64 24→23 e Ambos 21→20**: o registro de teste (`169186a4-...`) teve sua
foto removida e recadastrada durante o teste real desta fase. A remoção limpou o `photo_url` legado
(base64) que ele ainda carregava desde a Fase 5; o recadastro gravou a foto nova **só** no Storage
(`photo_storage_path` preenchido, `photo_url = NULL`). Total geral não mudou (nenhum registro
criado/apagado nesta fase).

## 5. Storage

- bucket: `person-photos` — existe.
- privacidade: `public = false` — confirmado.
- `file_size_limit`: 5242880 (5MB) — inalterado.
- `allowed_mime_types`: `image/png, image/jpeg, image/webp` — inalterado.
- quantidade de arquivos: **21**.
- integridade: **21/21 arquivos correspondem exatamente aos 21 registros com `photo_storage_path`
  preenchido** (ver seções 6 e 7).

## 6. Database → Storage

Consulta: para cada `authorized_persons.photo_storage_path IS NOT NULL`, `LEFT JOIN` em
`storage.objects` pelo path exato.

- **VALID: 21/21**
- MISSING_FILE: 0
- INVALID_PATH: 0
- SIGNED_URL_ERROR: não testado individualmente por script (ver seção 8)

## 7. Storage → Database

Consulta inversa: para cada arquivo em `storage.objects` do bucket `person-photos`, `LEFT JOIN` em
`authorized_persons` pelo `photo_storage_path`.

- **REFERENCED: 21/21**
- **ORPHAN: 0**
- UNKNOWN: 0

Nota: um arquivo órfão temporário existiu entre a Fase 5 e o teste desta fase (o arquivo original de
`169186a4-...`, deixado para trás quando a remoção de foto pelo app falhou silenciosamente no Storage).
Ele **deixou de ser órfão** quando o teste desta fase reutilizou o mesmo path determinístico
(`upsert: true` sobrescreveu o arquivo antigo com a foto nova). Não foi necessária nenhuma limpeza
manual — o próprio fluxo normal resolveu o caso. Nenhum órfão restante no bucket agora.

## 8. Signed URLs

- testadas via script isolado: **NÃO** — decidi não gerar signed URLs eu mesmo fora do fluxo real da
  aplicação para não precisar da service role key novamente sem necessidade estrita (regra 39 do
  prompt: "não utilizar Service Role Key se não for absolutamente necessário").
- **Evidência indireta forte de funcionamento**: o teste real do usuário, pela aplicação em produção,
  fez upload da foto, e o registro ficou com `photo_storage_path` preenchido e `has_photo/has_descriptor
  = true` sem nenhum erro reportado após a correção de RLS — isso depende implicitamente da geração de
  signed URL funcionar no fluxo de leitura posterior (`resolvedPhotoUrl` em `togglePhoto`), mas o
  usuário não confirmou explicitamente ter *visto* a foto renderizada na tela.
- resultado: **NÃO TESTADO DIRETAMENTE** (nem por mim via script, nem confirmado visualmente pelo
  usuário) — não vou declarar PASS sem essa confirmação explícita.

## 9. Novo cadastro

- testado: **SIM**, pelo usuário real, em produção, duas vezes:
  1. Primeira tentativa: **FALHOU** com `StorageApiError: new row violates row-level security policy`
     (bug de RLS documentado na seção 14) — nenhum Base64 foi gravado nessa falha, o upload
     simplesmente não completou.
  2. Segunda tentativa, após a correção de RLS: **SUCESSO** — `photo_storage_path` preenchido,
     `photo_url = NULL`. Confirmado por consulta direta ao banco (seção 4).
- resultado: **PASS** (na segunda tentativa, após correção).

## 10. Troca de foto

- testada: **SIM** (indiretamente) — o mesmo registro de teste teve a foto removida e depois
  recadastrada, o que no fluxo do código é tecnicamente uma "remoção" seguida de um "novo cadastro" no
  mesmo registro, não uma substituição direta com foto antiga ainda presente. Não foi testado o caso
  "trocar de A para B sem remover antes".
- extensões testadas: só `.jpg → .jpg` (a foto de teste usada foi JPEG nas duas tentativas). Os casos
  `.jpg → .png` e `.png → .jpg` **NÃO FORAM TESTADOS**.
- resultado: **PARCIALMENTE TESTADO** — o caminho "remover + recadastrar" funciona; o caminho "trocar
  direto" e a troca de extensão continuam sem teste real.

## 11. Leitura híbrida

- Registro com Storage (`photo_storage_path` preenchido): lógica de código inalterada desde a Fase 4/6,
  confirmada por leitura de código nesta fase (`App.jsx`, `AdminFaceScanner.jsx`,
  `AdminUserManagement.jsx`) — **não testada visualmente em produção nesta fase**.
- Registro legado sem Storage (só `photo_url` base64): mesma situação — lógica inalterada, não testada
  visualmente.
- Registro sem foto: mesma situação.
- resultado: **NÃO TESTADO EM UI** — só verificação estática de código (igual à Fase 6, sem mudanças).

## 12. Escritores Base64

Nova varredura de código nesta fase (não apenas reaproveitando a Fase 6): confirmei que **nenhum
arquivo de código-fonte mudou** desde o commit `dd0ebb0` (a única mudança no working tree é a migration
de RLS, que não toca em nenhum arquivo `.js`/`.jsx`). Portanto a classificação da Fase 6 continua
integralmente válida:

| Local | Classificação |
| --- | --- |
| `src/App.jsx` — `togglePhoto()` | ESCRITA LEGÍTIMA (Storage) |
| `src/App.jsx` — `handleSaveAuth()` | ESCRITA LEGÍTIMA (sem foto) |
| `src/components/AdminUserRegistration.jsx` | ESCRITA LEGÍTIMA (sem foto) |
| `src/components/AdminImportModal.jsx` | ESCRITA LEGÍTIMA (sem foto) |
| RPC `approve_matricula` | ESCRITA LEGÍTIMA (sem foto) |
| `src/components/FamilyAuthorized.jsx` (`readAsDataURL`) | LEITURA TEMPORÁRIA → repassada ao Storage |
| `src/components/AdminFaceEnrollment.jsx` (`canvas.toDataURL`) | LEITURA TEMPORÁRIA → repassada ao Storage |
| Demais (`TeacherMonitor.jsx`, `AdminSettings.jsx`, etc.) | LEITURA LEGÍTIMA |

**Nenhum escritor ativo de Base64 encontrado.** Confirmado adicionalmente pela prova empírica da seção
9 (upload real não gravou Base64).

## 13. Egress

- `App.jsx`, `AdminFaceScanner.jsx`, `AdminUserManagement.jsx`: continuam sem `select('*')` em
  `authorized_persons`, continuam resolvendo signed URLs em lote (`getAuthorizedPersonPhotoSignedUrls`)
  em vez de N+1 — inalterado desde a Fase 4/6, revalidado por leitura de código.
- **GANHO QUALITATIVO CONFIRMADO** (payload de `authorized_persons` não carrega mais Base64 pra
  registros migrados; novos cadastros nunca mais carregam Base64).
- **GANHO QUANTITATIVO NÃO MEDIDO** (não tenho acesso a métricas de egress real da Vercel/Supabase
  nesta ferramenta).

## 14. Segurança

- **RLS**: bug estrutural encontrado e corrigido nesta fase (detalhado abaixo) — não é uma alteração
  "porque sim", foi uma correção comprovadamente necessária, testada e confirmada.
- **Storage policies**: 3 policies do bucket `person-photos` (Admin, Família, Professor) — a de Admin
  não foi tocada; as de Família e Professor foram corrigidas (mesma lógica, só a referência de coluna
  ambígua `name` foi qualificada para `objects.name`). Nenhuma regra de escopo (escola, dono do
  registro) mudou.
- **Multi-tenant**: não testado com uma segunda escola nesta fase (só uma escola tem dados reais no
  ambiente) — **NÃO TESTADO**, mas a lógica da policy (comparação por `school_id` e por `family_id`)
  não foi alterada em termos de escopo, só a referência de coluna.
- **Signed URLs**: não encontrada nenhuma URL armazenada em banco, `localStorage` ou `sessionStorage`
  (nenhuma mudança de código nesta fase que pudesse introduzir isso).
- **Logs**: nenhum Base64 ou signed URL apareceu nos logs do navegador compartilhados pelo usuário —
  só mensagens de erro técnico (`StorageApiError`, `statement timeout`), sem dado sensível.
- **Secrets**: a service role key usada durante a Fase 5 não foi reutilizada nesta fase — não houve
  necessidade.

### Detalhe do bug de RLS corrigido nesta fase

**Achado**: as policies `"Familias gerenciam fotos dos proprios autorizados"` e `"Professores leem
fotos de autorizados de suas turmas"` (criadas na Fase 3) tinham uma ambiguidade de coluna: dentro do
`EXISTS (SELECT ... FROM authorized_persons ap WHERE ...)`, a referência não-qualificada `name` era
resolvida pelo Postgres para `authorized_persons.name` (nome da pessoa) em vez de
`storage.objects.name` (caminho do arquivo), porque `authorized_persons` também tem uma coluna
`name`. Isso fazia a condição nunca bater, bloqueando **todo** upload de família desde a criação da
policy na Fase 3 — só não foi detectado antes porque a migração de dados da Fase 5 usou a service role
key, que ignora RLS.

**Evidência**: erro real do usuário em produção — `StorageApiError: new row violates row-level
security policy`, replicável na leitura do SQL da policy (`pg_policies.with_check` mostrava
`split_part(name, ...)` sem qualificação).

**Correção aplicada**: `supabase/migrations/20260826_fix_person_photos_rls_name_ambiguity.sql`
(qualifica `storage.objects.name` explicitamente na comparação, sem alterar nenhuma outra condição de
escopo). Aplicada diretamente no banco de produção (não via `git push` — é uma migration SQL, não
código do app) após autorização explícita do usuário.

**Validação**: re-teste real do usuário após a correção — upload funcionou, `photo_storage_path`
preenchido, sem erro de RLS. Confirmado por consulta direta ao banco (seção 4/6/7).

## 15. Reconhecimento facial

Nenhum arquivo de reconhecimento facial foi tocado nesta fase (a única mudança de código desta fase é
uma migration SQL de RLS em `storage.objects`, sem relação com `MATCH_THRESHOLD`, `findSecureMatch`,
câmera, canvas, etc.). **Confirmado por ausência de alteração** — não houve teste funcional de
reconhecimento facial ao vivo nesta fase (**NÃO TESTADO** funcionalmente, só confirmado que o código
não mudou).

## 16. Totem → Monitor → Recepção

Mesma situação: nenhuma alteração de código nesta fase. `requestKioskAccess`, `updateStudentStatus`,
Realtime de `students` — inalterados. **NÃO TESTADO** funcionalmente nesta fase (sem alteração de
código, o risco de regressão é mínimo, mas não há teste ao vivo para comprovar).

## 17. Build

`npm run build` → **PASS**, sem erros (nenhuma alteração de código desde o último build validado).

- lint: **NOT AVAILABLE** (sem script no `package.json`)
- typecheck: **NOT AVAILABLE** (projeto JS puro)
- test: **NOT AVAILABLE** (sem script configurado)

## 18. Testes

| Teste | Resultado | Observação |
| --- | --- | --- |
| Build | PASS | Sem alteração de código nesta fase |
| Deploy | PASS | Confirmado por conteúdo real do bundle servido |
| Upload (novo cadastro) | PASS | Testado 2x pelo usuário real; falhou por RLS, corrigido, re-testado com sucesso |
| Signed URL | NÃO TESTADO | Nem por script isolado nem confirmação visual do usuário |
| Leitura Storage | NÃO TESTADO | Sem confirmação visual em produção |
| Leitura Legacy | NÃO TESTADO | Sem confirmação visual em produção |
| Troca de foto | PARCIAL | Só "remover+recadastrar" testado; troca direta com extensão diferente não testada |
| RLS | PASS (após correção) | Bug real encontrado, corrigido e validado |
| Reconhecimento facial | NÃO TESTADO | Sem alteração de código; sem teste funcional ao vivo |
| Totem/Monitor/Recepção | NÃO TESTADO | Sem alteração de código; sem teste funcional ao vivo |
| Isolamento multi-tenant | NÃO TESTADO | Só uma escola disponível no ambiente |

## 19. Problemas encontrados

**Crítico**: nenhum.

**Alto**:
- Bug de RLS em `storage.objects` (Fase 3) bloqueando 100% dos uploads de família — **RESOLVIDO
  nesta fase**, com autorização explícita e teste de validação real.

**Médio**:
- `Erro: canceling statement due to statement timeout` (57014) observado duas vezes em produção
  (uma no upload, uma na tela de Gerenciamento → Responsáveis que apareceu vazia). Não encontrei
  nenhuma query lenta ou lock ativo no banco nos momentos em que investiguei — o banco está saudável
  agora. **Causa raiz não determinada** (pode ser instabilidade pontual de infraestrutura, já
  observada antes nesta mesma sessão em outro contexto). Não foi possível reproduzir. Recomendo
  monitorar se voltar a acontecer.
- Tela "Gerenciamento → Responsáveis" apareceu vazia para o usuário após o timeout acima — a causa
  provável é o mesmo timeout (o código atual não distingue "erro ao buscar" de "lista realmente
  vazia" na UI, deixando a tela vazia sem mensagem de erro visível ao admin). **Confirmado pelo
  usuário: voltou ao normal após F5.** Isso reforça que foi um timeout pontual/transitório (não uma
  perda de dados nem um bug persistente) — os 58 responsáveis e 80 autorizados nunca deixaram de
  existir no banco, só a busca falhou uma vez. Fica como melhoria futura (fora do escopo desta fase):
  a UI poderia mostrar uma mensagem de erro explícita em vez de lista vazia quando a busca falha.

**Baixo**:
- Um arquivo do Storage ficou temporariamente órfão entre a Fase 5 e o teste desta fase (remoção de
  foto pelo app falhando silenciosamente no lado do Storage, sem bloquear a limpeza no banco) — se
  resolveu sozinho quando o path foi reutilizado, mas o comportamento "erro de remoção no Storage é
  só logado, nunca reportado à UI" continua existindo no código (decisão deliberada da Fase 4, não
  uma regressão).

**Informativo**:
- 3 registros legados permanecem só em Base64 (`723454a8`, `1401cbf8`, `19671f65`), todos anteriores
  ao deploy confirmado — candidatos para uma futura migração como a da Fase 5.

## 20. Alterações realizadas

| Arquivo | Alteração |
| --- | --- |
| `supabase/migrations/20260826_fix_person_photos_rls_name_ambiguity.sql` | Novo — corrige ambiguidade de coluna `name` nas policies de Família e Professor do bucket `person-photos`. Aplicado diretamente no banco de produção. |
| `FASE_6_AUDITORIA_BASE64.md` | Atualizado com o resultado final da Fase 6 (deploy confirmado, causa do Base64 determinada). |
| `FASE_7_VALIDACAO_POS_DEPLOY.md` | Novo — este relatório. |

Nenhum arquivo de código do frontend (`.js`/`.jsx`) foi alterado nesta fase.

## 21. Alterações NÃO realizadas

- Nenhuma migration de dados (nenhum `UPDATE`/`DELETE` em `authorized_persons` ou `storage.objects`).
- Nenhuma remoção de arquivo órfão (não havia mais nenhum ao final da fase).
- Nenhuma alteração em RLS além da correção pontual documentada.
- Nenhuma alteração em reconhecimento facial, Totem, Monitor, Recepção, thresholds, câmera, canvas.
- Nenhum commit, push ou deploy adicional.
- Nenhuma limpeza de `photo_url` legado.

## 22. Riscos restantes

- **MÉDIO**: causa do `statement timeout` (57014) não determinada — pode se repetir.
- **MÉDIO**: vários itens de teste funcional real (signed URL visual, leitura híbrida em tela,
  reconhecimento facial, Totem/Monitor/Recepção, isolamento multi-tenant) permanecem **NÃO TESTADOS** —
  a ausência de regressão é inferida por ausência de alteração de código, não por teste direto.
- **BAIXO**: troca de foto com extensão diferente (`.jpg→.png`) continua sem teste e sem limpeza do
  arquivo antigo (comportamento conhecido e documentado desde a Fase 4).

## 23. Estado do Base64

- quantidade atual: **23** (`photo_url LIKE 'data:image/%'`)
- migrável (com processo já validado na Fase 5): todos os 23, em tese — mas 20 deles já têm
  `photo_storage_path` preenchido (o Base64 é só resíduo legado preservado de propósito) e não
  precisam de nova migração.
- pendente de fato (sem `photo_storage_path`): **3** — `723454a8-2685-41a6-ab98-05f1bc1740b3`,
  `1401cbf8-a717-4ab1-bd52-f354ab4381e5`, `19671f65-cb6c-43a9-b85b-78aab5819e3c`
- motivo: todos criados/alterados em produção antes da conclusão do deploy `dd0ebb0`
  (19:52:32Z) — comportamento esperado e já documentado na Fase 6.

## 24. Estado do Storage

- arquivos válidos: **21/21**
- arquivos órfãos: **0**
- registros sem arquivo (`photo_storage_path` apontando pro nada): **0**

## 25. Git

- Commit: **NÃO**
- Push: **NÃO**
- Deploy adicional: **NÃO**

## 26. Veredito

### ⚠️ FASE 7 APROVADA COM RESSALVAS

Não existem riscos críticos nem evidência de perda de dados, corrupção ou regressão. O deploy está
comprovadamente ativo, a integridade Database↔Storage é 21/21 nos dois sentidos, um bug real e grave
de RLS foi encontrado e corrigido com validação real, e nenhum escritor de Base64 ativo foi
encontrado.

As ressalvas que impedem uma aprovação plena:
1. Vários testes funcionais (signed URL visual, leitura híbrida em tela, reconhecimento facial,
   Totem/Monitor/Recepção, isolamento multi-tenant) não foram executados de fato nesta fase — só
   inferidos por ausência de alteração de código.
2. A causa raiz do `statement timeout` (57014) não foi determinada, embora seus efeitos tenham sido
   confirmados como transitórios: o usuário confirmou que a tela "Gerenciamento → Responsáveis"
   voltou ao normal após F5, sem nenhuma perda de dados (58 responsáveis / 80 autorizados intactos
   durante todo o incidente).

## 27. Próximo passo

Conforme instruído, **não avanço para a Fase 8 nesta execução**. Ressalva 3 (tela de Responsáveis)
**fechada** — usuário confirmou que voltou ao normal após F5. Restam as ressalvas 1 e 2 (testes
funcionais visuais não executados; causa raiz do timeout não determinada) antes de considerar propor
a Fase 8 (remoção controlada do Base64 legado). Recomendo, quando possível, validar visualmente ao
menos um caso de leitura híbrida (foto aparecendo na tela) em produção.
