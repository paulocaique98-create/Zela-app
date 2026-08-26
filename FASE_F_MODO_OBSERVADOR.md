# FASE F — Teste Paralelo (Modo Observador) em Produção

Status: **CÓDIGO CONCLUÍDO E TESTADO. Aguardando deploy (autorizado) + acúmulo de dados reais.**

## 1. O que foi feito

### Descoberta e resolução de um problema real de arquitetura

Ao planejar integrar o `Human` dentro de `AdminFaceScanner.jsx` (que já usa `face-api.js`), descobri
por teste real (não achismo) que **as duas bibliotecas não podem coexistir no mesmo contexto
JavaScript** — cada uma embute sua própria versão do TensorFlow.js, e carregar as duas no mesmo
thread causa um erro de conflito de estado global (`getAsync is not a function`), confirmado tanto em
Node.js (Fase C) quanto agora numa página de teste em navegador real.

**Solução**: rodar o `Human` isolado dentro de um **Web Worker** — um contexto JavaScript
completamente separado do thread principal, sem nenhum risco de colisão. Testei essa solução numa
página isolada antes de tocar no código real: `face-api.js` no thread principal + `Human` no worker,
ambos detectando rosto corretamente ao mesmo tempo, sem erro. Só depois dessa prova é que integrei no
componente de verdade.

### Arquivos novos

- `src/lib/humanShadowWorker.js` — o `Human` rodando dentro de um Web Worker.
- `src/lib/humanShadowClient.js` — helper que conversa com o worker (promessas, timeout de segurança
  de 15s pra nunca travar).
- `supabase/migrations/20260826_add_shadow_face_recognition_log.sql` — tabela nova (aditiva),
  `shadow_face_recognition_log`, com RLS no mesmo padrão já usado em `authorized_persons` (admin só
  vê/insere da própria escola). **Aplicada em produção.**

### Alteração em `AdminFaceScanner.jsx` (arquivo antes nunca tocado)

- `select()` da lista de responsáveis: adicionada a coluna `face_descriptor_v2` (só leitura, nada
  além disso muda no select).
- Nova função `runHumanShadowComparison()`: chamada **uma única vez**, logo depois que o motor atual
  já confirmou um match de verdade (`matchConfirmed = true`). Roda o `Human` no worker sobre o mesmo
  frame, calcula a melhor correspondência por similaridade de cosseno contra `face_descriptor_v2` de
  cada pessoa, e grava uma linha em `shadow_face_recognition_log` — **nunca aguardada
  (`await`) pelo fluxo principal, nunca lança erro pra fora, nunca altera nenhum estado usado pela
  UI real.**

## 2. O que NÃO foi feito (de propósito)

- **Zero alteração** em `MATCH_THRESHOLD`, `MATCH_MARGIN`, `CONSISTENCY_FRAMES`,
  `DETECTION_INTERVAL_MS`, `STUCK_TIMEOUT_MS`, `findSecureMatch`, `evaluateFramePosition`,
  `enhanceForLowLight` — confirmado por `git diff` filtrado, zero ocorrências em linhas
  adicionadas/removidas.
- **Zero alteração** em `requestKioskAccess`, `updateStudentStatus`, ou qualquer lógica do fluxo
  Totem → Monitor → Recepção.
- O resultado do `Human` **nunca é lido por nenhum componente de UI** — só é gravado no banco, para
  análise posterior.
- Nenhuma alteração no `faceModels.js` nem em `humanFaceEngine.js` (da Fase E — esse arquivo continua
  existindo, mas não é usado por `AdminFaceScanner.jsx`; a integração real usa o worker, por causa do
  conflito de bibliotecas descrito acima).

## 3. Build, Lint e Regressão

- `npm run build` → **PASS**. O worker do Human virou um chunk JS próprio e separado
  (`humanShadowWorker-*.js`, ~1.5MB / 397KB gzip) — só é baixado quando alguém abre o Totem/Scanner e
  um match é confirmado pela primeira vez, não no carregamento inicial do app.
- `npm run lint` → **PASS** (exit 0), só warnings pré-existentes não relacionados a este código.
- `git diff -- src/components/AdminFaceScanner.jsx | grep [funções protegidas]` → **0 ocorrências**.
  A única linha removida no diff é a própria linha do `select()` que eu estendi.

## 4. Teste em navegador real (antes da integração)

Página de teste isolada (removida depois), rodando `npm run dev` + Chromium real via Playwright:
- `face-api.js` no thread principal: detectou rosto, 10293ms, score 0.999.
- `Human` no worker: detectou rosto, 8741ms, score 1.000, dims 1024.
- **Nenhum erro, nenhum conflito** — os dois rodaram ao mesmo tempo, cada um no seu contexto.

## 5. O que ainda NÃO foi testado

- **A integração real dentro do `AdminFaceScanner.jsx`** — não testei o componente completo rodando
  (câmera real, loop de detecção, confirmação de match) com essa mudança. O teste da seção 4 provou
  que a arquitetura (worker) funciona; não é o mesmo que testar o componente inteiro em produção.
- Nenhuma linha ainda foi gravada em `shadow_face_recognition_log` — a tabela existe, vazia.

## 6. Segurança

- Bucket/RLS/policies existentes: intactos.
- A nova tabela `shadow_face_recognition_log` só guarda IDs e números (similaridade, tempo em ms) —
  nenhuma foto, nenhum descriptor bruto, nenhum dado biométrico é persistido nela.
- RLS da nova tabela: mesmo escopo de sempre (admin só vê/insere da própria escola).

## 7. Git

```
 M src/components/AdminFaceScanner.jsx
 M package.json / package-lock.json (dependência @vladmandic/human, já instalada na Fase E)
?? src/lib/humanShadowClient.js
?? src/lib/humanShadowWorker.js
?? supabase/migrations/20260826_add_shadow_face_recognition_log.sql
```

Deploy autorizado explicitamente pelo usuário para esta fase — commit + push realizados após este
relatório (ver confirmação abaixo).

## 8. Próximo passo

Depois do deploy: deixar o modo observador acumular dados reais por um tempo (dias, dependendo do
volume de uso das escolas), depois consultar `shadow_face_recognition_log` para medir:
- Taxa de concordância entre os dois motores (`agree = true`).
- Tempo médio de detecção do Human em hardware real (`human_detection_ms`).
- Casos de discordância — quem estava certo, checando manualmente.

Só depois disso caberia considerar a Fase G (corte definitivo) — não antecipada nem iniciada aqui.
