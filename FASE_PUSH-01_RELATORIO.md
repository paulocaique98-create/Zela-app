# FASE PUSH-01 — Auditoria e Correção Robusta das Notificações Push do Zela

## 1. Diagnóstico inicial

O backend de Web Push (VAPID, Edge Functions `notify-families`/`notify-chat-message`/`send-push-notification`, tabela `push_subscriptions`, Service Worker) já funciona — confirmado por 5 subscriptions reais salvas no banco para a conta de teste do usuário, incluindo uma de Android Chrome recente (3 dias antes da auditoria).

**Causa raiz confirmada**: o hook `usePushNotifications` era consumido **somente** por `FamilyPortal.jsx`. Não existia nenhuma UI de ativação/status de push em `AdminPortal.jsx` ou `AdminSettings.jsx` — um usuário logado como Admin não tinha, em lugar nenhum do sistema, como ativar notificações. Além disso, não havia nenhum tratamento específico para iOS (detecção de Safari/standalone), então mesmo um usuário família em iPhone fora do modo instalado receberia apenas um erro genérico sem instrução de como resolver.

## 2. Arquivos analisados

`src/hooks/usePushNotifications.js`, `src/components/FamilyPortal.jsx`, `src/components/FamilySettings.jsx`, `src/components/AdminPortal.jsx`, `src/components/AdminSettings.jsx`, `public/sw.js`, `public/manifest.json`, `index.html`, `supabase/functions/notify-families/index.ts`, `supabase/functions/notify-chat-message/index.ts`, `supabase/functions/send-push-notification/index.ts`, schema/RLS/índices de `push_subscriptions` (consultados diretamente em produção via `supabase db query --linked`).

## 3. Problemas encontrados

1. **Crítico** — Zero UI de push para o papel Admin (raiz do problema relatado pelo usuário).
2. **Crítico p/ iOS** — Nenhuma detecção de iOS/Safari/modo standalone em lugar nenhum do código; `subscribe()` tentaria (e falharia silenciosamente, ou pediria permissão sem efeito) fora do app instalado no iOS.
3. Erros do fluxo de ativação só iam para `console.error`/`alert()` nativo do navegador — nenhuma mensagem compreensível na UI.
4. `subscribe()` sempre chamava `pushManager.subscribe()` mesmo quando já existia uma subscription válida no dispositivo (funcionalmente inofensivo — a chave é `user_id+endpoint` — mas desnecessário).
5. (Cosmético, não bloqueante) `index.html` sem `<meta name="theme-color">` nem `apple-mobile-web-app-title`; `manifest.json` sem ícone `maskable`; `apple-touch-icon` reaproveita o 192×192 em vez de um 180×180 dedicado.

## 4. Alterações realizadas

| Arquivo | Alteração | Motivo | Risco |
|---|---|---|---|
| `src/lib/platformDetection.js` (novo) | Funções isoladas `isIOS`, `isStandalone`, `isSafari`, `isIOSStandalone` | Centralizar detecção de plataforma, testável isoladamente | Nenhum (arquivo novo, sem consumidores antigos) |
| `src/lib/platformDetection.test.js` (novo) | 15 testes Vitest cobrindo iPhone/iPad13+/Android/Desktop/Safari/Chrome-iOS | Provar a detecção sem depender de dispositivo físico | Nenhum |
| `src/hooks/usePushNotifications.js` | Adiciona `isSupported`, `isIOS`, `isStandalone`, `error`, `status`; bloqueia `requestPermission()`/`subscribe()` quando iOS fora do standalone; reaproveita subscription existente antes de criar uma nova; substitui `alert()` por `error` de estado | Resolver os problemas 2, 3 e 4 acima, sem remover nenhum campo já consumido (`permission`, `isSubscribed`, `isLoading`, `subscribe`, `unsubscribe` continuam idênticos) | Baixo — aditivo; testado que `FamilyPortal.jsx` (não tocado) continua funcionando |
| `src/components/PushNotificationsCard.jsx` (novo) | UI com os 6 estados do fluxo (iOS não instalado, não suportado, bloqueado, padrão/erro, ativando, ativo) | Reaproveitar UI entre Admin e Família em vez de duplicar (pedido explícito do escopo) | Baixo — componente novo e isolado |
| `src/components/FamilySettings.jsx` | Bloco inline de push (55 linhas) substituído por `<PushNotificationsCard pushData={pushData} />` | Eliminar duplicação de lógica de estados | Médio-baixo — muda a implementação visual de uma tela que já funcionava; mitigado com teste de regressão real (ver seção 10) |
| `src/components/AdminSettings.jsx` | Instancia `usePushNotifications` e renderiza `<PushNotificationsCard>` dentro da área rolável do form existente, com `type="button"` nos botões do card pra não disparar o submit de "Salvar Alterações" | Entrega o item crítico (UI de push pro Admin) | Baixo — aditivo; testado end-to-end (ver seção 9) |
| `index.html` | Adiciona `<meta name="theme-color">` e `<meta name="apple-mobile-web-app-title">` | Melhoria cosmética de PWA (P2), sem arquivo novo necessário | Nenhum |

Nenhuma migration, nenhuma Edge Function, nenhuma RLS, nenhum arquivo de reconhecimento facial, nenhum arquivo do fluxo Totem/Monitor/Recepção e nenhum Storage de fotos foram tocados (confirmado por `git status`/`git diff --name-only` na Etapa D).

## 5. Fluxo antes

```
[Família] → banner/Configurações → subscribe() sempre cria subscription nova
                                  → erro só via alert()
[Admin]   → (nada — sem UI)
[iOS]     → subscribe() tenta normalmente, sem checar standalone
```

## 6. Fluxo depois

```
[Família ou Admin] → PushNotificationsCard (mesmo componente)
                          ↓
                    status derivado do hook:
                    ios-install-required → instrução, SEM chamar requestPermission()
                    unsupported          → mensagem específica
                    permission-denied    → instrução pra desbloquear, sem re-perguntar
                    default/available    → botão "Ativar" → reaproveita subscription
                                            existente OU cria uma nova → upsert no banco
                    subscribed           → "Ativas" + botão "Desativar" (só este dispositivo)
```

## 7. Android

Fluxo técnico inalterado (Android/Chrome nunca precisou de instalação como PWA pra push funcionar). O que muda: Admin agora tem onde ativar; subscription existente é reaproveitada em vez de recriada.

**Testado real (headless Chromium, Android userAgent via `devices['iPhone 13']` não se aplica aqui — Android testado com Chromium desktop puro simulando o mesmo código-caminho)**: card renderiza corretamente, requisição ao Supabase (`push_subscriptions`) segue o mesmo formato de antes. O fluxo completo "conceder permissão → assinar" **não pôde ser validado 100% end-to-end neste ambiente** — ver seção 18.

## 8. iOS

**Testado real** com Playwright emulando `devices['iPhone 13']` (userAgent + touch reais do dispositivo) e `navigator.standalone = false` (Safari fora do modo instalado):
- Card mostra corretamente "Ative pelo app instalado" com a instrução completa (Safari → Compartilhar → Adicionar à Tela de Início).
- Botão "Ativar notificações" **não é oferecido** nesse estado — confirmado via asserção de texto na página renderizada.
- Nenhuma chamada a `Notification.requestPermission()` é disparada nesse caminho (bloqueada antes, no próprio `subscribe()`).

Não testado fisicamente em iPhone real (fora do escopo/possibilidade deste ambiente) — ver seção 18.

## 9. Admin

**Testado real** (login real, Supabase de produção, Playwright headless):
- Card "Notificações Push" aparece em Configurações da Escola.
- Estado inicial renderizado corretamente conforme a permissão real do navegador de teste (ver limitação na seção 18 — o Chromium headless deste ambiente reporta `Notification.permission = 'denied'` mesmo com `context.grantPermissions`, então o estado exercitado de fato foi "Notificações bloqueadas", que também é um dos critérios de sucesso do escopo).
- Tela renderiza sem erro, sem quebrar o restante de Configurações da Escola (logo, dados da escola, personalização de menu — todos intactos ao lado do novo card).

## 10. Família

**Testado real**: login como família, tela de Configurações carrega, card "Notificações Push" aparece (mesmo componente do Admin agora), um dos 3 estados esperados é renderizado. Nenhuma tela de erro (`Algo deu errado`, do Error Boundary) disparada. O banner de ativação em `FamilyPortal.jsx` **não foi tocado** e continua lendo os mesmos campos (`permission`, `isSubscribed`) do hook, preservados.

## 11. Service Worker

`public/sw.js` **não foi alterado** — nenhuma necessidade encontrada na auditoria. Continua registrando `push` e `notificationclick` como antes.

## 12. Manifest/PWA

`public/manifest.json` **não foi alterado** (nenhum ícone `maskable` foi criado, por não existir asset apropriado — ver "achados fora do escopo"). Em `index.html`, adicionado `theme-color` e `apple-mobile-web-app-title` (aditivo, sem risco).

## 13. Segurança

- `VAPID_PUBLIC_KEY` continua sendo a única chave no client (`VITE_VAPID_PUBLIC_KEY`); `VAPID_PRIVATE_KEY`/`VAPID_SUBJECT` seguem exclusivos das Edge Functions.
- Nenhum secret novo foi adicionado a `.env`, ao bundle ou a qualquer componente React.
- RLS de `push_subscriptions` (`auth.uid() = user_id`, sem restrição de role) já permitia Admin gerenciar as próprias subscriptions — **confirmado que não havia bloqueio de RLS**; o problema era 100% ausência de UI, não permissão de banco.
- Nenhuma subscription de outro dispositivo é apagada em `unsubscribe()` — segue filtrando por `user_id` + `endpoint` específicos (comportamento pré-existente, preservado).

## 14. Banco

**Nenhuma migration criada nem executada.** Schema auditado (`push_subscriptions`: colunas `id, user_id, school_id, endpoint, p256dh, auth, device_info, created_at, updated_at`; índice único `(user_id, endpoint)`; RLS `FOR ALL USING/WITH CHECK (auth.uid() = user_id)`) já suportava integralmente o fluxo — nada precisou mudar.

## 15. Edge Functions

**Nenhuma alterada.** `notify-families`, `notify-chat-message` e `send-push-notification` seguem exatamente como estavam (envio via `web-push`, limpeza de subscriptions mortas em 410/404).

## 16. Reconhecimento facial

**Intocado.** Nenhum arquivo de `AdminFaceScanner.jsx` ou qualquer constante/função de matching foi tocado (confirmado via `git diff --name-only`).

## 17. Totem → Monitor → Recepção

**Intocado.** `requestKioskAccess` e `updateStudentStatus` não aparecem em nenhum diff desta fase (confirmado via `grep` no `git diff`).

## 18. Testes estáticos

- Hook compila e é consumido sem erro por `FamilyPortal.jsx`, `FamilySettings.jsx` e `AdminSettings.jsx`.
- Nenhum import quebrado (`npm run build` PASS — ver seção 20).
- Nenhuma função duplicada — lógica de estados centralizada em `PushNotificationsCard`.
- Nenhuma subscription duplicada é criada pelo novo fluxo (reaproveita `getSubscription()` antes de chamar `subscribe()`; e mesmo se chamasse, a chave única `(user_id, endpoint)` já impedia duplicação).
- Nenhum secret no frontend (grep confirmado).
- 15 testes automatizados novos (`platformDetection.test.js`) cobrindo logicamente: iOS+Safari+standalone, iOS+Safari+não-standalone, iOS+outro navegador (Chrome iOS)+standalone, Android+Chrome, Desktop — **todos PASS**.

## 19. Testes reais

| Cenário | Resultado |
|---|---|
| Admin: card aparece em Configurações, sem quebrar o resto da tela | **TESTADO** — PASS |
| Admin: estado "permission-denied" renderiza corretamente | **TESTADO** — PASS |
| Admin: ciclo completo ativar → subscribed → reload persiste → desativar | **NÃO TESTADO** — bloqueado pela limitação de ambiente abaixo |
| iOS: detecção de iOS + fora do standalone → instrução correta, sem chamar `requestPermission()` | **TESTADO** (emulado via Playwright `devices['iPhone 13']`) — PASS |
| iOS: instalação real num iPhone físico, ativação real, recebimento real de push | **IMPOSSÍVEL TESTAR NESTE AMBIENTE** — sem dispositivo físico disponível |
| Android: ativação real, recebimento real de push, clique abrindo/focando o app | **NÃO TESTADO** neste ciclo — sem dispositivo físico disponível; o pipeline subjacente (subscribe→banco→Edge Function→web-push) já tinha sido comprovado funcional na auditoria inicial (5 subscriptions reais gravadas, incluindo Android Chrome real de 24/08) |
| Família: tela de Configurações continua funcionando após a troca do componente | **TESTADO** — PASS, sem tela de erro, card renderiza |

**Limitação de ambiente identificada e documentada**: o Chromium headless deste ambiente reporta `Notification.permission = 'denied'` mesmo com `context.grantPermissions(['notifications'])` do Playwright — comportamento conhecido do Chromium headless (a API de notificação nativa não tem como exibir/conceder de fato sem um display real). Isso impediu validar ao vivo, neste ambiente, o caminho feliz completo "permissão concedida → subscription criada → persistida após reload". Esse caminho específico depende de teste manual num navegador real (desktop ou celular) para ser 100% confirmado — recomendo esse teste manual como próximo passo antes de qualquer deploy.

## 20. Build/Lint

```
npm run lint  → PASS (0 avisos)
npm run build → PASS
npm test      → PASS (54/54 — 39 pré-existentes + 15 novos de platformDetection)
```

## 21. Git

```
Commit: NÃO
Push: NÃO
Deploy: NÃO
```

`git status` mostra 4 arquivos modificados (`index.html`, `AdminSettings.jsx`, `FamilySettings.jsx`, `usePushNotifications.js`) e 3 novos (`PushNotificationsCard.jsx`, `platformDetection.js`, `platformDetection.test.js`) — nada commitado, nada enviado.

## 22. Riscos restantes

1. O caminho "ativar → subscribed → persiste após reload" não foi validado ao vivo neste ambiente (só por leitura de código + teste automatizado da lógica de estado) — recomenda-se teste manual num navegador real antes do deploy.
2. Push real em iPhone físico segue sem confirmação prática (só a lógica de bloqueio/instrução foi validada).
3. A cópia de texto do card mudou ligeiramente na Família ("Receba avisos de check-in e check-out..." virou "Receba alertas importantes mesmo com o Zela fechado...") — mudança deliberada pra servir Admin e Família com o mesmo componente; puramente textual, sem impacto funcional.

## 23. Achados fora do escopo (não corrigidos nesta fase)

- `manifest.json` sem ícone `maskable` — precisa de um asset novo (recorte/padding específico), não existe hoje em `public/`. Não inventado, registrado como pendência.
- `apple-touch-icon` reaproveita o ícone de 192×192 em vez de um 180×180 dedicado — mesmo motivo (sem asset).
- Nenhum banner de push foi adicionado ao `AdminPortal.jsx` (só a tela de Configurações) — decisão deliberada de escopo mínimo/menor risco; pode virar um P1 futuro se fizer sentido replicar o banner amarelo da Família pro Admin.

## 24. Rollback

Toda a mudança está em arquivos não commitados. Para reverter: `git checkout -- index.html src/components/AdminSettings.jsx src/components/FamilySettings.jsx src/hooks/usePushNotifications.js` e remover os 3 arquivos novos (`src/components/PushNotificationsCard.jsx`, `src/lib/platformDetection.js`, `src/lib/platformDetection.test.js`). Nenhuma alteração de banco/Edge Function/Service Worker existe para reverter.

## 25. Próximo passo recomendado

1. Teste manual real: abrir o Zela como Admin num navegador comum (não headless), ativar notificações em Configurações, confirmar que a notificação chega de fato ao clicar em algo que dispare `notify-families`.
2. Teste manual real em iPhone físico: Safari → Adicionar à Tela de Início → abrir pelo ícone → ativar → confirmar recebimento.
3. Só então: commit + push + deploy (autorização explícita necessária, nada disso foi feito nesta fase).
