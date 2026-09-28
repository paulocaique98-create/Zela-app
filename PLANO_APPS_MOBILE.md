# Plano · Zela nos aplicativos Android e iOS

**Data:** 28/09/2026 · **Atualizado em:** 28/09/2026 (2ª versão: o que já foi adiantado na web e cronograma com datas)
**Base da análise:** código atual do Zela (React 19 + Vite 8 + Tailwind 4, cerca de 38.600 linhas em `src/`, 115 componentes, 5 portais: Família, Professora, Admin, Gestão e Suporte), Supabase (banco, Auth, Storage, Realtime em 11 telas, 27 Edge Functions), PWA atual (`public/manifest.json` + `public/sw.js`), notificações Web Push (VAPID), reconhecimento facial no aparelho (face-api.js + Human, modelos de 22 MB em `public/`), pagamentos Asaas (PIX, boleto, link) e hospedagem na Vercel (`sensekids.vercel.app`).

---

## 0. Status em 28/09/2026 · o que já foi adiantado na web

Entre a 1ª versão deste plano e o início oficial (01/10/2026), os itens do plano que também tinham uso real na web foram feitos e publicados. Eles já funcionam hoje para a escola e diminuem o trabalho das fases:

| Item do plano | Fase | Situação | Publicado em |
|---|---|---|---|
| Botão voltar volta à tela anterior (lógica em `useTabHistory.js`, pronta para ligar ao botão físico do Android) | 7 (B3) | Web pronta; no app falta ligar ao `@capacitor/app` | `1b1007e` |
| Barra de navegação inferior da Família no celular | 7 | Pronto | `1b1007e` |
| Aviso "Nova versão do Zela disponível" (`version.json`) | 8 | Pronto na web; no app, falta a tabela `app_versions` | `1b1007e` |
| "Excluir minha conta" (Família) e tela da Gestão para responder | 9 | Pronto; falta a opção para a Professora (no app) | `1b1007e` |
| Consentimentos de imagem e LGPD com data carimbada pelo servidor | 6 e 9 | Pronto | `1b1007e` |
| Avisos do Zela no lugar dos 21 `alert` e 2 `confirm` (`toast.js`) | 7 (B8) | **Resolvido** | `5f90f04` |
| Endereço público fixo nos links (`publicAppUrl`) | 4 (B2) | Código pronto; falta a variável `VITE_PUBLIC_APP_URL` na Vercel e o domínio próprio | `5f90f04` |
| Faixa "Sem conexão com a internet" | 7 | Pronto (falta guardar a última versão das telas no app) | `5f90f04` |
| Cache de 7 dias dos modelos de reconhecimento facial | 6 (B7) | Pronto na web; no app falta o download sob demanda | `5f90f04` |
| Limpeza supervisionada da biometria (LGPD) | 9 | Pronto | `5f90f04` |
| Envio único de notificações (`_shared/push.ts`) já com FCM para Android e iOS; tabela `push_subscriptions` com `platform` e `token` | 3 (B1) | **Servidor pronto**; falta o Firebase e o registro do token no app | `17ceb6a` |
| Fonte Inter servida pelo próprio Zela | 1 | Pronto | `b9aab8d` |
| Tabelas largas em cartões no celular (`ResponsiveTable`) | 7 | Pronto nas telas de Gestão e Financeiro | `b9aab8d` |
| Base da política de privacidade | 0 e 9 | Com o advogado (`POLITICA_PRIVACIDADE_BASE.md`) | `1b1007e` |

**Efeito no prazo:** cerca de 1 semana de desenvolvimento a menos, principalmente nas Fases 3, 7 e 9.

---

## 1. Resumo executivo

* **Recomendação: Capacitor, não reescrever em React Native ou Flutter.** O Zela já é uma aplicação React bem componentizada e testada (343 testes). O Capacitor empacota esse mesmo código num app nativo de verdade, com acesso às APIs do aparelho (notificações nativas, câmera, arquivos, biometria, links). Reaproveitamento estimado: **cerca de 90% do código atual**. Uma reescrita custaria meses e criaria duas bases para manter.
* **O app não pode ser "só o site dentro de uma moldura".** A Apple recusa apps que são apenas um site empacotado (diretriz 4.2, funcionalidade mínima). O plano inclui recursos nativos que também melhoram o produto: notificações nativas confiáveis, entrar com Face ID ou digital, compartilhar e salvar PDFs, abrir boleto no navegador interno, navegação inferior na Família, botão voltar do Android e aviso de sem internet.
* **Foram encontrados 8 bloqueios concretos no código atual** que quebram ou degradam o app se nada for feito (seção 3.2). Os mais graves:
  1. As notificações são Web Push, que não funcionam dentro de um app nativo iOS. É preciso migrar para Firebase Cloud Messaging (Android) e APNs (iOS), e isso mexe no banco e em 8 pontos das Edge Functions.
  2. `window.location.origin` vira `capacitor://localhost` dentro do app. Isso quebra o link de redefinição de senha, o convite por e-mail e o link público de matrícula que o Admin copia.
  3. O botão voltar do Android fecharia o app, porque a navegação é por estado (`adminTab`, `familyTab`…) e não por histórico.
  4. As 11 impressões via `window.open` e os 3 downloads (planilhas, fotos do mural) não funcionam na WebView.
* **Exigências das lojas que o Zela ainda não atende:**
  * exclusão da própria conta pelo usuário dentro do app (obrigatória na Apple desde 2022);
  * política de privacidade pública;
  * formulário de privacidade de cada loja (inclui dados de rosto e de crianças);
  * `PrivacyInfo.xcprivacy` no iOS;
  * contas de demonstração para o revisor.
* **Ponto de atenção prático:** o app iOS só é compilado em macOS. Como o desenvolvimento é em Windows, é preciso um Mac ou um serviço de build em nuvem (Codemagic, GitHub Actions com máquina macOS, Ionic Appflow).
* **Prazo (2ª versão, seção 8):** seguindo o plano à risca a partir de **01/10/2026**, os apps chegam a **100% das famílias nas duas lojas em 15/01/2027**, com duas semanas de folga até a volta às aulas (início de fevereiro). São cerca de **15 semanas de calendário**:
  * 7 semanas de desenvolvimento e testes (01/10 a 19/11), já descontado o que foi adiantado na web (seção 0);
  * 3 semanas de piloto com a escola;
  * cerca de 2 semanas de revisão das lojas e lançamento gradual;
  * o restante são feriados, a pausa de fim de ano da Apple e folga.
* **Por que mais que os 7 a 9 semanas da 1ª versão:** aquela conta era só de trabalho, sem calendário. Esta inclui 5 feriados, a espera das contas das lojas, a pausa de fim de ano da Apple (23/12 a 03/01) e o recesso escolar, que empurra o lançamento para janeiro de qualquer forma.
* **Caminho crítico:** as contas das lojas em nome da empresa. O número D-U-N-S pode levar até 30 dias e precisa ser pedido em **01/10**. Se a conta Apple não estiver pronta até **13/11**, o piloto começa só no Android e o iPhone entra depois (seção 8.3).

---

## 2. Por que Capacitor (e não as alternativas)

| Opção | Reaproveitamento | Recursos nativos | Risco de recusa na loja | Custo de manutenção | Veredito |
|---|---|---|---|---|---|
| **Capacitor** (app nativo com WebView + plugins) | ~90% | Completo via plugins oficiais | Baixo, se tiver recursos nativos (seção 5) | Uma base só | **Recomendado** |
| React Native / Expo (reescrever) | ~25% (lógica e Supabase) | Completo | Baixo | Duas bases (web + app) | Não compensa agora |
| Flutter (reescrever) | ~10% | Completo | Baixo | Duas bases, outra linguagem | Não compensa |
| PWA instalável (o que já existe) | 100% | Limitado; no iPhone, push só com "Adicionar à Tela de Início" | Não entra na App Store | Uma base | Continua existindo para a web |
| TWA (PWA empacotada no Android) | 100% | Limitado | Só Android | Baixo | Não resolve o iOS |

**Boas práticas da decisão:**

* **Empacotar os arquivos do app dentro do instalador.** A alternativa seria carregar `sensekids.vercel.app` remotamente (`server.url`). A Apple recusa com frequência apps que carregam um site remoto, e o app nem abriria sem internet. Correções urgentes de interface podem ir por atualização ao vivo, na Fase 8.
* **Uma base de código, três destinos:** web (Vercel), Android e iOS. Tudo que for específico do aparelho fica isolado numa camada `src/platform/` (seção 4.2), e os componentes nunca chamam plugin direto.

---

## 3. Diagnóstico do código atual

### 3.1 O que já ajuda

* **Layout responsivo já pensado para celular:** menu hambúrguer, `SCREEN_LABELS_MOBILE` e títulos curtos no Header.
* **Divisão em partes que só carregam quando usadas:** portais e telas pesadas (`pdf`, `xlsx`, modelos faciais) já são carregados sob demanda, então o app abre rápido.
* **Autenticação toda no Supabase**, sem cookies de servidor próprio. Funciona igual no app.
* **Regras de acesso no banco (RLS) e nas Edge Functions:** o app não precisa de nenhuma regra de segurança nova no cliente.
* **Sentry e o registro de erros próprio (`client_error_logs`) já existem:** basta acrescentar o Sentry nativo.
* **Notificações já passam por um ponto central** (`notifications` + `push_subscriptions` + `push_delivery_attempts`). Só a forma de entrega muda.

### 3.2 Bloqueios encontrados (precisam de correção antes do lançamento)

| # | Onde | Problema no app | Correção (fase) |
|---|---|---|---|
| B1 | `usePushNotifications.js`, `public/sw.js`, `_shared/sendFamilyNotification.ts`, `_shared/notifyAdmins.ts`, `notify-families`, `notify-chat-message`, `notify-checkin-request`, `notify-critical-error`, `send-push-notification`, `send-test-push` | Web Push (service worker + VAPID) não existe na WebView do iOS e não é confiável na do Android | Push nativo FCM/APNs e um envio único no servidor (Fase 3) |
| B2 | `Login.jsx:188`, `AdminUserRegistration.jsx:531`, `AdminMatriculas.jsx:288`, `NotificationsDropdown.jsx` | `window.location.origin` vale `capacitor://localhost` (iOS) ou `https://localhost` (Android): links de senha, convite e matrícula pública ficariam quebrados | Constante `PUBLIC_APP_URL` e links universais (Fase 4) |
| B3 | Navegação por estado em `App.jsx` (abas em `sessionStorage`) | Botão voltar do Android fecha o app em qualquer tela | Pilha de navegação própria ligada ao botão voltar (Fase 7) |
| B4 | 11 usos de `window.open` (`printContract`, `printMitigacao`, `printHistorico`, `printHorasExtras`, `printCarteirinhaQr`, relatórios, anexos) | Não abre janela nova nem imprime na WebView | Função `printHtml` / `openDocument` por plataforma (Fase 5) |
| B5 | 3 downloads com `createObjectURL` + `a.download` (planilhas CSV, fotos do mural) | Download de arquivo não acontece dentro do app | Salvar no aparelho e abrir a tela de compartilhar (Fase 5) |
| B6 | `supabase.js` (sessão no `localStorage`), `zela_user` e `zela_school` no `localStorage` | Os dados do app podem ser apagados pelo iOS em falta de espaço, e a sessão fica em armazenamento comum | Sessão no Keychain / Keystore (Fase 2) |
| B7 | `FaceCameraCapture.jsx` (Família · Autorizados) usa os modelos faciais de 13 MB | Embutir os modelos deixa o instalador pesado; baixar a cada uso gasta o plano de dados da família | Baixar sob demanda e guardar em cache no aparelho (Fase 6) |
| B8 | 11 `alert(...)` e 3 `confirm(...)` | Aparecem como caixa do sistema com o título "localhost" | Trocar pelo `ConfirmModal` e pelos avisos que o app já tem (Fase 7) |

**Situação em 28/09/2026:**
* **Resolvido:** B8.
* **Parcialmente resolvido:**
  * B1: o servidor já envia para web e apps; falta o app registrar o token.
  * B2: o código já usa o endereço público; falta o domínio e os links universais.
  * B3: a lógica de voltar está pronta; falta ligar ao botão físico.
  * B7: o cache está pronto; falta o download sob demanda no app.
* **Pendentes (só existem no app):** B4, B5 e B6.

### 3.3 Pontos de atenção (não bloqueiam, mas melhoram muito)

* **Fontes do Google carregadas pela internet (`index.html`):** no app, embutir a fonte Inter no pacote (abre mais rápido e funciona sem internet).
* **16 campos de envio de arquivo:** funcionam na WebView, mas no iOS exigem os textos de permissão de câmera e fotos no `Info.plist`, e no Android 13+ a permissão de fotos.
* **Tesseract (leitura de imagem do cardápio) e xlsx:** são do Admin e da Gestão. Verificar que continuam carregados só sob demanda, para não pesar no app da Família.
* **`useWakeLock` e o Autoatendimento:** o totem é um uso diferente (tablet fixo na escola) e deve ficar fora do app das lojas na primeira versão (seção 4.1).
* **Cabeçalhos de segurança da Vercel (`vercel.json`):** não valem dentro do app. É preciso definir uma política de conteúdo própria no `index.html` do pacote nativo.
* **O PushGuidanceModal** ensina a "Adicionar à Tela de Início" no iPhone. No app nativo, deve mostrar só como liberar as notificações nos Ajustes.

---

## 4. Arquitetura proposta

### 4.1 Quem usa o quê

| Portal | App das lojas (v1) | Observação |
|---|---|---|
| **Família** | **Sim, foco principal** | É o maior público e o que mais ganha com push nativo, boleto/PIX e contratos |
| **Professora** | Sim | Frequência, diário, observações e relatórios no celular |
| **Gestão** | Sim | Pendências, aprovações, financeiro e contratos. Telas largas (relatórios, tabelas) com rolagem horizontal cuidada |
| **Admin** | Sim, sem o Autoatendimento | O Autoatendimento (totem) continua na web, no tablet da escola |
| **Suporte (developer)** | Não | Continua só na web; o app bloqueia esse papel com uma mensagem |
| **Autoatendimento / Totem** | **Fase futura: app "Zela Totem" só Android** | Modo quiosque (tela fixa), câmera frontal, modelos faciais embutidos, sem depender do navegador |

**Melhoria sugerida:** um app só, "Zela", que abre o portal certo pelo papel da conta, como já acontece na web. Não publicar apps separados por perfil nem por escola (white label) agora: cada app extra multiplica revisão de loja, versões e suporte.

### 4.2 Camada de plataforma (`src/platform/`)

Toda chamada específica de aparelho passa por um módulo com duas implementações: web (a de hoje) e nativa (plugins). Os componentes nunca importam plugin direto.

```
src/platform/
  index.js          isNativeApp(), platform() ('web' | 'ios' | 'android'), PUBLIC_APP_URL
  storage.js        sessão segura (Keychain/Keystore) no app; localStorage na web
  push.js           registrar token FCM/APNs no app; Web Push na web (código atual)
  files.js          saveAndShare(nome, conteúdo, tipo); downloadCSV passa a usar
  print.js          printHtml(html, título); window.open + print na web
  browser.js        openExternal(url) (boleto, link de pagamento, anexos)
  clipboard.js      copiar PIX com retorno tátil
  deepLinks.js      tratar links universais e o toque na notificação
  backButton.js     pilha de navegação ligada ao botão voltar do Android
  network.js        estado da conexão (aviso de sem internet)
  biometric.js      desbloqueio com Face ID / digital
```

**Plugins previstos** (oficiais do Capacitor, salvo indicação):
* `@capacitor/app`: ciclo de vida, botão voltar e links.
* `@capacitor/push-notifications`.
* `@capacitor/filesystem` e `@capacitor/share`.
* `@capacitor/browser`, `@capacitor/clipboard`, `@capacitor/haptics`, `@capacitor/network`.
* `@capacitor/status-bar`, `@capacitor/splash-screen`, `@capacitor/keyboard`.
* `@capacitor/preferences`.
* Um plugin de armazenamento seguro (Keychain/Keystore) e um de biometria. Escolher os mantidos pela comunidade Capacitor com lançamentos recentes.
* Um plugin de impressão nativa (ou gerar PDF e compartilhar, seção Fase 5).
* `@sentry/capacitor`.

### 4.3 Notificações nativas (desenho)

* **Banco (migração nova via `supabase migration new`):** acrescentar a `push_subscriptions` as colunas `platform` (`web`, `android`, `ios`), `token` (FCM), `app_version` e `last_seen_at`. `endpoint`, `p256dh` e `auth` passam a aceitar vazio quando for app. Índice único por `token`.
* **Servidor:** criar `supabase/functions/_shared/push.ts` com uma função `sendPush(userIds, { title, body, url, tag, category })` que:
  * envia Web Push para as inscrições `web` (código atual);
  * envia pela API HTTP v1 do FCM para `android` e `ios`, com as credenciais de uma conta de serviço guardadas no Vault ou nos secrets;
  * remove tokens inválidos, como já é feito hoje com os erros 404 e 410;
  * registra em `push_delivery_attempts`.

  As 8 funções que hoje importam `web-push` passam a chamar só `sendPush`. Isso também elimina código triplicado.
* **Canais no Android** (o usuário escolhe o que silenciar): Chat, Financeiro, Entrada e saída, Comunicados, Avisos da escola.
* **Toque na notificação:** o `url` que já existe (`/?tab=contratos`) é interpretado por `deepLinks.js` e leva direto à tela, reaproveitando o `extractTab` do `NotificationsDropdown`.
* **Contador no ícone do app (badge):** notificações não lidas, zerado ao abrir.
* **Permissão:** pedir só depois do login e de uma tela explicando o benefício. Pedir logo na abertura derruba a taxa de aceite e é mal visto pela Apple.

### 4.4 Links universais (senha, convite, matrícula)

* Publicar na Vercel `/.well-known/apple-app-site-association` (iOS) e `/.well-known/assetlinks.json` (Android). O `rewrites` atual do `vercel.json` manda tudo para `index.html`, então é preciso uma exceção para `/.well-known/` com `Content-Type: application/json`.
* **Rotas que abrem o app** quando instalado, e o site quando não: `/reset-password`, `/matricula-publica`, `/cadastro` e `/?tab=...`.
* **`PUBLIC_APP_URL`** (variável de build) substitui `window.location.origin` em todo link que sai do aparelho: e-mail de senha, convite, link de matrícula copiado pelo Admin. Com isso, os links corretos passam a ser gerados também na web.
* **Recomendação:** ter um domínio próprio (ex.: `app.zela.com.br`) antes de publicar. Os links universais ficam amarrados ao domínio, e trocar de domínio depois exige nova versão do app.

---

## 5. Fases de implementação

### Fase 0 · Preparação e contas (a partir de 01/10, em paralelo às demais)

* **Pedir no dia 01/10:** D-U-N-S, Apple Developer (empresa), Google Play Console (empresa) e o domínio. São os itens com espera externa e definem o caminho crítico (seção 8.2).

* **Apple Developer Program** (US$ 99/ano) e **Google Play Console** (US$ 25, taxa única), em nome da **empresa** (CNPJ), não de pessoa física. Motivos:
  1. O nome da empresa aparece como desenvolvedora nas lojas (mais confiança para as escolas).
  2. Contas pessoais novas no Google Play precisam de 14 dias de teste fechado com pelo menos 12 testadores antes de poder publicar.
  3. As duas lojas pedem o número **D-U-N-S** da empresa (gratuito, pode levar alguns dias).
* **Definir:** nome nas lojas ("Zela" pode estar em uso, então ter alternativas como "Zela Escola"), identificador do app (ex.: `br.com.zela.app`, que não muda nunca depois de publicado), ícone em alta resolução (1024×1024, sem transparência no iOS) e cores da marca.
* **Domínio próprio e e-mail de suporte.**
* **Política de privacidade e termos de uso** publicados numa página pública. Devem citar: dados de crianças, fotos, dados de rosto (biometria), dados financeiros, Asaas, Firebase, Sentry e retenção conforme `LGPD_RETENCAO.md`.
* **Acesso a um Mac** ou conta num serviço de build em nuvem com macOS.

### Fase 1 · Base do app (01/10 a 09/10)

* **Já adiantado:** fonte Inter embutida (`b9aab8d`).

* Instalar o Capacitor e gerar os projetos `android/` e `ios/` (entram no git; os builds não).
* Configurar `capacitor.config` com `webDir: 'dist'`, sem `server.url` em produção.
* Criar um modo de build `vite build --mode app` com variáveis próprias: `PUBLIC_APP_URL` e desligar o registro do service worker web.
* Criar ícones e tela de abertura a partir de uma imagem só (`@capacitor/assets`).
* **Áreas seguras (notch, barra de gestos):** `viewport-fit=cover` no `index.html` e `env(safe-area-inset-*)` no Header, no menu lateral, nos modais e na futura barra inferior.
* Barra de status com a cor do tema e texto escuro ou claro conforme a tela.
* Embutir a fonte Inter (sem Google Fonts no app).
* Esconder a tela de abertura só quando a sessão já foi verificada, para não "piscar" o login.
* **Entrega:** o Zela abrindo no emulador Android e no simulador iOS, com login funcionando.

### Fase 2 · Sessão e segurança (13/10 a 16/10)

* **Adaptador de armazenamento da sessão do Supabase** (`auth.storage`) usando Keychain (iOS) e Keystore (Android). Na web, continua o `localStorage`.
* **Renovação do token ao voltar do segundo plano:** `startAutoRefresh` / `stopAutoRefresh` no evento de estado do app, como recomenda o Supabase para apps móveis.
* **Revisar `zela_user` e `zela_school` no `localStorage`:** guardar só o necessário e sempre revalidar com o servidor ao abrir. O servidor continua sendo a fonte da verdade.
* **Desbloqueio com Face ID ou digital (opcional por usuário):** depois do primeiro login, o app pergunta "Usar Face ID para entrar?". A sessão fica guardada e só é liberada com a biometria do aparelho. É o recurso nativo mais visível para a revisão da Apple e o mais pedido por pais.
* **Esconder o conteúdo na tela de apps recentes nas telas sensíveis** (Financeiro, Contratos, Ficha Médica): `FLAG_SECURE` no Android, tela de proteção no iOS.
* **Sair da conta** apaga sessão, token de push do aparelho (remove a linha em `push_subscriptions`) e cache local.
* **Não fazer agora:** fixação de certificado (certificate pinning) e detecção de root/jailbreak. O custo de manutenção é alto e o ganho é pequeno para o risco atual, já que a segurança real está na RLS.

### Fase 3 · Notificações nativas (19/10 a 23/10)

* **Já adiantado:** a migração de `push_subscriptions` e o `_shared/push.ts` com as 8 funções migradas e testadas estão em produção (`17ceb6a`). Falta só a parte do app e do Firebase, por isso a fase caiu para 1 semana.

* Criar o projeto Firebase, registrar os apps Android e iOS, gerar a chave APNs na Apple e enviar ao Firebase.
* Aplicar a migração de `push_subscriptions` (seção 4.3): primeiro no Supabase local, depois `db push --linked`.
* Criar `_shared/push.ts` e migrar as 8 funções. Adicionar testes de integração, como os de hoje, para: token salvo pelo dono, token de outro usuário invisível, e envio chamando o caminho certo por plataforma.
* No app: registrar o token, salvar e renovar quando mudar; criar os canais do Android; tratar o toque na notificação; contador no ícone.
* Adaptar o `PushGuidanceModal` para o app (só instruções de Ajustes).
* **Entrega:** comunicado, cobrança, chat, contrato para assinar e aviso de entrada chegando com o app fechado, nos dois sistemas.

### Fase 4 · Links, e-mails e rotas públicas (26/10 a 28/10)

* **Já adiantado:** `publicAppUrl` nos 3 pontos que montam link (`5f90f04`).

* `PUBLIC_APP_URL` em `Login.jsx`, `AdminUserRegistration.jsx`, `AdminMatriculas.jsx` e onde mais se monta link.
* Arquivos `.well-known` na Vercel, com a exceção no `vercel.json`.
* Tratamento de `appUrlOpen` para `/reset-password` (inclusive o formato com `#type=recovery` que o `App.jsx` já trata), `/matricula-publica` e `/cadastro`.
* Revisar os modelos de e-mail do Supabase Auth, que precisam apontar para o domínio público.
* **Entrega:** clicar no e-mail de "esqueci a senha" no celular abre o app direto na tela de nova senha.

### Fase 5 · Arquivos, impressão, pagamento e compartilhamento (28/10 a 30/10 e 03/11)

* **`print.js`:** na web mantém o comportamento atual. No app, entrega o mesmo HTML ao diálogo de impressão do sistema (que também permite "Salvar como PDF" no iOS e no Android). Os 6 módulos `print*.js` e as telas de relatório passam a chamar só `printHtml`.
* **`files.js`:** o `downloadCSV` de `gestaoUtils.js` e o download de fotos do mural salvam o arquivo no aparelho e abrem a tela de compartilhar (WhatsApp, e-mail, Arquivos, Drive).
* **`browser.js`:**
  * boleto, link de pagamento Asaas e anexos (comunicados, despesas) abrem no navegador interno (Safari View Controller / Custom Tabs), com botão de voltar ao app;
  * links externos nunca navegam a WebView principal para fora do Zela.
* **PIX copia e cola:** plugin de área de transferência, mais retorno tátil e o aviso "Código PIX copiado".
* **Contratos:** na Família, o botão "Imprimir ou salvar em PDF" usa `printHtml`. Oferecer também "Compartilhar PDF".
* **Pagamentos e regras das lojas:** mensalidade escolar é um serviço prestado fora do app, então **não precisa** usar a compra dentro do app da Apple nem do Google. PIX, boleto e link Asaas são permitidos. Deixar isso explicado nas notas para o revisor.

### Fase 6 · Câmera e reconhecimento facial (04/11 a 06/11)

* **Já adiantado:** data do consentimento registrada e cache mais longo dos modelos na web (`1b1007e`, `5f90f04`).

* **Permissões com textos claros:**
  * iOS: `NSCameraUsageDescription` ("O Zela usa a câmera para cadastrar o rosto das pessoas autorizadas a buscar seu filho e para enviar fotos e documentos"), `NSPhotoLibraryUsageDescription` e `NSFaceIDUsageDescription`;
  * Android: `CAMERA` e a permissão de fotos do Android 13+.
* **A câmera via `getUserMedia` funciona na WebView do iOS e do Android.** Validar as 3 telas (`FaceCameraCapture`, `AdminFaceScanner`, `AdminQrScanner`) em aparelho real, especialmente o espelhamento da câmera frontal e o molde oval.
* **Modelos faciais (B7):** não embutir no instalador do app das lojas. Baixar na primeira vez que a família abrir "Autorizados", com aviso ("Preparando a câmera, cerca de 13 MB, recomendamos Wi‑Fi"), e guardar em cache no aparelho. Nas próximas vezes, abre na hora.
* **Documentos e fotos (matrícula, comunicados, despesas):** o seletor de arquivos continua funcionando. Oferecer também "Tirar foto", com compressão antes do envio (já existe `imageCompression.js`).
* **LGPD e lojas:** o cadastro de rosto já pede consentimento (`consentMessage`). Registrar a data do consentimento e declarar o uso de dados de rosto nos formulários de privacidade das lojas. A Apple exige explicar por que o dado de rosto é coletado e como é protegido.

### Fase 7 · Experiência nativa (04/11 a 11/11, junto com as Fases 6 e 8)

* **Já adiantado:** lógica do voltar, barra inferior da Família, troca dos `alert`/`confirm`, faixa sem conexão e tabelas em cartões (`1b1007e`, `5f90f04`, `b9aab8d`). Restam: ligar o botão físico, puxar para atualizar, haptics, teclado e guardar a última versão das telas.

* **Botão voltar do Android (B3):** `backButton.js` guarda a pilha de abas visitadas em cada portal. Voltar fecha modal, depois volta de aba, e só na tela Início pede "Toque de novo para sair".
* **Barra de navegação inferior na Família** (no celular), com 4 ou 5 itens principais: Início, Acompanhamento, Financeiro, Comunicados e Mais. O menu completo continua em "Mais". Ordenar pelos cliques, como já é feito nos atalhos da Início.
* **Puxar para atualizar** nas listas principais (Início, Acompanhamento, Comunicados, Financeiro, Pendências).
* **Retorno tátil (haptics)** em ações importantes: assinatura de contrato, PIX copiado, aprovação.
* **Trocar os 11 `alert` e 3 `confirm` (B8)** pelo `ConfirmModal` e pelos avisos das telas (`Notice`).
* **Teclado:** rolar o campo em foco para cima do teclado e fechar o teclado ao tocar fora (formulários de matrícula e cadastro são longos).
* **Sem internet:** faixa fixa "Sem conexão · mostrando os últimos dados", guardar a última versão das telas de leitura mais usadas (Início da Família, Acompanhamento, Financeiro) e bloquear botões de envio enquanto estiver sem conexão.
* **Tabelas largas** (Gestão, Relatórios, Cobranças): no celular, virar lista de cartões ou manter a rolagem horizontal com a primeira coluna fixa.
* **Tamanhos de toque** de no mínimo 44×44 pontos e contraste revisado. Suporte ao aumento de fonte do sistema (acessibilidade), testando em fonte grande.
* **Modo escuro:** fica para uma versão futura. Os tokens de cor atuais facilitam, mas exigem revisão de todas as telas.

### Fase 8 · Desempenho, atualizações e versões (09/11 a 11/11)

* **Já adiantado:** aviso de nova versão na web (`1b1007e`).

* **Metas:** abrir o app em menos de 2 segundos num Android intermediário comum no Brasil (linha Galaxy A, Moto G) e instalador abaixo de 30 MB.
* Conferir que `pdf`, `xlsx`, `tesseract`, `face-api` e `human` continuam fora do carregamento inicial.
* **Atualização ao vivo** (Capgo ou Ionic Appflow): permite corrigir telas (HTML, JS e CSS) sem esperar revisão da loja. É permitido pela Apple para correções e melhorias, mas não para mudar a finalidade do app. Mudanças nativas (plugins, permissões) sempre exigem versão nova na loja.
* **Versão mínima obrigatória:** tabela `app_versions` (plataforma, versão mínima, mensagem). Na abertura, se o app estiver abaixo do mínimo, mostra "Atualize o Zela para continuar", com botão para a loja. Isso é essencial quando uma mudança no banco não for compatível com versões antigas.
* **Numeração:** o app segue a versão do `package.json` (hoje 1.4.2), e o número de build aumenta a cada envio para a loja.

### Fase 9 · Conformidade com as lojas (11/11 a 13/11)

* **Já adiantado:** exclusão de conta da Família, limpeza de biometria e base da política de privacidade (`1b1007e`, `5f90f04`). **Prazo externo:** a política revisada pelo advogado precisa estar publicada até 13/11, porque o formulário das lojas pede o endereço dela.

* **Exclusão de conta pelo próprio usuário (obrigatória na Apple):**
  * hoje só a Gestão exclui contas;
  * criar "Excluir minha conta" em Configurações da Família e da Professora;
  * o pedido registra a solicitação, avisa a Gestão e conclui a exclusão em até 30 dias, preservando só o que a lei obriga a guardar (conforme `LGPD_RETENCAO.md`);
  * a Apple aceita esse fluxo desde que a pessoa consiga iniciar dentro do app e saiba o prazo.
* **Formulários de privacidade:** "Privacidade do app" na App Store e "Segurança dos dados" no Google Play. Declarar:
  * nome, e-mail, telefone e CPF;
  * fotos;
  * dados de rosto;
  * dados financeiros;
  * mensagens do chat;
  * identificadores do aparelho (token de push);
  * diagnóstico (Sentry).

  Informar que nada é usado para publicidade nem vendido.
* **`PrivacyInfo.xcprivacy`** (manifesto de privacidade da Apple), com os motivos de uso das APIs que exigem justificativa. Os plugins do Capacitor já trazem os deles; o do app precisa ser criado.
* **Público e classificação:** o app é para **pais, professoras e escolas**, não para crianças. **Não** marcar como "feito para crianças" (Kids Category / Designed for Families), porque isso traz regras que não se aplicam e bloqueiam recursos. Classificação etária livre.
* **Contas de demonstração para o revisor:** uma escola "Escola Demonstração" com Família, Professora e Gestão, dados fictícios, cobranças de exemplo e sem Asaas real. Enviar as credenciais nas notas da revisão. Sem isso, a recusa é quase certa, porque o app exige login.
* **Notas para o revisor:** explicar o que cada perfil faz, que o pagamento é de serviço escolar prestado fora do app, e como testar notificação e câmera.
* **Android:** nível de API alvo exigido pelo Google no momento do envio, assinatura pelo Play App Signing, e permissão de notificações no Android 13+ pedida na hora certa.
* **Textos das lojas em português**, sem hífen (padrão "·" do projeto), com capturas de tela reais de cada perfil em iPhone de tela grande e pequena, iPad (se liberar para iPad) e Android.

### Fase 10 · Qualidade e testes (contínua; foco em 16/11 a 19/11)

* **Manter a suíte atual** (`npm run build` + `npx vitest run` com Supabase local) como porta de entrada. Somar testes unitários da camada `src/platform/`, com os plugins simulados.
* **Testes de ponta a ponta no aparelho com Maestro:** fluxos em arquivos simples, roda em emulador e em serviço de nuvem. Fluxos mínimos:
  1. login;
  2. ver cobrança e copiar PIX;
  3. assinar contrato;
  4. receber notificação e abrir a tela certa;
  5. cadastrar pessoa autorizada com câmera;
  6. professora registrar frequência;
  7. Gestão aprovar cadastro.
* **Aparelhos de teste reais:** um Android de entrada (2 a 3 GB de memória), um Android intermediário Samsung, um iPhone de tela pequena (SE) e um iPhone recente. As falhas de câmera e notificação quase sempre aparecem só em aparelho real.
* **Sentry nativo** (`@sentry/capacitor`) com versão e build identificados, para separar erro do app, erro da web e travamento nativo. Manter o `client_error_logs` e marcar a plataforma em cada registro (coluna ou contexto `platform`).
* **Monitorar:** taxa de travamento (meta abaixo de 0,5% das sessões), entrega de push (`push_delivery_attempts` por plataforma) e tempo de abertura.

### Fase 11 · Piloto e lançamento (23/11/2026 a 15/01/2027)

* **16/11 a 19/11:** TestFlight (iOS) e teste interno do Play (Android) com a equipe.
* **23/11 a 11/12:** teste fechado com **uma escola piloto** (Gestão, 2 professoras, 10 a 20 famílias). Coletar retorno por um formulário simples dentro do app. Termina antes do recesso escolar de dezembro, enquanto as famílias ainda usam o Zela todos os dias.
* **14/12 a 16/12:** últimas correções e envio para revisão nas duas lojas (até 16/12, antes da pausa de fim de ano da Apple).
* **16/12 a 22/12:** revisão (a Apple costuma levar de 1 a 3 dias; a primeira revisão pode ter idas e vindas). Se houver recusa, corrigir e reenviar até 22/12.
* **04/01 a 15/01/2027:** lançamento gradual:
  * Google Play em 10%, 50% e 100%, acompanhando o Sentry;
  * iOS com lançamento em fases de 7 dias.
* **Comunicação às escolas:**
  * registrar em Atualizações (`system_updates`);
  * mostrar um aviso na versão web ("O Zela agora tem app · baixe na App Store e no Google Play") com links para as lojas;
  * no celular, detectar o sistema e mostrar só a loja certa.

---

## 6. Automação de build e publicação

* **Build iOS exige macOS.** Opções, da mais simples para a mais controlada:
  1. **Codemagic** ou **Ionic Appflow:** build e envio para as lojas em nuvem, sem ter um Mac. Melhor custo e benefício no começo.
  2. **GitHub Actions** com máquina macOS + **Fastlane:** mais controle, exige configurar certificados.
  3. **Mac próprio:** necessário de qualquer forma para depurar problemas específicos do iOS com o Xcode.
* **Esteira sugerida a cada versão:** lint, build, testes (Supabase local), build Android assinado, build iOS assinado, envio para teste interno das duas lojas, e só depois promoção para produção.
* **Segredos** (chave de assinatura Android, certificados Apple, conta de serviço do Firebase) ficam só no serviço de build e num cofre de senhas, nunca no git.
* **Ambientes:** hoje existe só produção + Supabase local. Para o app, recomenda-se **um projeto Supabase de homologação** para builds de teste e revisão das lojas, evitando contas de revisor e dados fictícios na produção. Alternativa mais barata: a "Escola Demonstração" isolada na produção, sem Asaas.

---

## 7. Boas práticas e melhorias sugeridas (resumo)

1. **Camada `src/platform/`:** nenhum componente chama plugin direto, e a web continua funcionando igual.
2. **Push centralizado em `_shared/push.ts`:** remove o código de envio repetido em 8 lugares e já prepara WhatsApp ou e-mail no futuro.
3. **Links com `PUBLIC_APP_URL` e domínio próprio:** corrige links também na web e evita refazer o app ao trocar de domínio.
4. **Sessão em armazenamento seguro + desbloqueio por biometria:** mais segurança e um recurso nativo visível.
5. **Versão mínima obrigatória (`app_versions`):** protege contra versões antigas incompatíveis com o banco.
6. **Atualização ao vivo** para correções de interface, respeitando as regras das lojas.
7. **Navegação inferior na Família** e botão voltar do Android funcionando como o usuário espera.
8. **Modelos faciais baixados sob demanda:** instalador leve e economia do plano de dados das famílias.
9. **Exclusão de conta pelo usuário:** atende à Apple e à LGPD (direito de eliminação).
10. **Escola Demonstração** permanente, que serve para revisão das lojas, vendas e treinamento.
11. **Teste em aparelho real e lançamento gradual:** problemas de câmera e push quase só aparecem em aparelho real.
12. **Autoatendimento como app separado só Android (futuro):** modo quiosque de verdade no tablet da escola, sem navegador e com câmera e modelos embutidos.

---

## 8. Cronograma (2ª versão, com datas)

### 8.1 Calendário seguindo o plano à risca

Considera um desenvolvedor dedicado, os feriados nacionais (12/10, 02/11, 20/11, 25/12 e 01/01) e o que já foi adiantado (seção 0).

| Período | Fases | Entrega | Marco |
|---|---|---|---|
| 01/10 a 09/10 | 0 e 1 | Contas e D-U-N-S pedidos no dia 01/10; domínio; Capacitor instalado; app abrindo no Android e no iOS com login | Início |
| 13/10 a 16/10 | 2 | Sessão no Keychain/Keystore, Face ID/digital, renovação do token, tela protegida nos apps recentes | |
| 19/10 a 23/10 | 3 | Firebase criado; app registrando o token; push chegando com o app fechado nos dois sistemas | **Push nativo** |
| 26/10 a 03/11 | 4 e 5 | Links universais (`.well-known`), senha e matrícula abrindo o app; impressão, PDF, compartilhar, boleto no navegador interno e PIX | |
| 04/11 a 11/11 | 6, 7 e 8 | Câmera validada em aparelho real; modelos faciais sob demanda; botão voltar físico; teclado; puxar para atualizar; versão mínima; atualização ao vivo | **App completo** |
| 11/11 a 13/11 | 9 | `PrivacyInfo.xcprivacy`, formulários de privacidade, Escola Demonstração, exclusão de conta da Professora, textos e capturas das lojas | Política publicada |
| 16/11 a 19/11 | 10 | Testes em 4 aparelhos reais e roteiros automáticos (Maestro); TestFlight e teste interno do Play | **Versão de teste** |
| 23/11 a 11/12 | 11 | Piloto de 3 semanas com uma escola; correções semanais pela atualização ao vivo | **Piloto** |
| 14/12 a 16/12 | 11 | Correções finais e envio para revisão nas duas lojas | **Envio** |
| 16/12 a 22/12 | 11 | Revisão das lojas; reenvio se houver recusa | Aprovação |
| 23/12 a 03/01 | · | Pausa de fim de ano (Apple com revisão reduzida; recesso escolar) | Folga |
| 04/01 a 15/01/2027 | 11 | Lançamento gradual até 100% nas duas lojas; aviso na versão web | **Lançamento** |
| 18/01 a 29/01/2027 | · | Folga para correções antes da volta às aulas | Margem |

**Total:** cerca de 15 semanas de calendário (01/10/2026 a 15/01/2027). São 7 de desenvolvimento, 3 de piloto, cerca de 2 de revisão e lançamento, e o restante de feriados, pausa e folga.

### 8.2 Caminho crítico (o que atrasa tudo se atrasar)

| Item | Prazo limite | Por quê |
|---|---|---|
| Pedir D-U-N-S, Apple Developer e Google Play em nome da empresa | **01/10** | O D-U-N-S pode levar até 30 dias, e a conta Apple de empresa só é aprovada depois dele |
| Mac ou serviço de build em nuvem para o iOS | 09/10 | Sem isso o app de iPhone não é gerado |
| Firebase e chave APNs | 19/10 | Começo da Fase 3 |
| Domínio próprio (D3) | 23/10 | Os links universais (Fase 4) ficam amarrados ao domínio |
| Política de privacidade aprovada pelo advogado e publicada | **13/11** | As duas lojas exigem o endereço dela no cadastro do app |
| Conta Apple aprovada | **13/11** | TestFlight do piloto (16/11) |
| Escola piloto confirmada e famílias avisadas | 20/11 | Início do piloto (23/11) |
| Envio para revisão | **16/12** | Depois disso, a pausa de fim de ano da Apple pode empurrar a aprovação para janeiro |

### 8.3 Riscos e plano B

* **Conta Apple atrasada (D-U-N-S):** o piloto começa só no Android em 23/11 e o iPhone entra no piloto quando a conta sair. Se sair depois de 11/12, o iOS é lançado 2 a 3 semanas depois do Android, ainda em janeiro.
* **Recusa na primeira revisão da Apple** (comum em apps com login e dados de crianças): a margem de 16/12 a 22/12 permite um reenvio. Com duas recusas, a aprovação vai para a primeira semana de janeiro e o lançamento termina em 22/01, ainda antes da volta às aulas.
* **Problema grave no piloto:** a atualização ao vivo corrige telas no mesmo dia; mudança nativa exige nova versão de teste (1 a 2 dias).
* **Sem um desenvolvedor dedicado:** com metade do tempo, o desenvolvimento dobra (7 para 14 semanas) e o lançamento vai para março de 2027, depois da volta às aulas. Nesse caso, a recomendação é lançar primeiro só o Android.

## 9. Decisões que dependem de você

| # | Decisão | Recomendação | Decidir até |
|---|---|---|---|
| D1 | Contas das lojas em nome de qual empresa (CNPJ)? | Empresa, não pessoa física | 01/10 |
| D2 | Nome nas lojas e identificador do app | "Zela" (ou "Zela Escola" se ocupado); `br.com.zela.app` | 01/10 |
| D3 | Domínio próprio antes do lançamento? | Sim (ex.: `app.zela.com.br`) | 23/10 |
| D4 | Como compilar o iOS: Mac próprio ou serviço em nuvem? | Codemagic ou Appflow no começo, com um Mac para depuração | 09/10 |
| D5 | Admin e Gestão entram no app já na v1? | Sim, sem o Autoatendimento | 09/10 |
| D6 | Totem ganha app próprio? | Sim, numa fase posterior, só Android | após o lançamento |
| D7 | Projeto Supabase de homologação? | Sim; se não, "Escola Demonstração" isolada na produção | 13/11 |
| D8 | Liberar o app para iPad? | Sim para Gestão e Admin (tela maior ajuda); exige capturas de iPad | 13/11 |
| D9 | Exclusão de conta: prazo e o que é mantido | Até 30 dias, preservando só o exigido por lei, conforme `LGPD_RETENCAO.md` | 13/11 |

---

## 10. Checklist final antes de enviar às lojas

* [ ] Build e suíte completa passando (`npm run build`, `npx vitest run` sem testes pulados)
* [ ] Push chegando com app fechado no Android e no iOS, abrindo a tela certa
* [ ] Link de "esqueci a senha" abrindo o app
* [ ] Impressão, PDF e compartilhamento funcionando em contratos, relatórios e planilhas
* [ ] Boleto e link de pagamento abrindo no navegador interno; PIX copiando
* [ ] Câmera e cadastro de rosto testados em aparelho real, com os textos de permissão
* [ ] Botão voltar do Android sem fechar o app por engano
* [ ] "Excluir minha conta" disponível e funcionando
* [ ] Política de privacidade publicada; formulários de privacidade das duas lojas preenchidos
* [ ] `PrivacyInfo.xcprivacy` incluído
* [ ] Contas de demonstração ativas e informadas ao revisor
* [ ] Sentry nativo recebendo eventos com versão e build
* [ ] Versão mínima configurada em `app_versions`
* [ ] Capturas de tela e textos das lojas em português, sem hífen
* [ ] Piloto concluído, sem erro grave aberto
* [ ] Registro em Atualizações (`system_updates`) no dia do lançamento
