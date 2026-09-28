# Plano · Zela nos aplicativos Android e iOS

**Data:** 28/09/2026
**Base da análise:** código atual do Zela (React 19 + Vite 8 + Tailwind 4, cerca de 38.600 linhas em `src/`, 115 componentes, 5 portais: Família, Professora, Admin, Gestão e Suporte), Supabase (banco, Auth, Storage, Realtime em 11 telas, 27 Edge Functions), PWA atual (`public/manifest.json` + `public/sw.js`), notificações Web Push (VAPID), reconhecimento facial no aparelho (face-api.js + Human, modelos de 22 MB em `public/`), pagamentos Asaas (PIX, boleto, link) e hospedagem na Vercel (`sensekids.vercel.app`).

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
* **Prazo estimado:** 7 a 9 semanas até a publicação nas duas lojas, com uma escola piloto em teste fechado a partir da semana 5 (seção 8).

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

### Fase 0 · Preparação e contas (semana 1, em paralelo)

* **Apple Developer Program** (US$ 99/ano) e **Google Play Console** (US$ 25, taxa única), em nome da **empresa** (CNPJ), não de pessoa física. Motivos:
  1. O nome da empresa aparece como desenvolvedora nas lojas (mais confiança para as escolas).
  2. Contas pessoais novas no Google Play precisam de 14 dias de teste fechado com pelo menos 12 testadores antes de poder publicar.
  3. As duas lojas pedem o número **D-U-N-S** da empresa (gratuito, pode levar alguns dias).
* **Definir:** nome nas lojas ("Zela" pode estar em uso, então ter alternativas como "Zela Escola"), identificador do app (ex.: `br.com.zela.app`, que não muda nunca depois de publicado), ícone em alta resolução (1024×1024, sem transparência no iOS) e cores da marca.
* **Domínio próprio e e-mail de suporte.**
* **Política de privacidade e termos de uso** publicados numa página pública. Devem citar: dados de crianças, fotos, dados de rosto (biometria), dados financeiros, Asaas, Firebase, Sentry e retenção conforme `LGPD_RETENCAO.md`.
* **Acesso a um Mac** ou conta num serviço de build em nuvem com macOS.

### Fase 1 · Base do app (semana 1)

* Instalar o Capacitor e gerar os projetos `android/` e `ios/` (entram no git; os builds não).
* Configurar `capacitor.config` com `webDir: 'dist'`, sem `server.url` em produção.
* Criar um modo de build `vite build --mode app` com variáveis próprias: `PUBLIC_APP_URL` e desligar o registro do service worker web.
* Criar ícones e tela de abertura a partir de uma imagem só (`@capacitor/assets`).
* **Áreas seguras (notch, barra de gestos):** `viewport-fit=cover` no `index.html` e `env(safe-area-inset-*)` no Header, no menu lateral, nos modais e na futura barra inferior.
* Barra de status com a cor do tema e texto escuro ou claro conforme a tela.
* Embutir a fonte Inter (sem Google Fonts no app).
* Esconder a tela de abertura só quando a sessão já foi verificada, para não "piscar" o login.
* **Entrega:** o Zela abrindo no emulador Android e no simulador iOS, com login funcionando.

### Fase 2 · Sessão e segurança (semana 2)

* **Adaptador de armazenamento da sessão do Supabase** (`auth.storage`) usando Keychain (iOS) e Keystore (Android). Na web, continua o `localStorage`.
* **Renovação do token ao voltar do segundo plano:** `startAutoRefresh` / `stopAutoRefresh` no evento de estado do app, como recomenda o Supabase para apps móveis.
* **Revisar `zela_user` e `zela_school` no `localStorage`:** guardar só o necessário e sempre revalidar com o servidor ao abrir. O servidor continua sendo a fonte da verdade.
* **Desbloqueio com Face ID ou digital (opcional por usuário):** depois do primeiro login, o app pergunta "Usar Face ID para entrar?". A sessão fica guardada e só é liberada com a biometria do aparelho. É o recurso nativo mais visível para a revisão da Apple e o mais pedido por pais.
* **Esconder o conteúdo na tela de apps recentes nas telas sensíveis** (Financeiro, Contratos, Ficha Médica): `FLAG_SECURE` no Android, tela de proteção no iOS.
* **Sair da conta** apaga sessão, token de push do aparelho (remove a linha em `push_subscriptions`) e cache local.
* **Não fazer agora:** fixação de certificado (certificate pinning) e detecção de root/jailbreak. O custo de manutenção é alto e o ganho é pequeno para o risco atual, já que a segurança real está na RLS.

### Fase 3 · Notificações nativas (semanas 2 e 3)

* Criar o projeto Firebase, registrar os apps Android e iOS, gerar a chave APNs na Apple e enviar ao Firebase.
* Aplicar a migração de `push_subscriptions` (seção 4.3): primeiro no Supabase local, depois `db push --linked`.
* Criar `_shared/push.ts` e migrar as 8 funções. Adicionar testes de integração, como os de hoje, para: token salvo pelo dono, token de outro usuário invisível, e envio chamando o caminho certo por plataforma.
* No app: registrar o token, salvar e renovar quando mudar; criar os canais do Android; tratar o toque na notificação; contador no ícone.
* Adaptar o `PushGuidanceModal` para o app (só instruções de Ajustes).
* **Entrega:** comunicado, cobrança, chat, contrato para assinar e aviso de entrada chegando com o app fechado, nos dois sistemas.

### Fase 4 · Links, e-mails e rotas públicas (semana 3)

* `PUBLIC_APP_URL` em `Login.jsx`, `AdminUserRegistration.jsx`, `AdminMatriculas.jsx` e onde mais se monta link.
* Arquivos `.well-known` na Vercel, com a exceção no `vercel.json`.
* Tratamento de `appUrlOpen` para `/reset-password` (inclusive o formato com `#type=recovery` que o `App.jsx` já trata), `/matricula-publica` e `/cadastro`.
* Revisar os modelos de e-mail do Supabase Auth, que precisam apontar para o domínio público.
* **Entrega:** clicar no e-mail de "esqueci a senha" no celular abre o app direto na tela de nova senha.

### Fase 5 · Arquivos, impressão, pagamento e compartilhamento (semana 4)

* **`print.js`:** na web mantém o comportamento atual. No app, entrega o mesmo HTML ao diálogo de impressão do sistema (que também permite "Salvar como PDF" no iOS e no Android). Os 6 módulos `print*.js` e as telas de relatório passam a chamar só `printHtml`.
* **`files.js`:** o `downloadCSV` de `gestaoUtils.js` e o download de fotos do mural salvam o arquivo no aparelho e abrem a tela de compartilhar (WhatsApp, e-mail, Arquivos, Drive).
* **`browser.js`:**
  * boleto, link de pagamento Asaas e anexos (comunicados, despesas) abrem no navegador interno (Safari View Controller / Custom Tabs), com botão de voltar ao app;
  * links externos nunca navegam a WebView principal para fora do Zela.
* **PIX copia e cola:** plugin de área de transferência, mais retorno tátil e o aviso "Código PIX copiado".
* **Contratos:** na Família, o botão "Imprimir ou salvar em PDF" usa `printHtml`. Oferecer também "Compartilhar PDF".
* **Pagamentos e regras das lojas:** mensalidade escolar é um serviço prestado fora do app, então **não precisa** usar a compra dentro do app da Apple nem do Google. PIX, boleto e link Asaas são permitidos. Deixar isso explicado nas notas para o revisor.

### Fase 6 · Câmera e reconhecimento facial (semana 4)

* **Permissões com textos claros:**
  * iOS: `NSCameraUsageDescription` ("O Zela usa a câmera para cadastrar o rosto das pessoas autorizadas a buscar seu filho e para enviar fotos e documentos"), `NSPhotoLibraryUsageDescription` e `NSFaceIDUsageDescription`;
  * Android: `CAMERA` e a permissão de fotos do Android 13+.
* **A câmera via `getUserMedia` funciona na WebView do iOS e do Android.** Validar as 3 telas (`FaceCameraCapture`, `AdminFaceScanner`, `AdminQrScanner`) em aparelho real, especialmente o espelhamento da câmera frontal e o molde oval.
* **Modelos faciais (B7):** não embutir no instalador do app das lojas. Baixar na primeira vez que a família abrir "Autorizados", com aviso ("Preparando a câmera, cerca de 13 MB, recomendamos Wi‑Fi"), e guardar em cache no aparelho. Nas próximas vezes, abre na hora.
* **Documentos e fotos (matrícula, comunicados, despesas):** o seletor de arquivos continua funcionando. Oferecer também "Tirar foto", com compressão antes do envio (já existe `imageCompression.js`).
* **LGPD e lojas:** o cadastro de rosto já pede consentimento (`consentMessage`). Registrar a data do consentimento e declarar o uso de dados de rosto nos formulários de privacidade das lojas. A Apple exige explicar por que o dado de rosto é coletado e como é protegido.

### Fase 7 · Experiência nativa (semanas 4 e 5)

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

### Fase 8 · Desempenho, atualizações e versões (semana 5)

* **Metas:** abrir o app em menos de 2 segundos num Android intermediário comum no Brasil (linha Galaxy A, Moto G) e instalador abaixo de 30 MB.
* Conferir que `pdf`, `xlsx`, `tesseract`, `face-api` e `human` continuam fora do carregamento inicial.
* **Atualização ao vivo** (Capgo ou Ionic Appflow): permite corrigir telas (HTML, JS e CSS) sem esperar revisão da loja. É permitido pela Apple para correções e melhorias, mas não para mudar a finalidade do app. Mudanças nativas (plugins, permissões) sempre exigem versão nova na loja.
* **Versão mínima obrigatória:** tabela `app_versions` (plataforma, versão mínima, mensagem). Na abertura, se o app estiver abaixo do mínimo, mostra "Atualize o Zela para continuar", com botão para a loja. Isso é essencial quando uma mudança no banco não for compatível com versões antigas.
* **Numeração:** o app segue a versão do `package.json` (hoje 1.4.2), e o número de build aumenta a cada envio para a loja.

### Fase 9 · Conformidade com as lojas (semanas 5 e 6)

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

### Fase 10 · Qualidade e testes (contínua, foco nas semanas 5 e 6)

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

### Fase 11 · Piloto e lançamento (semanas 6 a 9)

* **Semana 6:** TestFlight (iOS) e teste interno do Play (Android) com a equipe.
* **Semanas 6 a 8:** teste fechado com **uma escola piloto** (Gestão, 2 professoras, 10 a 20 famílias). Coletar retorno por um formulário simples dentro do app.
* **Semana 8:** envio para revisão (a Apple costuma levar de 1 a 3 dias; a primeira revisão pode ter idas e vindas).
* **Semana 9:** lançamento gradual:
  * Google Play em 10%, 50% e 100% ao longo de uma semana, acompanhando o Sentry;
  * iOS com lançamento em fases (7 dias).
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

## 8. Cronograma estimado

| Semana | Fases | Entrega |
|---|---|---|
| 1 | 0 e 1 | Contas em andamento; app abrindo no Android e iOS com login |
| 2 | 2 e início da 3 | Sessão segura, biometria, migração de push no banco |
| 3 | 3 e 4 | Push nativo nos dois sistemas; links de senha, convite e matrícula abrindo o app |
| 4 | 5, 6 e início da 7 | Impressão, PDF, compartilhar, boleto, PIX, câmera e modelos faciais sob demanda |
| 5 | 7 e 8 | Botão voltar, barra inferior, sem internet, desempenho, versão mínima |
| 6 | 9 e 10 | Exclusão de conta, formulários de privacidade, Escola Demonstração, testes em aparelhos; TestFlight e teste interno |
| 7 e 8 | 10 e 11 | Piloto com uma escola; correções; envio para revisão |
| 9 | 11 | Lançamento gradual nas duas lojas |

A estimativa considera um desenvolvedor dedicado. As contas das lojas e o D-U-N-S podem atrasar o início se não forem pedidos logo na semana 1.

---

## 9. Decisões que dependem de você

| # | Decisão | Recomendação |
|---|---|---|
| D1 | Contas das lojas em nome de qual empresa (CNPJ)? | Empresa, não pessoa física |
| D2 | Nome nas lojas e identificador do app | "Zela" (ou "Zela Escola" se ocupado); `br.com.zela.app` |
| D3 | Domínio próprio antes do lançamento? | Sim (ex.: `app.zela.com.br`) |
| D4 | Como compilar o iOS: Mac próprio ou serviço em nuvem? | Codemagic ou Appflow no começo, com um Mac para depuração |
| D5 | Admin e Gestão entram no app já na v1? | Sim, sem o Autoatendimento |
| D6 | Totem ganha app próprio? | Sim, numa fase posterior, só Android |
| D7 | Projeto Supabase de homologação? | Sim; se não, "Escola Demonstração" isolada na produção |
| D8 | Liberar o app para iPad? | Sim para Gestão e Admin (tela maior ajuda); exige capturas de iPad |
| D9 | Exclusão de conta: prazo e o que é mantido | Até 30 dias, preservando só o exigido por lei, conforme `LGPD_RETENCAO.md` |

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
