# FASE 6 — Auditoria e Eliminação de Escritores Base64

Status: **FASE 6.1, 6.2 e 6.3 concluídas. PARADO — relatório preliminar abaixo, aguardando autorização para FASE 6.5 (correção).**

## 1. FASE 6.1 — Diagnóstico

Estado confirmado (herdado da Fase 5, não re-consultado nesta auditoria por ser puramente de código —
nenhuma consulta ao banco foi feita nesta fase, nenhum dado foi tocado).

## 2. FASE 6.2 — Auditoria completa de escritores

Busca por todas as referências a `photo_url`, `photo_storage_path`, `togglePhoto`,
`uploadAuthorizedPersonPhoto`, `data:image/`, `readAsDataURL`, `toDataURL`, `authorized_persons`,
`.insert(`, `.update(` em `src/`, `supabase/functions/` e `supabase/migrations/`.

### Todos os pontos que gravam em `authorized_persons` (INSERT/UPDATE), com classificação

| Arquivo | Local | Escreve `photo_url`? | Tipo | Ação |
|---|---|---|---|---|
| `src/App.jsx` — `togglePhoto` (código atual, não commitado) | linha ~607-679 | **NÃO** — usa `uploadAuthorizedPersonPhoto` → `photo_storage_path` | VALID_STORAGE_FLOW | Nenhuma (já correto) |
| `src/App.jsx` — `togglePhoto` (última versão commitada / HEAD, provavelmente em produção) | `git show HEAD:src/App.jsx:594` | **SIM** — `updates.photo_url = photoUrl` (Base64 direto) | DIRECT_BASE64_WRITE | **Não corrigível por código** — resolve com deploy do código já corrigido (fora do escopo desta fase, ver seção 5) |
| `src/App.jsx` — `handleSaveAuth` (insert titular/autorizado) | linha ~727-738 | NÃO — `dbPerson` não inclui `photo_url` nem `photo_storage_path`, foto é setada depois via `togglePhoto` | VALID_STORAGE_FLOW (indireto) | Nenhuma |
| `src/App.jsx` — `deleteAuthorized` | linha 686 | N/A (só `DELETE`) | READ_ONLY (não é escritor de foto) | Nenhuma |
| `src/components/AdminUserRegistration.jsx` — criação (`insert` titular) | linha 678-686 | NÃO — só `name`, `relation`, `has_photo: false` | VALID_STORAGE_FLOW (indireto) | Nenhuma |
| `src/components/AdminUserRegistration.jsx` — edição (`update` titular) | linha 565-570 | NÃO — só `name`, `relation` | READ_ONLY (para foto) | Nenhuma |
| `src/components/AdminImportModal.jsx` — import em massa | linha 301-310 | NÃO — só `name`, `relation`, `has_photo: false` | VALID_STORAGE_FLOW (indireto) | Nenhuma |
| `supabase/migrations/20260904_approve_matricula_rpc.sql` — RPC `approve_matricula` (2 INSERTs: autorizados + transporte) | linha 109, 118 | NÃO — coluna `photo_url` nem é citada, sempre `has_photo = false` | VALID_STORAGE_FLOW (indireto) | Nenhuma |
| `supabase/functions/face-auth/index.ts` | linha 70 | N/A — só `SELECT` | READ_ONLY | Nenhuma |
| `supabase/functions/create-family-user/index.ts` | linha 167 | N/A — comentário apenas, não cria `authorized_persons` (deliberadamente removido em fase anterior desta sessão) | DEAD_REFERENCE (comentário) | Nenhuma |

### Leitores confirmados (não escrevem, só exibem `person.photo_url` já resolvido)

`src/components/FamilyAuthorized.jsx`, `src/components/AdminFaceEnrollment.jsx`,
`src/components/TeacherMonitor.jsx`, `src/components/AdminSettings.jsx` (avatar de usuário/família) —
todos classificados **READ_ONLY**. Nenhum contém lógica própria de upload ou gravação.

### Fluxos com Data URL temporária (permitido — não persistem Base64 no banco)

| Arquivo | Origem do Data URL | Destino |
|---|---|---|
| `src/components/FamilyAuthorized.jsx:62-73` | `FileReader.readAsDataURL` (upload de arquivo) | passado como argumento pra `togglePhoto()` — nunca gravado direto |
| `src/components/AdminFaceEnrollment.jsx:396-458` | `canvas.toDataURL('image/jpeg')` (captura via câmera) | passado como argumento pra `togglePhoto()` — nunca gravado direto |

Ambos classificados **TEMPORARY_BASE64** — permitido pela regra do item 8 do prompt master (Data URL em
memória não é o problema; o problema é persistência em `photo_url`). Ambos **já delegam integralmente**
pro `togglePhoto()` atual (versão do working tree), que já é Storage-first.

## 3. FASE 6.3 — Causa do registro Base64 identificado na Fase 5

**CAUSA DETERMINADA** (não é especulação — evidência direta via `git diff HEAD`):

O registro `723454a8-2685-41a6-ab98-05f1bc1740b3` foi criado durante a execução da Fase 5 por uma
família usando o **aplicativo em produção**. A produção roda o **último código commitado** (`git
HEAD`), não o código atual do working tree.

Comparando as duas versões de `togglePhoto` em `src/App.jsx`:

```
git show HEAD:src/App.jsx   (linha 594) → updates.photo_url = photoUrl;   ← BASE64 DIRETO
working tree (não commitado) (linha 616) → updates.photo_storage_path = path;  ← STORAGE
```

A versão commitada/deployada (a que está rodando ao vivo pros usuários agora) é a versão **anterior**
à Fase 4 — ainda grava a foto capturada diretamente como Base64 em `photo_url`, porque as correções da
Fase 4 (leitura/escrita híbrida via Storage) só existem localmente, nunca foram commitadas nem
deployadas (por regra explícita do usuário: nenhuma fase até agora autorizou commit/push).

**Conclusão**: não existe nenhum escritor de Base64 remanescente no *código atual* (working tree) que
precise ser corrigido — o único "escritor" de Base64 é a versão antiga já rodando em produção, que só
deixa de escrever Base64 quando o código já corrigido (que já existe localmente desde a Fase 4) for
efetivamente commitado e deployado.

Nenhum outro escritor paralelo, duplicado, órfão, trigger, RPC ou Edge Function grava `photo_url` com
conteúdo de imagem. Todos os pontos de escrita de `authorized_persons` no banco (RPC de matrícula,
import em massa, cadastro admin) nunca escreveram foto — só nome/relação, com `has_photo: false`, e a
foto real sempre foi (e continua sendo) responsabilidade exclusiva de `togglePhoto()`.

## 4. Regra de parada (item 17) — não aplicável

Não foi encontrado nenhum escritor cujo comportamento não pôde ser determinado com segurança. Todos os
9 pontos de escrita foram classificados com evidência direta de código.

## 5. Recomendação (aguardando autorização — nada foi alterado ainda)

Como o único escritor de Base64 é a versão **já substituída** no working tree local, tecnicamente **não
há código a corrigir nesta fase** — a correção já foi feita na Fase 4. O que falta é:

1. **Fazer o código atual chegar em produção** (commit + push + deploy) — isso por si só elimina 100%
   dos novos escritores de Base64, incluindo o que gerou o registro `723454a8-...`. Isso está
   **fora do escopo desta fase** (regra "NÃO fazer commit, push ou deploy") e requer autorização
   explícita separada.
2. Até o deploy acontecer, **qualquer novo cadastro/edição de foto feito pelos usuários reais em
   produção continuará gravando Base64**, exatamente como ocorreu durante a Fase 5 — isso não é uma
   falha da Fase 4/5/6, é uma consequência esperada e documentada de código corrigido, mas ainda não
   implantado.

**Não há alteração de código pendente para a FASE 6.5** neste momento, porque a auditoria não
encontrou nenhum escritor de Base64 no código-fonte atual que ainda precise ser corrigido. A Fase 6
está, na prática, **validando que a Fase 4 já resolveu o problema no código — falta apenas o deploy**.

Aguardando decisão do usuário sobre como proceder (ex.: autorizar o deploy, ou apenas registrar a
Fase 6 como concluída sem alteração de código, já que nenhum escritor ativo foi encontrado no código
atual).
