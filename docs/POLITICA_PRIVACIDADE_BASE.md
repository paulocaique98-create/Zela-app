# Política de Privacidade do Zela · base para revisão jurídica

**Versão:** rascunho 0.1 · 28/09/2026
**Situação:** NÃO PUBLICAR antes da revisão e aprovação do advogado.
**Como usar este documento:** a Parte A traz as questões que o advogado precisa decidir. A Parte B é o texto da política, escrito a partir do que o sistema realmente faz hoje. Trechos entre colchetes `[ ]` precisam ser preenchidos ou decididos.

---

## Parte A · Notas para o advogado

### A.1 Contexto do produto

O Zela é um sistema de gestão escolar (SaaS) contratado por escolas de educação infantil e ensino fundamental. Cada escola tem os seus usuários:
* Gestão;
* equipe administrativa;
* professoras;
* responsáveis pelos alunos (famílias).

**As crianças não têm conta.** Os dados delas são cadastrados pela escola e pelos responsáveis. Hoje o sistema funciona na web. Aplicativos para Android e iOS estão previstos para janeiro de 2027, e as lojas exigem a política publicada e um formulário de privacidade coerente com ela.

### A.2 Questões para decisão

| # | Questão | Contexto técnico | Sugestão inicial (a validar) |
|---|---|---|---|
| Q1 | **Papéis na LGPD:** quem é controlador e quem é operador? | A escola decide quais dados coleta e para quê. O Zela armazena e trata por conta da escola. | Escola = controladora dos dados de alunos, famílias e equipe; Zela = operador. O Zela é controlador só dos dados que usa para a própria operação (segurança, cobrança do serviço à escola, registros de erro). Formalizar em contrato de tratamento de dados (DPA) com cada escola. |
| Q2 | **Transferência internacional** | O banco de dados de produção fica no Canadá (Supabase, região `ca-central-1`). Há também serviços nos EUA: Vercel (hospedagem), Sentry (erros), Resend (e-mail) e Google (processamento de cardápio e calendário). | Definir a base do art. 33 (ex.: cláusulas contratuais padrão). Avaliar migrar o banco para a região de São Paulo (`sa-east-1`) antes dos apps: tecnicamente possível, com uma janela de manutenção. |
| Q3 | **Biometria de terceiros adultos** | A família cadastra a foto e o rosto de **outras pessoas autorizadas a buscar a criança** (avós, motoristas, babás) e dá o consentimento **em nome delas** na tela. | Risco relevante: consentimento para dado sensível (art. 11) deve ser do próprio titular. Avaliar coleta do consentimento pela própria pessoa autorizada (ex.: link ou assinatura na escola) ou outra base legal. |
| Q4 | **Dados de crianças** (art. 14) | Nome, nascimento, turma, horários, ficha médica, diário (alimentação, sono, evacuação), registros pedagógicos, fotos no mural, foto e rosto no cadastro, entrada e saída. | Confirmar a base (consentimento específico de um dos pais ou execução do contrato educacional + melhor interesse) e como registrar o consentimento na matrícula. |
| Q5 | **ECA Digital** (Lei 15.211/2025 e Decreto 12.880/2026) | Fiscalização prevista a partir de janeiro de 2027. O app é usado por adultos, mas trata dados de crianças. | Avaliar quais obrigações se aplicam a um app escolar sem contas de crianças (verificação de idade, classificação indicativa, deveres de proteção). |
| Q6 | **Prazos de retenção** | Existe uma proposta técnica em `LGPD_RETENCAO.md`, ainda não validada: logs 90 dias; documentos de matrícula recusada 180 dias; dados do aluno enquanto houver vínculo. | Definir prazos por categoria, inclusive o que a escola deve guardar por obrigação legal (registros escolares, financeiros, fiscais). |
| Q7 | **Exclusão de conta** | Desde 28/09/2026, o usuário pode pedir a exclusão em Configurações. A Gestão da escola conclui ou recusa em até 30 dias, justificando. | Validar o prazo de 30 dias, os motivos aceitáveis de recusa e o que é mantido após a exclusão. |
| Q8 | **Uso de imagem** | Existem dois consentimentos: "uso de imagem" nas Configurações da família e `autorizacao_imagem` por aluno na matrícula (fotos no mural, que só as famílias da escola veem). | Unificar ou distinguir claramente os dois, e definir se a autorização é por aluno. |
| Q9 | **Assinatura eletrônica de contratos** | Assinatura eletrônica simples pelo app. Ficam registrados nome digitado, data e hora, IP, navegador e uma "impressão digital" (hash SHA 256) do texto lido. | Confirmar a suficiência para contratos de prestação de serviços educacionais (Lei 14.063/2020, art. 4º, I). |
| Q10 | **Encarregado (DPO)** | Não há encarregado nomeado. | Nomear o encarregado do Zela e orientar cada escola a nomear o seu. |

---

## Parte B · Texto da Política de Privacidade (rascunho)

### 1. Quem somos

O Zela é uma plataforma de gestão escolar desenvolvida por **[RAZÃO SOCIAL]**, CNPJ **[CNPJ]**, com sede em **[ENDEREÇO]** ("Zela", "nós"). O Zela é usado por escolas ("Escola") para se comunicar com as famílias, organizar a rotina dos alunos, controlar a entrada e a saída e cuidar da parte administrativa e financeira.

Esta política explica quais dados pessoais são tratados no Zela, para quê, com quem são compartilhados, por quanto tempo são guardados e como você exerce os seus direitos, conforme a Lei Geral de Proteção de Dados (Lei 13.709/2018, "LGPD").

### 2. Quem decide sobre os seus dados

A **Escola** em que o aluno está matriculado é a **controladora** dos dados de alunos, responsáveis e equipe: é ela que decide quais informações coleta e como as usa. O **Zela** atua como **operador**, tratando os dados por conta e conforme as instruções da Escola. [Validar Q1]

Para dados que o Zela usa na própria operação da plataforma (segurança, registros de erro e prevenção de fraude), o Zela é controlador.

### 3. Quais dados tratamos

**3.1 Dos responsáveis e da equipe da Escola**
* **Cadastro:** nome, e-mail, telefone, CPF ou outro documento, profissão, estado civil, endereço e grau de parentesco com o aluno.
* **Acesso:** e-mail de login e senha (guardada de forma cifrada; o Zela não tem acesso a ela), registros de acesso e das ações feitas no sistema (auditoria).
* **Comunicação:** mensagens do chat com a Escola e leitura de comunicados.
* **Financeiro** (só do responsável financeiro): cobranças, valores, vencimentos, pagamentos e forma de pagamento.
* **Contratos:** nome digitado na assinatura, data e hora, endereço IP, navegador e a impressão digital do texto assinado.
* **Aparelho:** identificador para envio de notificações e tipo de aparelho.

**3.2 Dos alunos** (informados pela Escola e pelos responsáveis)
* Nome, data e cidade de nascimento, turma, turno e horários contratados.
* Registros de entrada e saída da escola e de presença em aula.
* **Ficha médica** (dado sensível de saúde): restrições, alergias, medicamentos e contatos de emergência.
* Diário da rotina: alimentação, sono, higiene e observações.
* Registros e relatórios pedagógicos.
* Documentos de matrícula (certidão de nascimento, cartão de vacina, comprovante de residência).
* Fotos publicadas pela Escola no mural, somente com autorização de uso de imagem.

**3.3 Das pessoas autorizadas a buscar o aluno**
* Nome, parentesco e ordem de contato de emergência.
* **Foto e dados biométricos faciais** (dado sensível), usados exclusivamente para identificar a pessoa no totem de entrada e saída da Escola. [Validar Q3]

**3.4 Dados técnicos**
* Registros de erro e de funcionamento (tela em que ocorreu, navegador, data e hora), para corrigir falhas e manter a segurança.

### 4. Para que usamos os dados e com qual base legal

| Finalidade | Dados | Base legal (LGPD) |
|---|---|---|
| Prestar o serviço educacional e a comunicação escola e família | Cadastro, aluno, comunicação | Execução de contrato (art. 7º, V) e legítimo interesse (art. 7º, IX) [validar] |
| Controlar entrada e saída com segurança | Registros de entrada e saída, pessoas autorizadas | Execução de contrato; proteção da vida e da incolumidade física (art. 7º, VII) [validar] |
| Reconhecimento facial no totem | Foto e biometria facial | Consentimento específico e destacado (art. 11, I) [validar Q3] |
| Cuidar da saúde do aluno na escola | Ficha médica | Tutela da saúde e proteção da vida (art. 11, II, "e" e "f") [validar] |
| Cobrar mensalidades e serviços | Financeiro, CPF do responsável financeiro | Execução de contrato (art. 7º, V) |
| Assinatura eletrônica de contratos | Dados da assinatura | Execução de contrato e exercício regular de direitos (art. 7º, VI) |
| Tratamento de dados de crianças | Dados do aluno | Melhor interesse da criança (art. 14) com consentimento de um dos pais ou responsável [validar Q4] |
| Segurança, auditoria e correção de erros | Registros técnicos e de acesso | Legítimo interesse (art. 7º, IX) e cumprimento de obrigação legal |
| Enviar avisos e notificações | Contato e identificador do aparelho | Execução de contrato; você pode desativar as notificações no aparelho |

**O Zela não vende dados pessoais, não usa dados para publicidade e não traça perfis de comportamento para fins comerciais.**

### 5. Com quem compartilhamos

Os dados são compartilhados somente com a Escola do aluno e com fornecedores necessários para o funcionamento do serviço, que tratam os dados por conta do Zela e sob contrato:

| Fornecedor | Para quê | Onde |
|---|---|---|
| Supabase | Banco de dados, autenticação e armazenamento de arquivos | Canadá [validar Q2] |
| Vercel | Hospedagem do site do Zela | Estados Unidos |
| Asaas | Emissão de cobranças (PIX, boleto e cartão) | Brasil |
| Sentry | Monitoramento de erros técnicos | Estados Unidos |
| Resend | Envio de e-mails do sistema | Estados Unidos |
| Google (Gemini) | Leitura automática de cardápios e calendários enviados pela Escola (não se destina a dados pessoais) | Estados Unidos |
| Serviços de notificação do navegador e do celular (Google, Apple e similares) | Entrega de notificações | Estados Unidos |

Os dados também podem ser compartilhados quando a lei exigir, ou por ordem de autoridade competente.

### 6. Transferência internacional

Parte dos fornecedores armazena ou processa dados fora do Brasil (item 5). Essas transferências seguem o art. 33 da LGPD, com **[mecanismo a definir: cláusulas contratuais padrão / outro]**. [Validar Q2]

### 7. Por quanto tempo guardamos

Os dados são mantidos enquanto houver vínculo do usuário ou do aluno com a Escola e, depois disso, pelo tempo necessário para cumprir obrigações legais ou exercer direitos. [Tabela de prazos por categoria a definir · Q6]

Registros técnicos de erro são apagados em até **[90 dias]**. A biometria facial de uma pessoa autorizada é apagada quando a família remove a foto ou a pessoa autorizada. Quando a família deixa de ter aluno ativo na Escola (transferência ou desligamento), a biometria aparece para a Gestão da Escola em uma lista de limpeza e é apagada após a confirmação dela, com registro na auditoria. **[Nota técnica: a limpeza de biometria existe desde 28/09/2026, de forma supervisionada (não automática), conforme LGPD_RETENCAO.md. A limpeza dos registros de erro após 90 dias ainda não existe. Definir com o advogado se a limpeza da biometria deve ter um prazo máximo (ex.: 90 dias após a saída).]**

### 8. Segurança

Adotamos medidas técnicas e administrativas para proteger os dados:
* conexão cifrada;
* senhas cifradas;
* acesso restrito por perfil e por escola, verificado no próprio banco de dados (um usuário de uma escola não acessa dados de outra);
* registro de auditoria das ações sensíveis;
* exigência de troca de senha;
* monitoramento de erros.

Nenhum sistema é totalmente imune a incidentes. Em caso de incidente com risco relevante, a Escola, os titulares e a ANPD serão comunicados conforme a lei.

### 9. Seus direitos

Você pode, a qualquer momento:
* confirmar se tratamos seus dados e acessá-los;
* corrigir dados incompletos ou desatualizados;
* pedir anonimização, bloqueio ou eliminação de dados desnecessários;
* pedir a portabilidade;
* saber com quem os dados foram compartilhados;
* revogar o consentimento (por exemplo, remover a biometria de uma pessoa autorizada ou a autorização de uso de imagem);
* pedir a **exclusão da sua conta**, diretamente no Zela em **Configurações · Excluir minha conta**. A Escola conclui o pedido em até **[30 dias]** e mantém apenas o que a lei obriga a guardar. [Validar Q7]

Pedidos sobre os dados de alunos devem ser feitos primeiro à Escola, que é a controladora. Você também pode falar com o nosso encarregado (item 11) ou com a Autoridade Nacional de Proteção de Dados (ANPD).

### 10. Crianças

As crianças não têm conta no Zela. Os dados delas são tratados no melhor interesse da criança, informados pela Escola e pelos responsáveis, e usados somente para as finalidades escolares descritas acima. [Validar Q4 e Q5]

### 11. Contato e encarregado

Encarregado pelo tratamento de dados do Zela: **[NOME]** · **[E-MAIL]**
Para assuntos da Escola, procure a secretaria ou o encarregado da sua Escola.

### 12. Armazenamento no aparelho

O Zela guarda no seu navegador ou aparelho apenas o necessário para funcionar: a sessão de login, a última tela aberta e preferências de exibição. O Zela não usa cookies de publicidade nem ferramentas de rastreamento para anúncios.

### 13. Alterações desta política

Esta política pode ser atualizada. Mudanças relevantes serão avisadas no próprio Zela antes de entrarem em vigor. Data da última atualização: **[DATA]**.
