# Plano de implementação mobile do Zela Escola (revisado na FASE 1)

Data da auditoria: 11/10/2026. Prazo final: 31/01/2027. Somente leitura: nenhum código, dependência ou projeto nativo foi alterado.

## 1. Diagnóstico atual (confirmado no repositório)

| Item | Achado |
|---|---|
| Git | Branch `main`, remoto `origin` (GitHub). Há alterações não commitadas (push `pushCore`/`push.ts`, `GestaoShared.jsx`, docs), `docs/PLANO_APPS_MOBILE.md` removido do índice (staged), e não rastreados: `.claude/skills/`, `.mcp.json`, `frontend-design.md`, `skills-lock.json`. Nada foi tocado. |
| Pacotes | npm (`package-lock.json`). Node local 24.15, npm 11.15. CI usa Node 22. Sem `@capacitor/*`, sem `android/` e `ios/`. |
| Stack | React 19.2, Vite 8.1, Tailwind 4.3, JSX, Vitest 4, oxlint, Sentry, supabase-js 2.110, `@vladmandic/human`, `face-api.js`, `jsqr`, `tesseract.js`, `pdfjs-dist`, `xlsx`. |
| Build | `vite build` gera `dist/index.html` (31 MB, inclui modelos faciais). Build OK em 6,8 s. O plugin de compressão gerou um caminho estranho dentro de `dist` (`dist/C:/Users/...`), a investigar (provável efeito do Windows). |
| Lint | `oxlint` roda com avisos (variáveis não usadas), sem erros. |
| Testes | `vitest run`: 100 arquivos, 713 testes. 362 passaram, 172 pulados, 179 falharam em 55 arquivos. Todas as falhas amostradas são `fetch failed`: os testes de integração apontam para um Supabase local que não está em execução. Não é regressão de código. A linha de base útil precisa ser refeita com o Supabase local ligado (decisão na seção 7). |
| Roteamento | Sem react-router. Navegação por abas em `App.jsx`, `useTabHistory.js` (botão voltar) e `utils/navigate.js`. Isso favorece o app empacotado (sem dependência de rotas por URL). |
| Supabase | Cliente em `src/lib/supabase.js` (anon key via `VITE_SUPABASE_*`), segundo cliente sem persistência para cadastro. 33 Edge Functions, 30 migrations. Variáveis: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_SENTRY_DSN`, `VITE_VAPID_PUBLIC_KEY`, `VITE_PUBLIC_APP_URL`. |
| Hospedagem | Vercel (`sensekids.vercel.app`), `vercel.json` com `Permissions-Policy: camera=(self)` e rewrite SPA. |
| PWA | `manifest.json`, `public/sw.js`, Web Push (VAPID) em `usePushNotifications.js`. Servidor de push já tem FCM (`_shared/push.ts`, tabela com `platform` e `token`). |
| Câmera/rosto | `getUserMedia` em `AdminFaceScanner`, `AdminQrScanner`, `FaceCameraCapture`. Motores `humanFaceEngine.js`, `faceModels.js`, `humanShadowWorker.js`. Modelos: `public/models` 13 MB, `public/models-human` 8,9 MB. |
| Outros pontos de WebView | `window.open`/`createObjectURL` nos módulos `print*.js` (impressão e PDF), `localStorage`/`sessionStorage` em 28 arquivos, uploads de arquivo, `versaoDoApp`/`useAppUpdate` (compara `/version.json`). |
| CORS | `supabase/functions/_shared/cors.ts` aceita só `sensekids.vercel.app` e localhost. **Bloqueio técnico:** a origem do app Capacitor (`https://localhost` no Android, `capacitor://localhost` no iOS) será recusada pelas Edge Functions. Exige mudança de Edge Function (mudança de segurança, análise e aprovação antes). |
| Plano anterior | `docs/PLANO_APPS_MOBILE.md` (commit HEAD) já detalha 12 fases e itens feitos na web (botão voltar, exclusão de conta, FCM no servidor). Reaproveitar, não duplicar. Bloqueio dele: **sem CNPJ** em 05/10, logo sem D-U-N-S nem conta empresarial nas lojas. |

## 2. Correções ao prompt mestre

1. **Android API 36:** confirmado (Google Play, exigência até 31/08/2026, extensão até 01/11/2026). Em janeiro de 2027 vale API 36 ou superior; revalidar na data do envio.
2. **Capacitor 8** (docs atuais): Node 22+, Android Studio 2025.2.1+, JDK embutido no Android Studio, SDK com API 24+ e API 36, **Xcode 26+**, Swift Package Manager como padrão no iOS (CocoaPods opcional). Não instalar CocoaPods.
3. **Node local 24 vs CI 22:** funciona com Capacitor 8, mas o build do app deve usar a mesma versão do CI.
4. **`capacitor.config`:** usar `capacitor.config.json` (projeto é JS, sem TypeScript).
5. **`webDir`:** `dist`, confirmado.
6. **Teste de 12 pessoas por 14 dias** vale só para conta pessoal nova do Google Play. Com CNPJ (conta empresarial) provavelmente não se aplica; confirmar o tipo de conta.
7. **Câmera:** `@capacitor/camera` não serve para vídeo contínuo. O reconhecimento usa `getUserMedia` no WebView; plugin só se o teste em aparelho real falhar.
8. **Push:** o plano anterior prevê FCM. Service Worker/Web Push não funciona no WebView; será preciso `@capacitor/push-notifications` e Firebase (escopo da fase 5, aprovação própria).
9. **Faltava no prompt:** CORS das Edge Functions, `window.open`/PDF/impressão no WebView, `/version.json` e `useAppUpdate` (não fazem sentido empacotados), Sentry no app, tamanho do pacote (31 MB de dist, sendo 22 MB de modelos).

## 3. Arquitetura recomendada

- Capacitor 8 (core, cli, android, ios) com o frontend React atual empacotado (`dist`), sem `server.url` em produção.
- Mesmo código para Web e app. Diferenças por `Capacitor.isNativePlatform()` isoladas em um módulo único (por exemplo `src/lib/plataforma.js`), nunca espalhadas.
- Build do app com variáveis próprias (`.env.mobile` fora do Git), apontando para o Supabase de homologação nos testes e produção só no release.
- Modelos faciais: avaliar baixar sob demanda (já previsto no plano anterior) para reduzir o pacote.
- Estrutura prevista: `capacitor.config.json`, `android/`, `ios/`, `assets/` (ícone e splash), `docs/mobile/`.

## 4. Plano revisado das fases e cronograma

| Fase | Janela | Dependências | Observação |
|---|---|---|---|
| 1 Auditoria e plano | 11 a 15/10 | none | Este documento. |
| 2 Ambiente, contas, homologação | 16 a 20/10, estendida | CNPJ, D-U-N-S, Mac | **Caminho crítico.** Sem CNPJ não há contas empresariais. Começar já o que independe disso. |
| 3 Capacitor e Android | 21/10 a 01/11 | Fase 2 (appId, branch) | Android primeiro; iOS só com Mac. |
| 4 Nativo e UX mobile | 02 a 15/11 | Fase 3 | Safe areas, botão voltar, ícones. |
| 5 Integrações (câmera, push, CORS, privacidade) | 16 a 29/11 | Fase 4, Firebase | Inclui mudança de CORS e push nativo, com análise de segurança. |
| 6 Testes e homologação | 30/11 a 13/12 | Fase 5, aparelhos reais | iOS exige Mac e iPhone. |
| 7 Preparação das lojas | 14 a 20/12 | Fase 6, política de privacidade | Advogado para LGPD e biometria. |
| 8 Teste interno/fechado | 21/12 a 10/01 | Contas liberadas | Pode precisar de 14 dias se a conta for pessoal. |
| 9 Produção e acompanhamento | 11 a 31/01 | Fase 8 | Revisão da Apple costuma levar dias; deixar folga para rejeições. |

Paralelismo possível: contas e D-U-N-S, política de privacidade, ícones e textos das lojas, Firebase e CORS correm junto às fases 3 e 4.

## 5. Riscos e mitigação

| Risco | Impacto | Mitigação |
|---|---|---|
| Sem CNPJ/D-U-N-S/contas | Impede publicar | Abrir agora; plano B: conta pessoal Google (12 testadores, 14 dias), Apple individual. |
| Sem Mac | iOS não compila | Mac remoto ou serviço de build em nuvem; decidir na Fase 2. |
| CORS bloqueia o app | Todas as Edge Functions falham | Adicionar origens do app à allowlist, testar em homologação, sem usar `*`. |
| Reconhecimento facial no WKWebView | Pode ser lento ou falhar | Teste em iPhone real antes da Fase 7; manter PIN/QR/autorização como alternativa. |
| Escola piloto afetada | Operação parada | Branch separada, sem deploy de produção, sem migrations nem RLS alteradas. |
| Biometria de crianças e lojas | Rejeição ou questão legal | Revisão jurídica, declarações das lojas conforme o código real. |
| Rejeição das lojas ("site embrulhado") | Atraso | Experiência nativa mínima: push, botão voltar, câmera, splash. |
| Egress do Supabase | Custo | Modelos locais no pacote, testes em homologação. |

## 6. Critérios de aprovação da FASE 1

Atendidos: estado do Git, pacotes, build, lint e testes registrados; Capacitor 8 e Google Play verificados na documentação; bloqueios listados. Não verificado ainda: Android Studio, SDK, Xcode, Mac, aparelhos físicos e contas das lojas (nada disso foi inspecionado).

## 7. Decisões e pendências para aprovar

1. **Identificador definitivo** (`appId`), por exemplo domínio próprio reverso. Sem ele não inicio a Fase 3.
2. **CNPJ e contas:** status real de CNPJ, D-U-N-S, Apple Developer e Google Play Console.
3. **iOS:** Mac próprio, remoto ou build em nuvem.
4. **Homologação:** existe projeto Supabase separado? Se não, criar um (recurso externo, só com sua aprovação).
5. **Testes de integração:** posso subir o Supabase local (Docker Desktop) para refazer a linha de base completa? É uma ação local, sem tocar em produção.
6. **Alterações pendentes no Git:** commitar ou guardar antes de criar `feature/mobile-capacitor`.
7. **Aparelhos:** quais Android e iPhone reais existem.
8. **Plano anterior:** manter `docs/PLANO_APPS_MOBILE.md` removido (staged) ou restaurar? Este documento o reaproveita.

## 8. Documentação usada

- https://capacitorjs.com/docs/getting-started/environment-setup (Capacitor 8, Node 22, Xcode 26, SPM, Android Studio 2025.2.1)
- https://support.google.com/googleplay/android-developer/answer/11926878 (API 36)
- Demais fontes do prompt mestre serão consultadas nas fases em que forem aplicadas (não lidas nesta fase: páginas de Android, iOS, workflow, Apple, LGPD).

## 9. Atualização da FASE 2 (11/10/2026)

- **appId definido:** `br.com.zelaedu.app` (domínio `zelaedu.com.br` fica para site, suporte e privacidade; decisão de 11/10). Nome visível: Zela Escola.
- **Branch criada:** `feature/mobile-capacitor` (a partir da `main` em `7d0ebfb`, já enviada ao GitHub).
- **Linha de base de testes com Supabase local (Docker):** 100 arquivos, 89 passaram, 11 falharam (39 testes). A causa amostrada é HTTP 503 das Edge Functions, porque `supabase functions serve` não estava rodando. Antes, sem o banco local: 55 arquivos falhando. Refazer com as funções servidas na Fase 6.
- **Contas:** início como Pessoa Física, mudança posterior para PJ (transferência do app). Google Play pessoal exige teste fechado de 12 pessoas por 14 dias.
- **iOS sem Mac:** CI em nuvem com Mac (Codemagic ou GitHub Actions) para compilar e assinar, TestFlight no iPhone 11 Pro Max, Mac remoto por hora só para depurar a câmera. Custos a confirmar.
- **Aparelhos:** Galaxy S23 Ultra e iPhone 11 Pro Max; falta um Android de entrada para desempenho.

## 10. Homologação criada (11/10/2026)

- Projeto Supabase novo e isolado: `zela-homologacao`, ref `biybjifoxnuxwkaametp`, região sa-east-1, org "Acesso". Produção ("Zela Portal") não foi tocada e o `supabase/.temp/project-ref` continua apontando para ela.
- Aplicadas as 30 migrations (`migration list`: local = remoto). Publicadas 32 Edge Functions.
- Senha do banco em `.env.homolog.local` (ignorado pelo Git, nunca commitar). Comandos de homologação usam `--db-url` ou `--project-ref`, nunca `supabase link`.
- Pendente: segredos das funções (Asaas, VAPID, FCM etc., com valores de teste), buckets de Storage (confirmar se vêm das migrations), usuário e escola fictícios, CORS com a origem do app, `.env.mobile` com URL e chave pública.
- Limite do plano gratuito: projetos pausam após inatividade.

## 11. FASE 3 executada em parte (11/10/2026)

- Capacitor `8.5.3` exato em `@capacitor/core`, `@capacitor/android` e `@capacitor/cli` (iOS adiado até existir Mac ou CI).
- `capacitor.config.json`: appId `br.com.zelaedu.app`, nome Zela Escola, `webDir` `dist`. Sem `server.url`.
- Projeto `android/` criado: minSdk 24, compileSdk e targetSdk 36, única permissão `INTERNET`. `npm run build` + `npx cap sync android` OK. `npx cap doctor`: Android OK.
- **Não verificado:** Android Studio e SDK não estão instalados nesta máquina, então o projeto não foi aberto nem compilado em APK/AAB, nem rodou em aparelho.
- **Atenção:** o build de `dist` usa o `.env` atual (Supabase de produção). Antes de qualquer teste em aparelho, criar `.env.mobile` com a homologação e compilar com `vite build --mode mobile`.
- Em aberto: o plugin de compressão grava `dist/C:/Users/.../*.gz` (caminho absoluto no Windows); não afeta o app, a corrigir depois.

## 12. Estado ao fim da sessão 1 (11/10/2026)

- Android Studio Rabbit 2026.2.1 instalado; JVM 21 escolhido; projeto `android/` abriu e o Gradle sincronizou (BUILD SUCCESSFUL).
- `.env.mobile.local` (gitignorado) aponta para a homologação; `npm run build:mobile` compila e sincroniza. Verificado: nenhuma referência ao ref de produção no pacote.
- **Próximos passos:** (1) rodar no Galaxy S23 Ultra (Depuração USB) e confirmar que o app abre; (2) semear homologação com escola e usuários fictícios; (3) CORS das Edge Functions para a origem do app (com análise de segurança e aprovação); (4) segredos de teste das funções; (5) Fase 4 (UX mobile, ícones, splash).
- iOS segue pendente: CI com Mac, conta Apple Developer, TestFlight.
