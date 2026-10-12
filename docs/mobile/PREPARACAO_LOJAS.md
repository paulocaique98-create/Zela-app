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
confirmado Os dados são mantidos enquanto o vínculo com a escola existir. Pedidos de exclusão são atendidos pela escola ou pelo contato abaixo.

**Seus direitos**
Acesso, correção, exclusão, portabilidade, revogação de consentimento e informação sobre compartilhamento.

**Contato do encarregado (DPO)**
zela.dev26@gmail.com

**Atualizações**
Mudanças relevantes serão comunicadas no app. Última atualização: 11/10/2026.

URL pública: https://zelaedu.com.br/.

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
- Exclusão: o usuário pode pedir pela escola ou pelo contato da política. Google exige também uma URL ou instrução de exclusão de conta [CONFIRMAR se o app tem exclusão de conta própria].
- Público do app: não é voltado a crianças; usuários são adultos. Os dados de crianças são cadastrados por responsáveis e escola. Revisar o enquadramento na política de Famílias do Google.

**Apple, App Privacy** (só quando o iOS existir): mesmos tipos de dado, todos vinculados à identidade, nenhum usado para rastreamento. `NSCameraUsageDescription`: "A câmera é usada para o cadastro facial, o reconhecimento na saída do aluno e a leitura de QR Code."

## 4. Imagens e arquivos que faltam

- Ícone 512x512 PNG (escudo branco sobre #1e5563, igual ao do app).
- Imagem de destaque 1024x500 (Google Play).
- Capturas de tela de celular (mínimo 2, ideal 4 a 8): login, Ações rápidas, aviso de saída, biometria. Usar dados fictícios, nunca de escola real.
- Capturas de tablet 7" e 10" se quiser aparecer em tablets.
- Vídeo opcional.

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
