# Checklist de teste no iPhone (iPhone 11 Pro Max)

Pré-requisitos: conta Apple Developer, build no TestFlight (workflow `ios-release.yml`) e CORS da homologação/produção com `capacitor://localhost`. Marcar cada item e registrar data e resultado. Nada aqui foi executado ainda.

## 1. Instalação e abertura
- [ ] App instala pelo TestFlight e abre na tela de login com ícone e splash corretos.
- [ ] Cabeçalho NÃO fica atrás do relógio/notch e a barra inferior não cobre botões (configuração `contentInset: automatic`).
- [ ] Ícones da barra de status legíveis (claros sobre o fundo escuro).

## 2. Login e dados
- [ ] Login de conta de teste funciona (testa CORS `capacitor://localhost` nas Edge Functions).
- [ ] Navegar entre abas; o gesto de voltar do iOS (deslizar da borda) não fecha o app nem sai da conta.
- [ ] `localStorage` mantém a sessão ao fechar e reabrir o app.

## 3. Câmera e reconhecimento facial (maior risco)
- [ ] Pedido de permissão da câmera aparece com o texto em português.
- [ ] Cadastro de biometria da família conclui.
- [ ] Reconhecimento no totem: modelos carregam (sem erro de "tensor should have..."), tempo de detecção aceitável, sem travar nem esquentar o aparelho.
- [ ] Leitura de QR Code com a câmera traseira.
- [ ] Negar a câmera: o app avisa e oferece PIN/QR.

## 4. Push (depende do Firebase iOS + chave APNs)
- [ ] Permissão de notificação pedida e aceita; token gravado em `push_subscriptions` com `platform='ios'`.
- [ ] `send-test-push` com `token` chega com o app em segundo plano.
- [ ] Com o app aberto aparece o aviso em tela (toast).
- [ ] App fechado: chega a notificação.
- [ ] Troca de conta no mesmo aparelho: o token passa para a conta nova, sem duplicata.
- [ ] Sem `GoogleService-Info.plist` o app não cai (só fica sem push).

## 5. Outros pontos de WebView
- [ ] Impressão e PDF (`print*.js`, `window.open`, `createObjectURL`) funcionam ou degradam bem.
- [ ] Upload de arquivo/foto pelo seletor do iOS.
- [ ] Aviso de atualização (`useAppUpdate`/`version.json`) não aparece em falso no app.
- [ ] Escola suspensa: aviso e bloqueio.

## 6. Conta de demonstração da Apple
- [ ] Definir e testar a conta fictícia que irá nas notas do revisor (preferir homologação; se for produção, escola fictícia isolada).
- [ ] Fluxo de exclusão de conta acessível dentro do app.
