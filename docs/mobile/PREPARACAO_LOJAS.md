# Preparação das lojas (Fase 7)

Status: rascunhos. Textos voltados ao público ficam sem hífen. Itens marcados [CONFIRMAR] dependem de dado que o código não prova.

## 1. Política de privacidade (rascunho público)

**Zela Edu, Política de Privacidade**

O Zela Edu é uma plataforma de gestão e segurança escolar. Cada escola é a controladora dos dados de seus alunos e responsáveis, e o Zela atua como operador, tratando os dados conforme as instruções da escola e a Lei Geral de Proteção de Dados (Lei 13.709/2018).

**Dados que tratamos**
- Cadastro: nome, e-mail, telefone, vínculo com a escola e com os alunos.
- Dados de alunos: nome, turma, foto, informações pedagógicas e de saída, informados pela escola ou pelos responsáveis.
- Biometria facial de responsáveis e pessoas autorizadas: foto do rosto e um código numérico gerado a partir dela, usados apenas para confirmar quem retira ou deixa o aluno.
- Registros de entrada e saída, com data, hora e quem confirmou.
- Token de notificação do aparelho, para enviar avisos.
- Dados financeiros de cobrança, quando a escola usa o módulo financeiro.

**Para que usamos**
Identificar com segurança quem entra e sai da escola, avisar os responsáveis, apoiar a rotina pedagógica e administrativa e cumprir obrigações legais.

**Biometria facial**
É dado pessoal sensível. Só é coletada com consentimento específico do próprio titular ou, no caso de menores, de um dos pais ou responsável legal. Não é usada para publicidade nem vendida. O consentimento pode ser retirado a qualquer momento, e a escola pode excluir a biometria a pedido.

**Permissões do aparelho**
- Câmera: cadastro facial, reconhecimento no totem e leitura de QR Code. Opcional.
- Notificações: avisos de entrada, saída e comunicados. Opcional.

**Com quem compartilhamos**
Supabase (hospedagem, banco de dados e autenticação), Google Firebase Cloud Messaging (entrega de notificações) e Asaas (cobrança, quando ativo). Não vendemos dados.

**Isolamento entre escolas**
Os dados de cada escola ficam separados e só são acessados por pessoas autorizadas por ela.

**Retenção e exclusão**
Os dados são mantidos enquanto o vínculo com a escola existir. Dentro do app, em Configurações, o responsável (família) pode solicitar a exclusão da conta e dos dados pessoais; a escola conclui o pedido em até 30 dias. Informações que a escola é obrigada por lei a guardar, como registros financeiros, são mantidas pelo prazo legal. Pedidos também podem ser feitos pelo contato abaixo.

**Seus direitos**
Acesso, correção, exclusão, portabilidade, revogação de consentimento e informação sobre compartilhamento.

**Contato do encarregado (DPO)**
zela.dev26@gmail.com

**Atualizações**
Mudanças relevantes serão comunicadas no app. Última atualização: 11/10/2026.

URL pública da política: https://zelaedu.com.br/privacidade.html (arquivo `public/privacidade.html`, já no ar em 13/10).
URL de suporte: https://zelaedu.com.br/suporte.html (arquivo `public/suporte.html`, criado em 13/10; só fica no ar quando a branch for mesclada na main e o Vercel publicar).

## 2. Textos da loja

- Nome: Zela Edu
- Categoria: Educação
- Descrição curta (até 80 caracteres): Segurança e gestão escolar: entrada, saída e avisos em um só app.
- Descrição longa:
  O Zela Edu conecta escola e família com segurança. Os responsáveis acompanham a entrada e a saída dos alunos, recebem avisos em tempo real, autorizam quem pode retirar a criança e acessam comunicados e relatórios da escola.
  Para a escola, o Zela organiza a recepção, a portaria e a rotina pedagógica, com confirmação por rosto, PIN ou QR Code e histórico completo de cada saída.
  Principais recursos: avisos de entrada e saída, pessoas autorizadas, reconhecimento facial opcional, comunicados, relatórios e agenda.
  O app é para famílias e equipes de escolas que já usam o Zela. O acesso depende do cadastro feito pela escola.
- Palavras chave: escola, segurança escolar, portaria, saída de alunos, comunicados, responsáveis.

## 3. Formulários de privacidade

**Google Play, Segurança de dados** (baseado no código; revisar antes de enviar)
| Tipo de dado | Coletado | Compartilhado | Finalidade | Opcional |
|---|---|---|---|---|
| Nome, e-mail, telefone | Sim | Não | Funcionalidade, conta | Não |
| Fotos (rosto) | Sim | Não | Funcionalidade, segurança | Sim (biometria é opcional) sim |
| Identificadores do aparelho (token de push) | Sim | Sim, com Google FCM | Notificações | Sim |
| Informações financeiras | Sim, se módulo ativo | Sim, com Asaas | Cobrança | Sim |
- Dados criptografados em trânsito: sim (HTTPS).
- Exclusão: a família pede dentro do app (Configurações, Solicitar exclusão da conta; `AccountDeletionSection.jsx`) e a escola conclui em até 30 dias; também vale o contato da política. Google exige uma URL ou instrução de exclusão: usar a página de suporte.
- Público do app: não é voltado a crianças; usuários são adultos. Os dados de crianças são cadastrados por responsáveis e escola. Revisar o enquadramento na política de Famílias do Google.

**Apple, App Privacy** (rascunho, baseado no código; revisar no App Store Connect):
| Categoria Apple | Coletado | Vinculado à identidade | Rastreamento | Finalidade |
|---|---|---|---|---|
| Informações de contato (nome, e-mail, telefone) | Sim | Sim | Não | Funcionalidade do app, conta |
| Fotos ou vídeos (foto do rosto) | Sim | Sim | Não | Funcionalidade do app, segurança |
| Dados biométricos (descritor facial) [declarar também em "Informações sensíveis" (a Apple lista biometria nessa categoria; conferir o nome exato no formulário)] | Sim, opcional | Sim | Não | Funcionalidade do app, segurança |
| Identificadores (token de push) | Sim | Sim | Não | Funcionalidade do app (notificações) |
| Informações financeiras (pagamento) | Sim, se módulo ativo | Sim | Não | Funcionalidade do app (cobrança via Asaas) |
- Nenhum SDK de anúncio e nenhum rastreamento entre apps (`NSUserTrackingUsageDescription` não é usado).
- Criptografia: só HTTPS padrão; `ITSAppUsesNonExemptEncryption` = false já está no `Info.plist`.
- Texto da câmera (`NSCameraUsageDescription`, já no `Info.plist`): "O Zela Edu usa a câmera para o reconhecimento facial na entrada e na saída dos alunos, para ler QR Codes e para cadastrar a foto do rosto de responsáveis autorizados."
- Classificação etária: sem conteúdo sensível para menores; app voltado a adultos (responsáveis e equipe). Revisar a categoria "Kids" da Apple: NÃO marcar como app infantil.
- Categoria: Educação (principal). Secundária opcional: Produtividade. Decisão tomada em 13/10; alterável antes do envio.
- Exclusão de conta: a Apple EXIGE exclusão de conta dentro do app quando há criação de conta. Existe `AccountDeletionSection.jsx` (usado em `FamilySettings.jsx`) e a Edge Function `delete-user`. Verificado só no código, e só existe para a FAMÍLIA; professores e equipe não têm o botão. Testar no aparelho com um usuário criado pela escola (item 13 do plano) e decidir se a Apple aceita o pedido assíncrono de 30 dias (costuma aceitar quando o app inicia a exclusão e informa o prazo).

### 3.1 Notas para o revisor da Apple (colar no App Store Connect)

O Zela Edu é um app de escolas já contratantes. O acesso depende da escola: professores e equipe têm contas criadas e removidas pela própria escola. Os responsáveis podem pedir cadastro na tela de login ("Novo usuário?") informando o código da escola, mas a conta fica pendente e só entra depois que a escola aprova. Responsáveis podem solicitar a exclusão da conta e dos dados dentro do app, em Configurações, Solicitar exclusão da conta; a escola conclui em até 30 dias. Para contas de professores e equipe, que a escola administra, a exclusão é feita pela escola. Para a revisão fornecemos uma conta de demonstração com dados fictícios (escola de teste, sem crianças reais). A biometria facial é opcional e usada só para confirmar quem retira o aluno. Se o revisor não quiser usar a câmera, o PIN e o QR Code fazem a mesma função.
- Usuário de demonstração: o build enviado à Apple aponta para a PRODUÇÃO, então o login do revisor tem de existir na produção. DECIDIDO em 13/10: Opção A, escola fictícia isolada na produção (nome "Escola Demonstração Apple"), criada pelo responsável no Portal do Dev ("Criar escola e admin"), com um usuário recepção, um família, um aluno e um autorizado fictícios, sem módulo financeiro e sem biometria obrigatória. CRIADA em 13/10 na produção (escola ZL003, plano basic): Gestão, Recepção e Família, 1 aluno e 1 autorizado fictícios, sem foto nem biometria (conferido por consulta de leitura). As senhas ficam só no cofre e no App Store Connect, nunca no Git. Falta: desligar o módulo financeiro (hoje ligado por padrão) e testar o login da Recepção e da Família no app web e no aparelho. Opção B (descartada): enviar o build da revisão apontando para a homologação, mas o plano gratuito pausa por inatividade e o revisor veria erro. [preencher usuário e senha da Recepção e da Família no App Store Connect]
- Contato: zela.dev26@gmail.com (suporte e privacidade). Trocar por um e-mail do domínio (ex.: suporte@zelaedu.com.br) quando existir; basta editar `public/privacidade.html`, `public/suporte.html` e o App Store Connect.

## 4. Imagens e arquivos que faltam

- Ícone 512x512 PNG (escudo branco sobre #1e5563, igual ao do app).
- Imagem de destaque 1024x500 (Google Play).
- Capturas de tela de celular (mínimo 2, ideal 4 a 8): login, Ações rápidas, aviso de saída, biometria. Usar dados fictícios, nunca de escola real.
- Capturas de tablet 7" e 10" se quiser aparecer em tablets.
- Vídeo opcional.

### 4.1 Capturas de tela da App Store (iOS)

Tamanhos exigidos hoje (conferir no App Store Connect, pode mudar): iPhone 6,9" (1320x2868) e 6,5" (1242x2688 ou 1284x2778). O iPhone 11 Pro Max tem tela de 6,5". Mínimo 1 e máximo 10 por tamanho. Formato PNG ou JPEG, sem transparência.
Roteiro (dados fictícios, escola de homologação): 1) login; 2) Ações rápidas; 3) aviso de saída/entrada; 4) pessoas autorizadas; 5) comunicados; 6) cadastro de biometria.
Salvar em `docs/mobile/loja/ios/` (pasta ainda vazia; as imagens saem do aparelho).

## 5. Checklist de release Android

1. Criar keystore de assinatura e guardar fora do repositório (com senha em cofre). Perder a chave trava as atualizações; usar Play App Signing.
2. `android/app/build.gradle`: hoje `versionCode 1` e `versionName "1.0"`. Subir `versionCode` a cada envio.
3. Gerar o AAB de release (`bundleRelease`) com `JAVA_HOME` no JDK 21 (`~/.jdks/jbr-21.0.11`).
4. Trocar `google-services.json` e o app Firebase para o projeto de produção (hoje só `zela-homologacao`).
5. Apontar o build mobile para o Supabase de produção e revisar o CORS da produção para a origem do app.
6. Aplicar `20261011120000_registrar_token_push_app.sql` em produção só no release, depois da análise de segurança já registrada na seção 17 do plano.
7. Definir segredos `FCM_SERVICE_ACCOUNT` e, se o financeiro for usado, Asaas e VAPID, na produção.
8. Conta Google Play: se for pessoal, exige teste fechado com 12 testadores por 14 dias antes da produção.
9. Preencher classificação de conteúdo, público alvo, política de privacidade e Segurança de dados no Play Console.

## 6. O que ainda depende de você

- CNPJ e D-U-N-S (contas empresariais), URL da política no ar, e-mail do DPO, prazo de retenção, decisão sobre exclusão de conta no app, Mac e iPhone para o iOS.
