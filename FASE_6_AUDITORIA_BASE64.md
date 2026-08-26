# RELATÓRIO FINAL — FASE 6

Status: **EM ANDAMENTO — aguardando URL de produção para concluir a prova do deploy (Fase 6.1).**
Todas as demais etapas que não dependem disso (6.2 a 6.5, 6.11, 6.12) já foram executadas.

## 1. Deploy

- commit esperado: `dd0ebb0`
- commit encontrado (local `HEAD` e `origin/main`, via `git log`): `dd0ebb0` — **idênticos, working tree limpo**
- **Confirmação independente (não é só Git)**: GitHub Deployment Status API
  (`GET /repos/paulocaique98-create/Zela-app/commits/dd0ebb0/status`) retorna:
  ```
  state: success
  context: Vercel
  description: "Deployment has completed"
  updated_at: 2026-08-25T19:52:32Z
  ```
  Essa é a própria integração Vercel↔GitHub reportando back ao GitHub, uma fonte independente do
  meu `git log` local.
- versão em produção (bundle JS real servido): **NÃO CONFIRMADO AINDA** — tentei acessar
  `zela-app.vercel.app` e é um domínio de OUTRO produto (assistente de WhatsApp, mesma marca
  "Zela", app diferente). Não vou adivinhar a URL correta. **Aguardando o usuário informar a URL real
  de produção do ZelaApp** para buscar o bundle e confirmar por evidência de conteúdo (ex.: presença
  da string `photo_storage_path` no JS servido) que o código novo está realmente ativo.
- divergência: nenhuma conhecida até agora, mas o item acima permanece **NÃO PROVADO** — ver seção 16
  (Decisão).

### Evidência indireta forte de que o deploy está ativo (via banco, não via bundle)

Consultei `biometric_consent_at` (timestamp gravado em toda chamada de `togglePhoto`, tanto na versão
antiga quanto na nova) dos 3 registros que ainda têm Base64 sem `photo_storage_path`:

| ID | `biometric_consent_at` |
|---|---|
| `723454a8-...` | 2026-08-25 19:38:19 UTC |
| `1401cbf8-...` | 2026-08-25 19:39:56 UTC |
| `19671f65-...` | 2026-08-25 19:44:11 UTC |

**Todos os 3 timestamps são anteriores ao horário de conclusão do deploy (19:52:32 UTC)** — ou seja,
todos foram criados enquanto a versão antiga ainda estava no ar, não depois. Consulta adicional:
`SELECT count(*) WHERE biometric_consent_at > '2026-08-25 19:52:32+00'` → **0**. Isso significa que,
desde que o deploy terminou, **nenhuma foto foi cadastrada ou trocada em produção** — o que é
consistente com "nenhum novo Base64 apareceu", mas também significa que **ainda não há prova positiva
de que o fluxo novo funciona ao vivo**, só ausência de evidência contrária.

## 2. Estado do Banco Antes (referência: fim da Fase 5)

- total: 79
- Base64: 22
- Storage: 21
- ambos (Storage + Base64): 21
- sem foto: 57

## 3. Estado do Banco Agora (consulta desta fase)

- total: **80**
- Base64 (`photo_url LIKE 'data:image/%'`): **24**
- Storage (`photo_storage_path IS NOT NULL`): **21** (inalterado — nenhuma migração nesta fase)
- ambos: **21**
- só Storage: **0**
- só Base64: **3** (`723454a8`, `1401cbf8`, `19671f65` — todos com `biometric_consent_at` anterior
  ao deploy, ver seção 1)
- sem foto: **56**

**Explicação da divergência 79→80 / 22→24**: 1 novo registro (`total`) e 2 novas fotos Base64
(`1401cbf8`, `19671f65`) surgiram entre o fim da Fase 5 e a conclusão do deploy — mesma causa raiz já
documentada (produção ainda rodava código antigo nessa janela). Nenhuma dessas alterações ocorreu
depois do deploy confirmado.

## 4. Auditoria dos Escritores (código atual — igual ao que está em `HEAD`/produção)

| Local | Tipo | Grava Base64? | Destino | Situação |
|---|---|---|---|---|
| `src/App.jsx` — `togglePhoto()` | Escritor de foto | NÃO | `photo_storage_path` via `uploadAuthorizedPersonPhoto` | ✅ Correto |
| `src/App.jsx` — `handleSaveAuth()` (insert autorizado) | Escritor (sem foto) | N/A — nunca inclui `photo_url`/`photo_storage_path` | — | ✅ Correto |
| `src/App.jsx` — `deleteAuthorized()` | DELETE | N/A | — | ✅ Correto |
| `src/components/AdminUserRegistration.jsx` (insert/update titular) | Escritor (sem foto) | N/A | — | ✅ Correto |
| `src/components/AdminImportModal.jsx` (import em massa) | Escritor (sem foto) | N/A | — | ✅ Correto |
| `supabase/migrations/20260904_approve_matricula_rpc.sql` — RPC `approve_matricula` | Escritor (sem foto) | N/A — `has_photo=false`, coluna `photo_url` nunca citada | — | ✅ Correto |
| `supabase/functions/face-auth/index.ts` | Leitor | N/A (só `SELECT`) | — | ✅ Correto |
| `src/components/FamilyAuthorized.jsx` (`readAsDataURL`) | Data URL temporária | NÃO — repassa pra `togglePhoto()` | Storage (indireto) | ✅ Correto |
| `src/components/AdminFaceEnrollment.jsx` (`canvas.toDataURL`) | Data URL temporária | NÃO — repassa pra `togglePhoto()` | Storage (indireto) | ✅ Correto |

Nenhuma mudança desde a auditoria de código da mensagem anterior (nenhum arquivo relevante foi
alterado — só commitado o que já existia). Reconfirmado por re-leitura desta fase.

## 5. Backend

- **RPCs**: só `approve_matricula` insere em `authorized_persons`; confirmado sem `photo_url`/Base64.
- **Triggers**: nenhuma trigger em `authorized_persons` encontrada nas migrations (busca por
  `CREATE TRIGGER.*authorized_persons` sem resultado).
- **Edge Functions**: `face-auth` (só leitura), `create-family-user` (não cria `authorized_persons`,
  confirmado por comentário explícito no código). Nenhuma outra Edge Function referencia
  `authorized_persons`.
- **Imports**: `AdminImportModal.jsx`, confirmado sem foto.
- **APIs externas**: nenhuma encontrada.
- **Escritores Base64 encontrados no código atual**: **0**.

## 6. Fluxo Novo

```
imagem → Storage → photo_storage_path
```

Resultado da auditoria estática: **PASS** (nenhum caminho de código contraria esse fluxo).
Resultado de teste ao vivo em produção: **NÃO TESTADO** (ver seção 7 — sem atividade real desde o
deploy, e nenhum teste funcional foi executado nesta fase ainda).

## 7. Teste de Novo Cadastro

- realizado: **NÃO** — não executei um cadastro real via UI (não tenho acesso a navegador/sessão de
  usuário real nesta ferramenta) nem via script simulando um usuário real seguindo a regra de preferir
  testar pela aplicação de verdade. Fazer isso via script com service role, como na Fase 5, testaria o
  *Storage e o banco*, mas não provaria que o *bundle JS servido aos usuários* está correto — por isso
  preferi não fazer isso sem antes confirmar o bundle real (seção 1) e sem uma decisão sua sobre como
  prefere validar (ver Decisão, seção 16).
- resultado: **NÃO TESTADO**

## 8. Teste de Troca de Foto

- realizado: **NÃO**, mesmo motivo da seção 7.
- resultado: **NÃO TESTADO**

## 9. Registros Legados Pendentes (Base64 sem Storage)

- quantidade identificada: **3**
- IDs: `723454a8-2685-41a6-ab98-05f1bc1740b3`, `1401cbf8-a717-4ab1-bd52-f354ab4381e5`,
  `19671f65-cb6c-43a9-b85b-78aab5819e3c` (todos da mesma escola, `5135570d-...`)
- status: **LEGADO PENDENTE** — todos criados/alterados antes do deploy confirmado (seção 1), nenhum
  foi tocado, `photo_url` intacto, `photo_storage_path` continua `NULL`. Candidatos naturais para uma
  futura rodada de migração igual à da Fase 5, quando autorizado.

## 10. Reconhecimento Facial

- thresholds (`MATCH_THRESHOLD`, `MATCH_MARGIN`, `CONSISTENCY_FRAMES`, `DETECTION_INTERVAL_MS`,
  `STUCK_TIMEOUT_MS`): não alterados (nenhum arquivo de reconhecimento facial foi tocado nesta fase —
  zero alterações de código desde o último commit).
- matching (`findSecureMatch`, `evaluateFramePosition`, `enhanceForLowLight`): não alterados.
- câmera/canvas/iluminação: não alterados.
- resultado: **PASS** (por ausência de alteração — não houve nenhuma mudança de código nesta fase).

## 11. Totem → Monitor → Recepção

- `requestKioskAccess`, `updateStudentStatus`, Realtime de `students`: não alterados.
- resultado: **PASS** (por ausência de alteração).

## 12. Segurança

- bucket privado: **confirmado** (`public: false`, consulta direta ao banco nesta fase).
- RLS/policies do bucket `person-photos`: não tocadas nesta fase (nenhuma migration nova).
- signed URLs: implementação inalterada desde a Fase 4/5.
- secrets: `grep` por `SERVICE_ROLE`/`service_role` em `src/` → **0 ocorrências**. Nas Edge Functions,
  todas as 9 ocorrências são `Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')` (padrão correto, variável de
  ambiente do servidor, nunca valor literal). `git ls-files` confirma que só `.env.example` está
  versionado (sem chave real).
- logs: nenhuma alteração de código nesta fase, então nenhum novo risco introduzido.

## 13. Build

- `npm run build`: **NÃO EXECUTADO NESTA FASE** — nenhuma alteração de código foi feita (a fase foi
  só auditoria + consulta ao banco), então não há nada novo para buildar. O último build validado
  (Fase 4/5, mesmo código que está commitado agora) passou.
- lint: **NÃO DISPONÍVEL** (sem script `lint` no `package.json` — não vou inventar um).
- typecheck: **NÃO DISPONÍVEL** (projeto é JS puro, sem TypeScript no frontend).
- test: **NÃO DISPONÍVEL** (sem script `test` configurado para o frontend).

## 14. Git

- commit: **NÃO** (nenhum commit novo nesta fase — só leitura/auditoria)
- push: **NÃO**
- deploy: **NÃO** (o deploy já confirmado é o da fase anterior, autorizado e executado antes desta
  Fase 6 atual)
- arquivos modificados: **nenhum** — `git status --short` limpo no início e ao longo desta fase.

## 15. Riscos Restantes

| Risco | Classificação |
|---|---|
| Bundle JS de produção ainda não verificado por conteúdo (só por status de deploy) | **MÉDIO** — evidência indireta forte existe (status success + ausência de atividade Base64 pós-deploy), mas falta a prova direta |
| Nenhum teste funcional real (cadastro/troca de foto ao vivo) executado | **MÉDIO** — sem essa prova, "Fase 6 aprovada" seria uma alegação, não uma comprovação |
| 3 registros legados pendentes de migração | **BAIXO** — comportamento esperado e documentado, não é uma falha, `photo_url` intacto |
| Nenhum escritor de Base64 ativo encontrado no código | **BAIXO** (favorável) — auditoria completa, sem evidência contrária |

## 16. Decisão

### ⚠️ FASE 6 BLOQUEADA

Motivo: a auditoria estática (código, banco, backend, segurança) está completa e **não encontrou
nenhum escritor de Base64 ativo** — isso é uma evidência forte. Porém, por regra desta própria fase
("não confundir 'não encontrei' com 'provei que não existe'"), a conclusão só pode virar **APROVADA**
depois de:

1. confirmar o conteúdo real do bundle JS de produção (preciso da URL correta — a que tentei,
   `zela-app.vercel.app`, é de outro produto);
2. um teste funcional real de cadastro/troca de foto (ao vivo ou por um método que você aprove).

Nenhum dos dois é um problema técnico — é falta de dado (URL) e falta de uma decisão sua sobre como
prefere validar o teste funcional (ver pergunta que vou fazer a seguir).

## 17. Próximo Passo

Não é a Fase 7 ainda. Antes disso, dois itens pendentes:

1. **URL de produção real** — para eu confirmar o bundle e fechar a Fase 6.1 com prova direta.
2. **Teste funcional** — decidir se você quer testar ao vivo você mesmo (cadastrando uma foto de
   teste) enquanto eu observo o banco antes/depois, ou se prefere que eu simule via script (o que
   prova Storage+banco, mas não prova o bundle do navegador).

Só depois de fechar esses dois pontos a Fase 6 pode ser declarada **APROVADA**, e só então faz sentido
propor a **FASE 7 — Remoção controlada do Base64 legado** como fase separada.
