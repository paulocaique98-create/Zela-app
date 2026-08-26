# FASE 13 — ELIMINAÇÃO DA DEPENDÊNCIA DE photo_url

## 1. Status Executivo

# 🟢 CONCLUÍDA

## 2. Estado Antes

- Git: working tree com os relatórios de fases anteriores + a migration corretiva de RLS (Fase 6),
  todos pré-existentes a esta fase, preservados.
- `git diff --stat` (código): vazio antes de começar.
- Banco: 82 registros, 27 com `photo_storage_path`, 3 com `photo_url` (coexistindo com Storage).
- Ocorrências de `photo_url` em `src/`: 37, distribuídas em `App.jsx`, `AdminFaceScanner.jsx`,
  `AdminPortal.jsx`, `AdminFaceEnrollment.jsx`, `AdminPasswordLogin.jsx`, `AdminUserManagement.jsx`,
  `FamilyAuthorized.jsx`, `TeacherMonitor.jsx`.
- 4 pontos reais de query real contra a coluna do banco: `App.jsx:398`, `AdminFaceScanner.jsx:335`,
  `AdminUserManagement.jsx:40`, mais o `updates.photo_url = null` em `togglePhoto()`.
- 2 ocorrências suspeitas de código morto em `AdminPasswordLogin.jsx` (a confirmar nesta fase).

## 3. Auditoria Inicial

Antes de qualquer edição, li cada arquivo por completo (não confiei nas linhas do relatório da Fase
12 — só usei como ponto de partida) e rastreei a origem de cada dado:

- `App.jsx:398` — `.select(...photo_url...)` alimenta `formattedAuth`, que já fazia leitura híbrida
  (linhas 497-499 antes da edição).
- `AdminFaceScanner.jsx:335` — `fetchMatchedPersonPhoto()`, chamada só após um match de reconhecimento
  facial, nunca durante o matching em si (confirmado lendo as ~330 linhas anteriores: o matching usa
  exclusivamente `face_descriptor`, buscado num `.select()` separado, linha 244, que já não incluía
  `photo_url`).
- `AdminUserManagement.jsx:40` — mesma lógica híbrida de `App.jsx`, em lote.
- `AdminPasswordLogin.jsx` — rastreei `matchedUsers` (linha 254, populado na linha 132 a partir de
  `matched`, filtrado de `usersData` da query da linha 103-107: `select('id, name, role, doc_number,
  school_id')` na tabela `users`) e `familyPerson` (linha 289, setado na linha 176 a partir do mesmo
  objeto `user`). **Nenhum dos dois jamais carrega `photo_url`** — confirmado que é código morto real,
  não uma suposição.

## 4. Alterações Realizadas

### `src/App.jsx`

**Trecho 1 — SELECT (linha 398)**
- Antes: `.select('id, name, relation, has_photo, photo_url, photo_storage_path, face_descriptor, status, emergency_order, temporary_until, family_id')`
- Depois: `.select('id, name, relation, has_photo, photo_storage_path, face_descriptor, status, emergency_order, temporary_until, family_id')`
- Motivo: coluna não é mais necessária — leitura passa a ser exclusivamente via Storage.
- Risco: nenhum — nenhum consumidor downstream lia `a.photo_url` fora do próprio mapeamento que também
  foi ajustado.

**Trecho 2 — `formattedAuth` (linhas ~482-500)**
- Antes: fallback de 2 níveis (`signedUrl || a.photo_url` e, sem `photo_storage_path`, `a.photo_url`).
- Depois: `photo_url: a.photo_storage_path ? (signedUrlByPath.get(a.photo_storage_path) || null) : null`
  — sem fallback pro Base64 legado.
- Motivo: eliminar dependência funcional da coluna; sem `photo_storage_path` = placeholder (já tratado
  pelos componentes consumidores via `hasPhoto`/inicial do nome).
- Risco: baixo — só afeta os 3 registros que hoje têm Base64 residual; eles TÊM `photo_storage_path`
  (migrados na Fase 11), então continuam mostrando foto normalmente via Storage.

**Trecho 3 — `togglePhoto()`, ramo de remoção (linhas ~621-637)**
- Antes: `updates.photo_storage_path = null; updates.photo_url = null;`
- Depois: `updates.photo_storage_path = null;` (só isso).
- Motivo: parar de escrever na coluna legada.
- Risco: nenhum — o `UPDATE` simplesmente deixa de incluir esse campo; a coluna no banco não é tocada
  (nem para NULL nem para qualquer valor), permanecendo com o que já tinha.

**Trecho 4 — `resolvedPhotoUrl` (linhas ~665-667)**
- Antes: `: (updates.photo_url !== undefined ? updates.photo_url : undefined)`
- Depois: `: null`
- Motivo: `updates.photo_url` não existe mais no objeto `updates`; simplificação direta, mesmo
  resultado prático (era `null` de qualquer forma no ramo de remoção).
- Risco: nenhum.

### `src/components/AdminFaceScanner.jsx`

**Trecho — `fetchMatchedPersonPhoto()` (linhas ~331-354)**
- Antes: `.select('photo_url, photo_storage_path')` + fallback `resolvedUrl = data?.photo_url || null`.
- Depois: `.select('photo_storage_path')`, sem fallback.
- Motivo: preview do confronto visual do Totem passa a depender só do Storage.
- Risco: nenhum sobre o **matching** (função separada, não tocada); risco sobre a **exibição** é baixo,
  já que todos os registros com biometria cadastrada hoje têm `photo_storage_path` (confirmado na
  Fase 12: 27/27 com foto têm Storage).
- **Nenhuma linha de `findSecureMatch`, `evaluateFramePosition`, `enhanceForLowLight`,
  `MATCH_THRESHOLD`, `MATCH_MARGIN`, `CONSISTENCY_FRAMES`, `DETECTION_INTERVAL_MS`,
  `STUCK_TIMEOUT_MS` foi tocada** — confirmado por grep no diff (seção 9 abaixo).

### `src/components/AdminUserManagement.jsx`

**Trecho — query + `resolvePhotoUrl` (linhas ~38-53)**
- Antes: `.select('id, name, relation, photo_url, photo_storage_path, family_id')` + fallback de 2
  níveis.
- Depois: `.select('id, name, relation, photo_storage_path, family_id')` + `resolvePhotoUrl` sem
  fallback.
- Motivo/Risco: idênticos aos de `App.jsx`.

### `src/components/AdminPasswordLogin.jsx`

**Trecho 1 — lista de seleção multi-match (linhas ~261-269)**
- Antes: ternário `u.photo_url ? <img .../> : <avatar com inicial>`.
- Depois: só o `<avatar com inicial>` (o ramo `<img>` nunca executava — `u.photo_url` sempre
  `undefined`, confirmado na auditoria da seção 3).
- Motivo: código morto comprovado, remoção segura.
- Risco: nenhum — output visual idêntico ao comportamento real anterior (o avatar com inicial já era o
  que sempre renderizava).

**Trecho 2 — tela de confirmação (linhas ~289-301)**
- Antes/Depois/Motivo/Risco: idênticos ao Trecho 1, para `familyPerson?.photo_url`.

**Nada mais foi tocado neste arquivo** — `requestKioskAccess`, `updateStudentStatus`, lógica de PIN,
rate-limit, fluxo de confirmação de saída: todos intactos (confirmados presentes no arquivo após a
edição, seção 10).

### Arquivos auditados e **NÃO alterados** (consumidores indiretos, sem query própria)

`AdminFaceEnrollment.jsx`, `FamilyAuthorized.jsx`, `AdminPortal.jsx`, `TeacherMonitor.jsx`,
`src/lib/storage.js`: todos leem `person.photo_url`/`requester.photo_url` já resolvido pelos
componentes acima — nenhum faz `SELECT`/`UPDATE` próprio na coluna. Alterar esses arquivos seria
refatoração desnecessária fora do escopo (a instrução explícita da fase é não alterar consumidores
indiretos sem necessidade).

## 5. photo_url — Ocorrências Restantes no Código

| Uso | Arquivo | Tipo | Estado |
|---|---|---|---|
| `photo_url: a.photo_storage_path ? ... : null` | `App.jsx:496` | Campo local (URL resolvida) | A — necessário (nome do campo em memória, não a coluna) |
| Comentário explicativo | `App.jsx:608` | COMMENT | C |
| `photo_url: resolvedPhotoUrl` | `App.jsx:669` | Campo local | A |
| `p.photo_url` (filtro enrolled/pending) | `AdminFaceEnrollment.jsx:73,80` | READ (indireto) | A — lê campo já resolvido |
| `person.photo_url` (JSX) | `AdminFaceEnrollment.jsx:244-245` | READ (JSX) | A |
| Comentários explicativos | `AdminFaceScanner.jsx:236-237` | COMMENT | C |
| `photo_url: resolvedUrl` | `AdminFaceScanner.jsx:348` | Campo local | A |
| `matchedPerson.photo_url` (JSX, 2x) | `AdminFaceScanner.jsx:938-939,958-959` | READ (JSX) | A |
| `requester?.photo_url` (JSX) | `AdminPortal.jsx:332,334` | READ (JSX, indireto) | A |
| `photo_url: matchingAuth ? ... : null` | `AdminUserManagement.jsx:62` | Campo local | A |
| `user.photo_url` (JSX) | `AdminUserManagement.jsx:209-210` | READ (JSX) | A |
| `person.photo_url` (JSX, 2x) | `FamilyAuthorized.jsx:137-138,185` | READ (JSX, indireto) | A |
| `requester?.photo_url` (JSX) | `TeacherMonitor.jsx:77,79` | READ (JSX, indireto) | A |

**Nenhuma ocorrência restante é tipo E (dependência que precisa ser removida)** ou tipo B (query real
contra a coluna do banco). Todas são o campo local `photo_url` (convenção de nome mantida — é a URL de
exibição já resolvida, não a coluna `authorized_persons.photo_url`) ou comentários explicativos.

## 6. Base64

- Escritores encontrados: **0** (confirmado antes e depois desta fase).
- Leitores encontrados: **0** query real contra a coluna (seção 5).
- Fallbacks Base64: **0** — todos removidos nesta fase (`App.jsx`, `AdminFaceScanner.jsx`,
  `AdminUserManagement.jsx`).
- `data:image/`, `FileReader`, `readAsDataURL`: presentes só em `FamilyAuthorized.jsx` e
  `AdminFaceEnrollment.jsx`, exclusivamente como Data URL temporária de captura (câmera/upload),
  sempre repassada pra `togglePhoto()` → Storage — nunca persistida como Base64. **Não alterado nesta
  fase** (já estava correto desde a Fase 4, confirmado novamente aqui).

## 7. Storage

- Bucket: `person-photos`, privado — não tocado nesta fase.
- Path: `{school_id}/{authorized_person_id}.{ext}` — não alterado.
- Signed URL: `getAuthorizedPersonPhotoSignedUrl`/`getAuthorizedPersonPhotoSignedUrls` — não alterados
  (`storage.js` intocado).
- Batch: `App.jsx` e `AdminUserManagement.jsx` continuam resolvendo em lote
  (`getAuthorizedPersonPhotoSignedUrls`) — nenhum N+1 introduzido, confirmado pela ausência de mudança
  nessa parte da lógica (só o fallback foi removido, a chamada em lote continua igual).
- Nenhuma URL pública — signed URLs continuam temporárias, geradas sob demanda.

## 8. Segurança

- RLS: não tocada nesta fase (só código frontend foi alterado).
- Policies de Storage: não tocadas.
- Bucket: continua privado.
- `SERVICE_ROLE_KEY` no frontend: não existe, nunca existiu — confirmado por `grep -rn "SERVICE_ROLE"
  src/` sem resultado.
- Signed URLs: continuam temporárias (TTL padrão de `storage.js`, inalterado), nunca persistidas em
  banco/`localStorage`/`sessionStorage`.

## 9. Reconhecimento Facial

```
MATCH_THRESHOLD        — INTACTO
MATCH_MARGIN            — INTACTO
CONSISTENCY_FRAMES      — INTACTO
DETECTION_INTERVAL_MS   — INTACTO
STUCK_TIMEOUT_MS        — INTACTO
findSecureMatch         — INTACTO
evaluateFramePosition   — INTACTO
enhanceForLowLight      — INTACTO
```

Confirmado por `git diff -- src/ | grep -E "^[+-]"` filtrado por esses termos → **0 ocorrências** em
linhas efetivamente alteradas.

## 10. Totem → Monitor → Recepção

```
requestKioskAccess   — INTACTO
updateStudentStatus  — INTACTO
students realtime    — INTACTO
```

Mesma confirmação por grep no diff → 0 ocorrências. `AdminPasswordLogin.jsx` (parte do fluxo de
Totem/senha) teve só o JSX de avatar morto removido — `requestKioskAccess`/`updateStudentStatus`
continuam presentes no arquivo (4 ocorrências totais, verificado após a edição) e não aparecem em
nenhuma linha do diff.

## 11. Banco

- `ALTER TABLE`: NÃO
- `UPDATE`: NÃO
- `DELETE`: NÃO
- migration: NÃO
- `photo_url` alterado: NÃO (confirmado por consulta pós-fase: 82/3/27, idêntico ao início)
- `photo_storage_path` alterado: NÃO

## 12. Git

- commit: NÃO
- push: NÃO
- deploy: NÃO
- Arquivos alterados por esta fase: `src/App.jsx`, `src/components/AdminFaceScanner.jsx`,
  `src/components/AdminPasswordLogin.jsx`, `src/components/AdminUserManagement.jsx`.
- Arquivos pré-existentes preservados integralmente: `FASE_6_AUDITORIA_BASE64.md` (modificado antes
  desta fase) e os relatórios `FASE_7_VALIDACAO_POS_DEPLOY.md` até `FASE_12_...md` (não rastreados,
  criados em fases anteriores) + a migration `20260826_fix_person_photos_rls_name_ambiguity.sql` — nada
  disso foi tocado, resetado ou descartado.

## 13. Build

`npm run build` → **PASS**, sem erros.

## 14. Lint

`npm run lint` → **PASS** (exit code 0). Warnings presentes são todos pré-existentes e não relacionados
a `photo_url`/Storage (variáveis não usadas em `App.jsx`, `AdminFaceScanner.jsx`,
`AdminPasswordLogin.jsx`, `AdminUserManagement.jsx` — nenhuma delas nas linhas que editei).

## 15. Testes

| Teste | Resultado | Observação |
|---|---|---|
| Build | PASS — testado realmente | `npm run build` executado |
| Lint | PASS — testado realmente | `npm run lint`, exit 0 |
| Grep de regressão biométrica no diff | PASS — testado realmente | 0 ocorrências em linhas alteradas |
| Grep de regressão Totem no diff | PASS — testado realmente | 0 ocorrências em linhas alteradas |
| Nenhuma query real resta contra `photo_url` | PASS — testado realmente | grep dirigido, 0 resultados |
| Banco inalterado | PASS — testado realmente | consulta antes/depois idêntica (82/3/27) |
| Teste funcional real (cadastro/troca de foto/reconhecimento com o código novo) | NÃO TESTADO EM RUNTIME | Nenhum deploy foi feito nesta fase — o código alterado só existe localmente |

## 16. Ocorrências Restantes

Todas já detalhadas na seção 5 — resumo: 24 ocorrências de `photo_url` em `src/` após a fase, **100%
classificadas como campo local de exibição (tipo A) ou comentário (tipo C)**, zero como escritor,
zero como leitor real da coluna do banco. `data:image/`/`readAsDataURL`/`FileReader`: só como Data URL
temporária de captura, nunca persistida (seção 6).

## 17. Riscos

- **BAIXO**: nenhum teste funcional em runtime foi feito com o código alterado (nenhum deploy nesta
  fase) — o comportamento esperado é idêntico ao anterior para os 27 registros que têm
  `photo_storage_path` (100% dos que têm foto), mas isso não foi confirmado visualmente em produção.
- **BAIXO**: se, por algum motivo futuro, um registro tiver foto (`hasPhoto=true`) sem
  `photo_storage_path` (hoje: 0 casos), ele passaria a mostrar placeholder em vez do Base64 legado —
  comportamento intencional desta fase, mas vale registrar como mudança de comportamento caso
  reapareça esse cenário.
- Nenhum risco médio/alto/crítico identificado.

## 18. Próxima Fase

**Não executar nada disso agora — apenas recomendação.**

1. Commitar e revisar este diff (4 arquivos) separadamente do resto do trabalho acumulado da sessão,
   se o usuário preferir isolar essa mudança.
2. Fazer deploy e validar visualmente em produção: tela de Responsáveis, confronto visual do Totem,
   Autoatendimento por senha — confirmando que as fotos continuam aparecendo normalmente (esperado,
   já que 100% dos registros com foto têm Storage).
3. **Só depois** desse deploy e validação real, considerar uma fase futura dedicada exclusivamente à
   remoção estrutural de `authorized_persons.photo_url` (`DROP COLUMN`), com backup final e todas as
   validações descritas no prompt da própria Fase 13 (seção 27) — não antecipada nem iniciada aqui.
