# Checklist de testes em aparelho (Fase 6, homologação)

Ambiente: `npm run build:mobile`, `assembleDebug`, `adb install -r -t`. Só homologação (escola TST01, usuários `@teste.example.com`). Marcar cada item com data e aparelho.

## Login e papéis
- [ ] Admin (Recepção): entra, vê só dados da TST01
- [ ] Família: entra, vê só os próprios filhos
- [ ] Professor: entra, vê só as turmas dele
- [ ] Financeiro: entra, não vê telas de admin
- [ ] Senha errada e e-mail com espaço no fim (trim)
- [ ] Sair e entrar com outra conta no mesmo aparelho

## Check-in/out
- [ ] Família gera solicitação (rosto, PIN, QR Code)
- [ ] Totem recebe, Monitor da Recepção mostra em tempo real
- [ ] Recepção confirma, status vira Concluído, histórico gravado
- [ ] Autorizado (não responsável) retira o aluno
- [ ] Celular do admin e do totem ao mesmo tempo (Realtime sem vazar para outra escola)

## Push
- [ ] Ativar notificações (permissão Android 13+)
- [ ] `send-test-push` com `token` chega no aparelho (app aberto, em segundo plano, fechado)
- [ ] Logout apaga o token; novo login grava de novo
- [ ] Trocar de conta no mesmo aparelho (ver risco de RLS no item 17 do plano)

## Biometria e câmera
- [ ] Cadastro facial da família
- [ ] Reconhecimento no totem em boa e em má luz
- [ ] Negar permissão de câmera: mensagem clara, app não trava

## Navegação e estabilidade
- [ ] Botão voltar entre abas, na home não fecha sem aviso indevido
- [ ] Girar a tela, teclado sobre campos, barra de status legível
- [ ] Modo avião e rede lenta: mensagens de erro, sem tela branca
- [ ] App em segundo plano por 10 min e retorno (sessão e Realtime reconectam)
- [ ] Android de entrada (pouca RAM): modelos do face-api carregam, sem fechar sozinho

## Edge Functions
- [ ] Cadastrar responsável pelo app (CORS com `https://localhost`)
- [ ] Origem estranha segue barrada
