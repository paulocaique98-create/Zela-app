# Plano de implementação mobile do Zela Edu (revisado na FASE 1)

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

| Fase | Janela | Dependências | Situação em 14/10/2026 | Observação |
|---|---|---|---|---|
| 1 Auditoria e plano | 11 a 15/10 | none | Concluída (11/10) | Este documento. |
| 2 Ambiente, contas, homologação | Homologação feita. Contas de loja por último, data a definir | Verba para as taxas das lojas | Parcial: homologação criada (seção 10). Contas de loja adiadas para o fim (sem verba agora) | Lançamento em pessoa física, migração para CNPJ depois. Abrir primeiro a conta do Google Play (teste fechado de 14 dias), depois a Apple. |
| 3 Capacitor e Android | 21/10 a 01/11 | Fase 2 (appId, branch) | Android feito e rodando no S23 Ultra; iOS compila no simulador via Actions (ios-build.yml, só manual), nunca rodou em aparelho (seção 20); branches mobile mescladas na main e apagadas | Android primeiro; iOS só com Mac. |
| 4 Nativo e UX mobile | 02 a 15/11 | Fase 3 | Executada (seção 15) | Safe areas, botão voltar, ícones. |
| 5 Integrações (câmera, push, CORS, privacidade) | 16 a 29/11 | Fase 4, Firebase | Em andamento: push validado na homologação, CORS de produção, política e suporte no ar. Push em primeiro plano feito (toast com app aberto) e teste 4 aprovado no S23: solicitação e confirmação com app em segundo plano, aberto e fechado; usuário sem vínculo não recebeu nada | Inclui mudança de CORS e push nativo, com análise de segurança. |
| 6 Testes e homologação | 30/11 a 13/12 | Fase 5, aparelhos reais | Próxima a executar (sem depender de conta). Iniciada: exclusão de conta e push testados no S23. Faltam Android de entrada e iOS em aparelho real | iOS exige Mac e iPhone. |
| 7 Preparação das lojas | 14 a 20/12 | Fase 6, política de privacidade | Iniciada: textos, categoria, privacidade e checklist iOS prontos. Conta de demonstração do revisor decidida e criada; falta testar o login dela no app | Advogado para LGPD e biometria. |
| 8 Teste interno/fechado | 21/12 a 10/01 | Fase 2 (contas de loja) | Não iniciada. Só começa depois de abrir as contas | Pode precisar de 14 dias se a conta for pessoal. |
| 9 Produção e acompanhamento | 11 a 31/01 | Fase 8 | Não iniciada | Revisão da Apple costuma levar dias; deixar folga para rejeições. |

As janelas acima são as originais. O trabalho está adiantado em relação a elas (fases 3 a 7 já iniciadas em outubro); o limite real passou a ser contas de loja, CNPJ/D-U-N-S, Mac e iPhone.

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

- **appId definido:** `br.com.zelaedu.app` (domínio `zelaedu.com.br` fica para site, suporte e privacidade; decisão de 11/10). Nome visível: Zela Edu.
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
- `capacitor.config.json`: appId `br.com.zelaedu.app`, nome Zela Edu, `webDir` `dist`. Sem `server.url`.
- Projeto `android/` criado: minSdk 24, compileSdk e targetSdk 36, única permissão `INTERNET`. `npm run build` + `npx cap sync android` OK. `npx cap doctor`: Android OK.
- **Não verificado:** Android Studio e SDK não estão instalados nesta máquina, então o projeto não foi aberto nem compilado em APK/AAB, nem rodou em aparelho.
- **Atenção:** o build de `dist` usa o `.env` atual (Supabase de produção). Antes de qualquer teste em aparelho, criar `.env.mobile` com a homologação e compilar com `vite build --mode mobile`.
- Em aberto: o plugin de compressão grava `dist/C:/Users/.../*.gz` (caminho absoluto no Windows); não afeta o app, a corrigir depois.

## 12. Estado ao fim da sessão 1 (11/10/2026)

- Android Studio Rabbit 2026.2.1 instalado; JVM 21 escolhido; projeto `android/` abriu e o Gradle sincronizou (BUILD SUCCESSFUL).
- `.env.mobile.local` (gitignorado) aponta para a homologação; `npm run build:mobile` compila e sincroniza. Verificado: nenhuma referência ao ref de produção no pacote.
- **Próximos passos:** (1) rodar no Galaxy S23 Ultra (Depuração USB) e confirmar que o app abre; (2) semear homologação com escola e usuários fictícios; (3) CORS das Edge Functions para a origem do app (com análise de segurança e aprovação); (4) segredos de teste das funções; (5) Fase 4 (UX mobile, ícones, splash).
- iOS segue pendente: CI com Mac, conta Apple Developer, TestFlight.

## 13. Primeiro teste em aparelho (11/10/2026)

- Correção: `vite.config.js` desliga o gzip no modo `mobile` (Gradle falhava com "Duplicate resources" por X.js e X.js.gz). Build da Web inalterado.
- Resultado: build Android passou e o app abriu na tela de login no Galaxy S23 Ultra (SM-S918B), apontando para a homologação. Verificado pelo responsável; sem evidência automatizada. Login e demais fluxos ainda não testados (banco de homologação vazio).

## 14. CORS e login em aparelho (11/10/2026)

- `supabase/functions/_shared/cors.ts` aceita origens extras via secret `EXTRA_ALLOWED_ORIGINS` (sem `*`). Na homologação o secret vale `https://localhost` (origem do app Android) e as 32 funções foram redeployadas. Produção intocada: o secret só deve ser definido lá no release.
- Verificado: preflight com `Origin: https://localhost` é aceito e origem estranha continua barrada. Login de `admin@teste.example.com` no Galaxy S23 Ultra funcionou (confirmado pelo responsável).
- A homologação já tinha escola `TST01` e 5 usuários `@teste.example.com`; senha do admin redefinida só na homologação.
- **Pendente:** exercitar uma Edge Function pelo app (ex.: cadastrar responsável); segredos de teste (Asaas sandbox, VAPID, FCM); Fase 4 (UX mobile, ícones, splash). `.trim()` no e-mail do login (Login.jsx) sugerido, não aplicado.

## 15. FASE 4 executada (11/10/2026)

- Plugins Capacitor com versão exata: `@capacitor/app` 8.1.2, `status-bar` 8.0.4, `splash-screen` 8.0.2; dev: `@capacitor/assets` 3.0.5.
- Safe areas: **não** usar `viewport-fit=cover`. Com ele o Capacitor 8 deixa a WebView sob a barra de status e o cabeçalho ficou atrás do relógio (visto no aparelho). Sem ele, o Capacitor reserva notch e gestos para o app todo. Se um dia for adotado edge-to-edge, tratar o topo em todos os cabeçalhos antes.
- Botão voltar: já funciona pelo `useTabHistory` (histórico do WebView); testado no aparelho (aba Alunos, Voltar, volta às Ações rápidas sem fechar o app). Nenhum listener nativo foi necessário.
- `src/lib/nativeInit.js` (chamado em `main.jsx`): status bar com ícones claros e cor `#1e5563` (a cor de fundo é ignorada no Android 15+ edge-to-edge; a barra segue cinza escuro). Splash na cor da marca.
- Ícone adaptativo e splash gerados em `assets/` (escudo branco sobre `#1e5563`, a mesma marca do login) e aplicados em `android/res`. O ícone antigo de `public/` (Z roxo) está desatualizado e a Web ainda o usa.
- Login: `.trim()` no e-mail.
- Build: `JAVA_HOME` = `~/.jdks/jbr-21.0.11` (o JBR do Android Studio é Java 25 e quebra o Gradle). `assembleDebug` gera APK test-only; instalar com `adb install -r -t`.
- Não feito: ajustes de toque/teclado (sem problema visto; o zoom em inputs é do iOS) e ícone/splash do iOS.

## 16. FASE 5 iniciada (11/10/2026)

- Manifest Android: permissões `CAMERA` e `POST_NOTIFICATIONS`; câmera declarada como não obrigatória.
- Push nativo: `@capacitor/push-notifications` 8.1.3 (exato). `src/lib/pushNativo.js` registra no FCM e grava o token em `push_subscriptions` (`platform='android'`, upsert por `token`); `usePushNotifications.js` usa esse caminho só em app nativo (web intocada); `handleLogout` apaga o token do aparelho antes do signOut. Sem mudança de banco nem de RLS.
- Cuidado: se sobrar token de outra conta no mesmo aparelho (logout sem rede), o upsert falha pela RLS (só o dono altera a linha). A tratar se aparecer nos testes.
- `send-test-push` só aceita `endpoint` (web); o teste de push no app depende do Firebase.
- Verificado: lint dos 2 arquivos sem erros, `build:mobile` e `cap sync` ok (4 plugins). NÃO testado no aparelho (câmera, permissão, token).
- Pendente (usuário): criar projeto Firebase, app Android `br.com.zelaedu.app`, colocar `google-services.json` em `android/app/` e a service account em `FCM_SERVICE_ACCOUNT` (só homologação).
- Reconhecimento facial passou a base (sem depender de `plan`): botão do totem sempre visível; campo "Plano contratado" e selo basic/pro saíram do Portal do Dev (coluna `plan` mantida no banco). Confirmado pelo responsável que o botão aparece no app (11/10).
- Firebase: projeto `zela-homologacao`, `google-services.json` em `android/app/`, secret `FCM_SERVICE_ACCOUNT` definido só na homologação.
- `send-test-push` aceita `token` (app) além de `endpoint` (web); publicada só na homologação. As demais funções que importam `_shared/push.ts` não foram redeployadas (mudança compatível). Push de ponta a ponta ainda NÃO testado no aparelho.
- Correções em aparelho (11/10): shards do face-api renomeados para `.bin` no build do app (`scripts/mobile-modelos.mjs`), porque o servidor local do Capacitor entregava os arquivos sem extensão truncados (erro "tensor should have 512 values but has 290"); faixa de ativar notificações no app não depende mais de `Notification.permission` do WebView.
- Verificado pelo responsável no Galaxy S23 Ultra (homologação): cadastro de biometria da família, ativação de notificações e reconhecimento facial no totem funcionaram. Sem evidência automatizada. Continua pendente: iOS, privacidade/LGPD (rascunho de permissões), teste em Android de entrada, segredos de teste (Asaas, VAPID).

## 17. FASE 6 iniciada (11/10/2026)

- Criados `docs/mobile/CHECKLIST_TESTES_APARELHO.md` (roteiro para o aparelho) e `docs/mobile/RASCUNHO_PRIVACIDADE_PERMISSOES.md` (permissões, dados, perguntas para o jurídico).
- Testes automatizados novos em `src/test/mobileNative.test.js` (8 testes de `nativeInit` e `pushNativo`, plugins e Supabase simulados): 8 passaram; oxlint sem erros nos 3 arquivos alterados. Não substituem o teste em aparelho.
- **Push e RLS:** migration `20261011120000_registrar_token_push_app.sql` cria `registrar_token_push_app(p_token, p_platform, p_device_info)` (SECURITY DEFINER, `search_path` fixo, só `authenticated`; `user_id` vem de `auth.uid()` e `school_id` do perfil; apaga a linha do mesmo token de outra conta e grava para a logada). `pushNativo.js` agora chama essa função. **A migration ainda NÃO foi aplicada em nenhum banco.** Aplicar primeiro na homologação (ref `biybjifoxnuxwkaametp`); sem ela o push do app falha. Produção só no release.
- Pendente: checklist no aparelho, Edge Function pelo app, segredos Asaas/VAPID, Android de entrada, iOS, revisão jurídica.
- **Checklist no S23 Ultra (12/10):** o responsável informou que todos os itens de `CHECKLIST_TESTES_APARELHO.md` passaram ("aparentemente"), na homologação. Sem evidência automatizada; datas por item não registradas. Não confirmado aqui se a migration `registrar_token_push_app` já estava aplicada na homologação durante o teste de troca de conta.
- **Ainda aberto na Fase 6:** Android de entrada, segredos Asaas/VAPID, revisão jurídica, iOS; migration em produção só no release.

## 18. FASE 7 iniciada (12/10/2026)

- Criado `docs/mobile/PREPARACAO_LOJAS.md`: política de privacidade pública (rascunho), textos da loja, respostas para Segurança de dados do Google Play e App Privacy da Apple, lista de imagens e checklist de release Android. Só documentação, sem mudança de código, banco ou RLS.
- Verificado no código: a foto do rosto é guardada no bucket `person-photos`, além do descritor facial; a política já diz isso. Não verificado: se o bucket é privado e o prazo de retenção.
- Revisão jurídica: o responsável informou que está tranquila (12/10), sem parecer registrado.
- Pendente: itens [CONFIRMAR] do documento, keystore, imagens da loja, URL da política, contas de loja.
- **VAPID na homologação (12/10):** par novo gerado; `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` e `VAPID_SUBJECT` definidos como secrets só na homologação, e `VITE_VAPID_PUBLIC_KEY` do `.env` atualizada. É preciso refazer `build:mobile` e reativar push web nos aparelhos de teste. Push web de ponta a ponta NÃO testado. Produção usa outro par, a gerar no release. Asaas: a chave é por escola no banco, não há secret global a cadastrar (base padrão = sandbox).
- **Release Android (12/10):** `signingConfigs.release` em `android/app/build.gradle` lê `android/keystore.properties` (ignorado pelo git, junto de `*.jks`). Keystore de upload criada em `C:\Users\User\zela-keys\zela-upload.jks` (alias `zela-upload`); **fazer backup dela e da senha em cofre**, fora do repositório. Trocado `proguard-android.txt` por `proguard-android-optimize.txt` (o AGP atual recusava; `minifyEnabled` segue false). `bundleRelease` gerou `app-release.aab` (~23 MB) assinado. Ícone da loja 512 em `docs/mobile/loja/icone-512.png`. AAB NÃO foi instalado nem testado em aparelho; ainda aponta para a homologação.
- **Contas das lojas (12/10):** decisão do responsável de abrir as contas como pessoa física, sem CNPJ e sem D-U-N-S. Consequências (conhecimento geral, regras das lojas NÃO reconferidas): teste fechado do Google Play com 12 testadores por 14 dias; publicador exibido com nome pessoal; migração futura para conta de empresa depende de manter `applicationId` e keystore. Pedir ao jurídico que olhe o enquadramento do publicador pessoa física com dados de crianças e biometria.
- **Pessoa física é temporária (12/10):** o responsável pretende migrar para conta de empresa depois. Pelo conhecimento geral (NÃO reconferido nas lojas), a conta não muda de tipo: cria-se conta de organização e transfere-se o app. Preparar: manter `applicationId` e keystore, usar Play App Signing, nome "Zela Edu" e e-mail institucional (não pessoal) na política, nas fichas e no suporte, e evitar vender pelo app até migrar.
- **Contas das lojas adiadas (12/10):** sem verba no momento. Ordem sugerida quando houver: Google Play primeiro (taxa única, valor NÃO reconferido), Apple depois. Enquanto isso: APK/AAB assinado para piloto direto ou Firebase App Distribution (a confirmar), e Web/PWA para iPhone. Fases 8 e 9 ficam bloqueadas até a conta existir; o teste fechado de 14 dias só começa depois dela.

## 19. Migration de push aplicada e validada na homologação (13/10/2026)

- `registrar_token_push_app` aplicada pelo SQL Editor da homologação (`biybjifoxnuxwkaametp`); `prosecdef = true` conferido. Produção NÃO recebeu a função (só no release). A migration `20261012130000_escola_suspensa_bloqueia_acesso` continua sem aplicar e sem análise. `supabase/.temp/project-ref` aponta para a produção: nunca rodar `db push` sem trocar o link.
- APK debug refeito (`build:mobile` + `assembleDebug`) e instalado no S23 Ultra (`adb` em `%LOCALAPPDATA%\Android\Sdk\platform-tools`, fora do PATH).
- Contas de teste na homologação: `familia1` e `familia2@teste.example.com` (escola `Escola Teste Zela Edu`). Usuário criado só no Auth não loga: precisa de linha em `public.users` (insert manual).
- Resultados (consultas no banco e log do aparelho): token gravado com `platform=android`; `send-test-push` com `success=true` em `push_delivery_attempts`; push exibido na barra com o app em segundo plano; troca de conta A para B e, com logout sem rede (token sobrando), de B para A: mesma linha mudou de dono, sem duplicata nem erro.
- Achado: com o app em primeiro plano o FCM entrega ao plugin (`pushNotificationReceived`, sem listener) e nada é exibido. Lacuna a tratar (toast/aviso). O app também não cria canais Android; o `channel_id` do servidor caiu no canal padrão sem problema.
- Pendente: tratar push em primeiro plano; push real de check-in (Teste 4); Android de entrada; iOS; produção.

## 20. iOS preparado sem conta Apple (13/10/2026, branch feature/mobile-ios, NÃO commitado)

- `@capacitor/ios` 8.5.3 (exato), `npx cap add ios` (Swift Package Manager), script `build:mobile:ios`. `capacitor.config.json` ganhou bloco `ios` (`contentInset: automatic`, fundo `#1e5563`). Ícone 1024 sem alpha e splash gerados pelo `@capacitor/assets`.
- `Info.plist`: texto da câmera em português, `ITSAppUsesNonExemptEncryption=false`, `UIBackgroundModes=remote-notification`, `arm64`. `App.entitlements` com `aps-environment=development` (a Apple troca para production na assinatura).
- Push iOS via Firebase (decisão de 13/10): `AppDelegate.swift` inicia o Firebase só se existir `GoogleService-Info.plist` e converte o token APNs em token FCM; sem o plist o registro falha com mensagem (não grava token lixo). `project.pbxproj` editado À MÃO: pacote `firebase-ios-sdk` (FirebaseCore, FirebaseMessaging, a partir de 12.0.0), entitlements e um script que copia o plist se existir. **Nunca compilado**: precisa rodar `ios-build.yml` para validar.
- Banco: nenhuma mudança. `registrar_token_push_app` já aceita `'ios'` e `pushNativo.js` já enviava `Capacitor.getPlatform()`.
- Workflows (só `workflow_dispatch`, repositório público): `ios-build.yml` (simulador, sem assinatura, homologação) e `ios-release.yml` (arquivar, assinar pela API do App Store Connect e enviar ao TestFlight, ambiente `ios-release` com aprovação, produção). O de release não foi executado e depende dos secrets de `docs/mobile/SECRETS_CI.md`. AAB Android pelo Actions: adiado, junto com o release.
- Docs: `SECRETS_CI.md`, `CHECKLIST_IOS.md`, seção Apple em `PREPARACAO_LOJAS.md` (App Privacy, notas ao revisor, roteiro de capturas).
- Testes: `src/test/mobileNative.test.js` 12 passam (4 novos para iOS). Lint dos arquivos JS alterados sem erros. YAML dos workflows validado sintaticamente (js-yaml). Nada de iOS foi compilado nem executado.
- Aviso de CORS: a homologação só aceita `https://localhost`; para o iOS acrescentar `capacitor://localhost` em `EXTRA_ALLOWED_ORIGINS` (alteração de secret, não feita).

## 21. Bloco 3, dados do negócio (13/10/2026)

- E-mail de suporte e privacidade: `zela.dev26@gmail.com` (aceito pela Apple; trocar por e-mail do domínio quando existir).
- Política já no ar em `https://zelaedu.com.br/privacidade.html` (HTTP 200 verificado). Retenção e exclusão agora descrevem o pedido dentro do app e o prazo de até 30 dias (vem do código de `AccountDeletionSection.jsx`). Página de suporte `public/suporte.html` criada; só publica depois do merge na main.
- Bucket `person-photos`: privado na migration baseline (`public=false`, política por `school_id`). NÃO consultei o banco de produção; ver a consulta de conferência em `PREPARACAO_LOJAS.md` / relatório.
- Categoria Educação definida. Biometria declarada também como informação sensível. Conta de demonstração do revisor DECIDIDA (13/10): escola fictícia isolada na produção (ver seção 22 e `PREPARACAO_LOJAS.md` 3.1). Falta testar o login da Recepção e da Família no app.

## 22. CORS de produção e escola de demonstração (13/10/2026)

- Causa do erro "Failed to send a request": `sensekids.vercel.app` passou a redirecionar (307) para `zelaedu.com.br`, origem que as Edge Functions recusavam. Hotfix `0beba8c` (só `_shared/cors.ts`, +`https://zelaedu.com.br`) na main e publicado em 27 funções de produção; as 5 sem CORS (webhook e crons) ficaram intocadas e `verify_jwt=false` foi preservado. CI da main passou.
- Antes do deploy, as 32 funções de produção foram baixadas e comparadas com a main: idênticas. Descoberto: o secret `EXTRA_ALLOWED_ORIGINS` só existe no código das branches mobile; na produção ele só passa a valer depois do merge e do redeploy no release.
- Escola "Escola Demonstração Apple" (ZL003, basic) criada na produção com Gestão, Recepção, Família, 1 aluno e 1 autorizado. Financeiro ligado por padrão porque faz parte do plano base (decisão do responsável; mantido). Falha de e-mail inválido na primeira tentativa de cadastro foi só de digitação.
- A tela mostra "non-2xx" em vez da mensagem real do servidor; melhoria possível, não feita.

## 23. Bloco 4, backend de teste do iOS (13/10/2026)

- Homologação (`biybjifoxnuxwkaametp`): secret `EXTRA_ALLOWED_ORIGINS` = `https://localhost,capacitor://localhost` (antes só `https://localhost`). Verificado por preflight em `create-admin-user`: as duas origens do app aceitas, origem estranha barrada, sem redeploy. Produção intocada (lá a mesma lista entra no release, depois do merge do código das branches mobile).
- Exclusão de conta (verificada só no código): `AccountDeletionSection` chama `request_account_deletion`, que aceita família, professor e recepção (`admin`); a Gestão só pelo suporte. O botão só aparece na tela da Família (`FamilySettings`). A escola conclui em `GestaoExclusoesConta` (função `delete-user`) em até 30 dias. Lacuna: professor e recepção têm o RPC mas não têm botão. Para a Apple, entregar ao revisor a conta de FAMÍLIA. Teste em aparelho ainda NÃO feito.
- **Exclusão de conta testada na homologação (13/10):** a Família Teste 2 pediu pelo app, a Gestão (conta `gestao@teste.example.com`, criada só na homologação) concluiu em `localhost:5173`. Conferido no banco: pedido `concluida` com `handled_by`, conta removida do Auth e de `public.users`, sem erros em `error_logs`. O cancelamento também foi exercitado (um pedido ficou `cancelada`). Falta confirmar no S23 que o login dela falha.

- **Login após exclusão confirmado no S23 (13/10):** o responsável informou que o teste passou normalmente (sem evidência automatizada). Fecha a pendência do item anterior. Na Fase 6 restam: Android de entrada e iOS.

## 24. Linha de base de testes refeita com Supabase local e funções servidas (14/10/2026)

- Docker local com `supabase functions serve`: antes 11 arquivos falhando (503 das Edge Functions); depois 2 testes falhando, ambos sem relação com infraestrutura.
- Causa 1: banco local atrasado (9 migrations pendentes, entre elas `20261014120000_reduz_minimo_mensal_pacotes`). Aplicadas só no Docker com `supabase migration up --local`; homologação e produção intocadas.
- Causa 2: `portalGestaoModulos.test.js` ainda esperava `contratos.ver` liberado ao admin; a migration `20261010130000` tirou esse padrão de propósito. Teste ajustado (admin `false` por padrão, `true` depois da Gestão liberar).
- Resultado final: 103 arquivos e 744 testes passaram (612s). Falta na Fase 6: segredos Asaas/VAPID, Android de entrada, iOS em aparelho, revisão jurídica.

## 25. Asaas sandbox e webhook testados na homologação (14/10/2026)

- **Escola de teste da homologação: TST01 Escola Teste Zela Edu** (a ZL002 existe só na produção). Chave Asaas sandbox e token de webhook salvos pela tela do Portal da Gestão (Financeiro, Asaas e cobrança); a tela mostrou "validada e salva". Nada foi gravado na produção.
- **Ciclo testado (evidência do responsável: tela do app e logs do Asaas):** cobrança avulsa PIX de R$ 10,00 criada, pagamento simulado no sandbox, 2 envios do webhook com 200 para `biybjifoxnuxwkaametp`, cobrança passou a Paga. Não conferido direto no banco (CLI ligada à produção).
- **Asaas é por escola:** a chave fica no banco por escola (`set_school_gateway_secret`), não em secret global. `ASAAS_API_BASE_URL` fica sem definir (padrão sandbox). Webhook: `https://biybjifoxnuxwkaametp.supabase.co/functions/v1/payment-webhook`, com `authToken` igual ao salvo na tela.
- **VAPID mantido:** a homologação já tinha `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` e `VAPID_SUBJECT`; não foram trocados (trocar quebraria as inscrições de push web).
- **Atenção ao ambiente:** a CLI (`supabase/.temp/project-ref`) está ligada à PRODUÇÃO (`orafqopnomdrvwlvxrkz`); `--linked` escreve lá. Para abrir o app na homologação use `npx vite --mode mobile` (usa `.env.mobile.local`); `.env.homolog.local` só guarda `SUPABASE_DB_PASSWORD`. Confirme sempre o domínio no Network (`biybjifoxnuxwkaametp`).
- **Pendência de decisão:** a conta sandbox do Asaas tem um segundo webhook ("TESTDE LTDA") apontando para a produção, que também recebeu os eventos (200). Não se sabe o que a produção fez com eles; confirmar se é intencional e, se não for, desativar no painel do Asaas.
- Conta `gestao@teste.example.com` (homologação, TST01) com senha temporária definida por SQL, por decisão do responsável. Na Fase 6 restam: Android de entrada, iOS em aparelho, revisão jurídica.
