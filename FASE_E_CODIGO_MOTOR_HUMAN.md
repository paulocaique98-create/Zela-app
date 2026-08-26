# FASE E — Implementação de Código (isolada, sem deploy)

Status: **CONCLUÍDA.**

## 1. O que foi feito

- Instalada a dependência `@vladmandic/human` (`^3.3.6`) no `package.json` do projeto principal —
  coexistindo com `face-api.js`, nenhuma removida.
- Copiados os 3 modelos necessários (`blazeface`, `facemesh`, `faceres`, ~8.9MB) para
  `public/models-human/` — pasta **separada** de `public/models/` (que continua servindo o
  `face-api.js` atual, intocada).
- Criado `src/lib/humanFaceEngine.js`: módulo novo com as primitivas do motor candidato —
  `preloadHumanModels()`, `detectHumanDescriptor()`, `cosineSimilarity()`, `findBestMatchHuman()` —
  usando o threshold candidato da Fase D (`HUMAN_MATCH_THRESHOLD_COSINE = 0.48`).

## 2. O que NÃO foi feito (de propósito)

- **Nenhum componente importa `humanFaceEngine.js`.** Ele existe no repositório mas não é chamado em
  lugar nenhum do app — confirmado que ele nem aparece como chunk separado no build (Vite/Rollup não
  incluiu no bundle final por não ter nenhum import real).
- **Zero alteração** em `AdminFaceScanner.jsx`, `App.jsx`, `faceModels.js` ou qualquer arquivo do
  fluxo de reconhecimento facial atual — confirmado por `git diff` vazio nesses 3 arquivos.
- Nenhuma lógica de câmera, canvas, captura, ou fluxo Totem → Monitor → Recepção foi tocada.
- Nenhuma verificação de ambiguidade entre múltiplos candidatos nem lógica de múltiplos frames
  consecutivos (`CONSISTENCY_FRAMES`) foi implementada — isso é responsabilidade de quem for
  integrar esse motor num fluxo real (Fase F ou além), não deste módulo de primitivas puras.
- Nenhum deploy, commit ou push.

## 3. Build e Lint

- `npm run build` → **PASS**, sem erros. Os modelos do Human aparecem no `dist/models-human/` como
  assets estáticos, junto (não misturados) com os modelos do `face-api.js` em `dist/models/`.
- `npm run lint` → **PASS** (exit 0), zero warnings no arquivo novo.

## 4. Regressão

`git diff -- src/components/AdminFaceScanner.jsx src/App.jsx src/lib/faceModels.js` → **vazio**.
Nenhuma das constantes/funções protegidas (`MATCH_THRESHOLD`, `MATCH_MARGIN`, `CONSISTENCY_FRAMES`,
`DETECTION_INTERVAL_MS`, `STUCK_TIMEOUT_MS`, `findSecureMatch`, `evaluateFramePosition`,
`enhanceForLowLight`) foi alterada.

## 5. Segurança/Auditoria

- `npm audit` reportou 6 vulnerabilidades (4 altas) trazidas pela árvore de dependências do
  `@vladmandic/human` (`node-fetch`, `nanoid`) — são de uso server-side/build-time dessas libs
  transitivas, não do código que roda no navegador. **Não corrigi** — fora do escopo desta fase
  (regra explícita do plano: não fazer refatoração/correção não relacionada). Vale revisitar antes de
  qualquer deploy real do motor novo.

## 6. Estado do Git

```
 M package-lock.json
 M package.json
?? public/models-human/
?? src/lib/humanFaceEngine.js
```

Nenhum commit, push ou deploy.

## 7. Teste real em navegador (Chromium, via Playwright)

Feito depois do relatório inicial desta fase, a pedido do usuário. Resumo:

- Página de teste temporária (`human-engine-test.html`, na raiz do projeto — **não fazia parte do
  app real**, nunca foi referenciada por nenhuma rota) importando diretamente
  `preloadHumanModels()`/`detectHumanDescriptor()` de `src/lib/humanFaceEngine.js`.
- `npm run dev` (servidor real do Vite) + Chromium headless real (via Playwright, já que
  `chromium-cli` não estava disponível neste ambiente) navegando pra essa página.
- **Carregamento dos modelos**: sucesso, 932ms. WebGL e WebGPU **não disponíveis** neste container
  headless (sem GPU real) — o `Human` caiu automaticamente pro backend CPU, sem erro fatal. Isso
  prova a resiliência do fallback, não a performance final (que só um teste em hardware real, com
  GPU disponível — PC/celular normal — mediria de verdade).
- **Detecção real de rosto**: enviei uma foto real (baixada do Storage via signed URL, apagada logo
  depois do teste) através de um `<input type="file">` de verdade, exatamente como um usuário faria.
  Resultado: **rosto detectado, score 1.000, descriptor de 1024 dimensões**, confirmado tanto no
  console quanto visualmente por screenshot da página renderizada.
- Um bug de configuração foi encontrado e corrigido durante o teste: passar flags de GPU
  (`--use-gl=swiftshader`, `--enable-webgl`) pro Chromium causava um erro interno
  (`Cannot read properties of null (reading 'getImageData')`) dentro do próprio `Human` — sem essas
  flags, tudo funcionou. Isso é uma característica do ambiente de teste (container sem GPU), não do
  código de produção — não fica registrado em nenhum arquivo do projeto, só documentado aqui.
- Toda a infraestrutura de teste (Playwright, página HTML temporária, foto baixada) foi removida
  depois — `git status` confirma que só os arquivos da seção 6 permanecem.

**Conclusão**: o motor `Human`, tal como implementado em `humanFaceEngine.js`, funciona de ponta a
ponta num navegador real (carrega modelos, aceita uma foto real como um usuário enviaria, detecta
rosto, gera descriptor) — validado por execução real, não só por leitura de código.

## 8. Teste de performance real (hardware do usuário)

Feito com a participação direta do usuário — duas páginas de teste isoladas
(`teste-faceapi.html`/`teste-human.html`, nunca fizeram parte do app real), uma pra cada motor
(precisou ser em páginas separadas: carregar os dois motores na mesma página trava, porque cada um
embute uma versão diferente do TensorFlow.js e elas colidem no mesmo contexto JS — mesmo bug que já
tinha aparecido em Node.js nos testes da Fase C).

`npm run dev` rodando localmente, usuário abriu as duas páginas no próprio navegador (Chrome/Edge,
hardware real) e testou a **mesma foto** nos dois motores:

| | face-api.js (atual) | Human (candidato) |
|---|---:|---:|
| Carregamento dos modelos | 1094ms | 555ms |
| Detecção do rosto | 12374ms | 9406ms |
| Score | 1.000 | 1.000 |

**Human foi ~49% mais rápido pra carregar os modelos e ~24% mais rápido pra detectar o rosto**, no
mesmo hardware, mesma foto, mesmo navegador. Ressalva: os dois tempos de detecção (9-12s) são mais
altos do que o esperado com aceleração de GPU normal — provavelmente refletem o custo de "aquecimento"
de shaders na primeira inferência, comum em ambos os motores. A comparação relativa entre os dois
continua válida; o valor absoluto não representa a velocidade de regime permanente (frames
subsequentes tendem a ser bem mais rápidos que o primeiro).

Toda a infraestrutura de teste foi removida depois — `git status` confirma que só os arquivos da
seção 6 permanecem.

## 9. Próximo passo

Com o teste em navegador feito, o que continua pendente:

- **Performance real** (não testável neste ambiente sem GPU) — só um teste em hardware normal
  (PC/celular do dia a dia, ou o próprio Totem) mediria o tempo de detecção de verdade.
- Da Fase D: uma amostra maior de validação antes de travar o threshold 0.48 como definitivo.
- Nenhuma integração com o fluxo real do Totem foi feita — isso continua reservado pra Fase F (modo
  observador), com autorização própria.
