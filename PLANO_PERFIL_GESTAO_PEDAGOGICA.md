# Plano de implementação · Perfil Gestão Pedagógica (Coordenação e Direção)

Data: 29/09/2026 · Status: **implementado e testado no ambiente local (29/09/2026); falta publicar**
Opção escolhida: **Opção 1 · perfil novo, fechado por padrão**

## 0. Como ficou a implementação

* **Banco:** migração `20260929195618_perfil_gestao_pedagogica.sql`. Em vez de
  reescrever as regras existentes com as funções `can_read_escola()` e
  `can_write_escola()` (seção 4.2), a implementação **acrescenta regras só para o
  perfil novo**, todas com o nome começando por "Gestao pedagogica". Resultado
  igual (o perfil só passa onde há regra dele) e **nenhuma regra da Gestão ou da
  Recepção muda**, então não há risco de quebrar o que já funciona. As únicas
  regras existentes alteradas são as três de leitura financeira (brecha 3.2), que
  agora usam `can_read_financeiro()`.
* **Decisões da seção 8 aplicadas (recomendações):** portaria fica só na
  Recepção; alerta de faltas liberado; histórico do aluno só com ações não
  financeiras; Recepção lê cobranças só com a permissão financeira dada pela
  Gestão (Inadimplência, Relatório Financeiro ou gerar contratos).
* **Troca de tipo de acesso:** a Gestão passa uma conta de Coordenação ou
  Diretoria Pedagógica entre Equipe e Gestão Pedagógica (Funcionários, ou o
  próprio formulário). O banco só permite essa troca, na própria escola.
* **Achados corrigidos junto:** a Gestão não lia o histórico de transferências
  nem os documentos enviados na matrícula; a tela de Correções mostrava botões de
  aprovar para quem o banco recusava; a transferência para outra escola agora
  gera pendência para a Gestão cancelar a mensalidade.
* **Sugestões da seção 9:** não implementadas. A de número 2 (só a Direção
  publica) travaria a publicação da Mitigação na escola, que hoje não tem conta
  de Direção; as outras mudam a decisão 1 (mesma visão). Ficam para decidir.
* **Testes automáticos:** `perfilGestaoPedagogica.test.js` (banco e funções do
  servidor com contas reais) e `perfisGestao.test.js` (telas). Ver seção 6.

## 1. Resumo

Coordenação e Direção passam a ter um tipo de conta próprio, **Gestão Pedagógica**,
que entra no **Portal da Gestão com o menu reduzido**. Tudo que é de competência
exclusiva da Gestão (financeiro, contratos, notas fiscais, horas extras, permissões,
configurações e LGPD) continua bloqueado **no banco de dados**, não só escondido na
tela. O perfil novo nasce sem acesso a nada e recebe acesso, área por área, só ao que
foi liberado neste plano.

Esforço estimado: **4 a 5 dias úteis** (ver seção 7). A estimativa inicial era de 2 a 3
dias; a investigação encontrou quatro pontos que aumentam o trabalho (seção 3).

## 2. Decisões já tomadas

| # | Decisão |
|---|---|
| 1 | Coordenação e Direção veem **exatamente a mesma coisa** (sugestões de diferença na seção 9, para decidir depois) |
| 2 | Podem fazer **correções de presença**, mas só as que **não geram hora extra**; as que geram continuam indo para a Gestão aprovar |
| 3 | Em cadastros podem **criar, editar e aprovar** |

## 3. Como é hoje (o que a investigação encontrou)

1. **Coordenação e Direção não são perfis.** São contas do tipo Equipe (`admin`, o mesmo
   da Recepção) com o campo `departamento` = `coordenacao` ou `diretoria_pedagogica`.
   Na ZL001 existe 1 conta de Coordenação e nenhuma de Direção.
2. **Achado de segurança (brecha existente):** a função `can_read_gestao()`, usada nas
   regras de leitura, libera **Recepção e Gestão**. Ela é usada tanto em tabelas do dia a
   dia (alunos, presença) quanto em tabelas financeiras (`financial_charges`,
   `financial_contracts`, `school_gateway_accounts`). Ou seja, **hoje a Recepção consegue
   ler cobranças e contratos pelo banco**, mesmo que a tela não mostre. Este plano corrige
   isso na Fase 1 (é o mesmo trabalho de separar o que é sensível).
3. **O chat e a Mitigação dependem do tipo Equipe.** As regras do chat por setor e a
   edição dos relatórios de Mitigação exigem `role = 'admin'`. Se a Coordenação mudar de
   tipo sem ajustar isso, ela **perde o chat do setor e a edição da Mitigação**.
4. **A operação pedagógica da Coordenação está no portal da Recepção** (Relatórios de
   Mitigação, Cardápio, Diário, Matérias, Frequência, Calendário, Mural, Comunicados). O
   Portal da Gestão foi desenhado com o Acadêmico só para consulta. O perfil novo precisa
   levar essas telas junto.
5. **Correção de presença já separa o que gera cobrança.** O servidor
   (`request_attendance_correction`) calcula sozinho se a correção aumenta a cobrança: se
   não aumenta, aplica na hora; se aumenta, fica pendente para a Gestão aprovar
   (`approve_attendance_correction`, só Gestão). A decisão 2 encaixa nesse fluxo.
6. **Permissões configuráveis são por tipo de conta** (`has_permission`, só Equipe e
   Professor). O perfil novo fica de fora delas por padrão, o que é o comportamento
   desejado (fechado).
7. **Matrícula:** `approve_matricula` roda com as permissões de quem chama; o perfil novo
   só aprova se tiver acesso às tabelas que a aprovação altera (alunos, vínculos,
   autorizados, usuários, solicitações). Previsto na Fase 1.

## 4. Desenho da solução

### 4.1 Tipo de conta novo

* Valor no banco: `gestao_pedagogica`.
* Nome na tela: **Coordenação** ou **Direção**, conforme o `departamento` que já existe
  (`coordenacao` ou `diretoria_pedagogica`). Um tipo só, dois rótulos: é o que permite
  diferenciar os dois no futuro sem novo tipo de conta.
* Quem cria: **só a Gestão** (e o Dev), em Gestão › Cadastros › Funcionários, no atalho
  "Criar acesso de login" dos cargos Coordenadora e Diretora.

### 4.2 Princípio: fechado por padrão

Quatro funções de acesso no banco, cada regra de segurança usa a que corresponde:

| Função | Quem passa | Usada em |
|---|---|---|
| `can_read_escola()` | Recepção, Gestão, Gestão Pedagógica | leitura do dia a dia (alunos, famílias, presença, acadêmico) |
| `can_write_escola()` | Gestão, Gestão Pedagógica | escrita de secretaria, cadastros, acadêmico e comunicação |
| `can_write_gestao()` (já existe) | só Gestão | tudo que é exclusivo: financeiro, contratos, NFs, horas extras, permissões, LGPD, configurações |
| `can_read_financeiro()` (nova) | Gestão, e Recepção só se tiver a permissão financeira | leitura de cobranças, contratos financeiros e conta de pagamento |

`can_read_gestao()` deixa de ser usada em tabela financeira (fecha a brecha do item 3.2)
e passa a ser um nome antigo de `can_read_escola()` sem a Gestão Pedagógica, para não
mudar nada da Recepção fora do financeiro.

**Por que isso garante o "fechado":** as 85 regras que hoje dizem "só a Gestão"
continuam dizendo exatamente isso. O perfil novo só entra onde alguém trocar,
conscientemente, a regra para `can_read_escola()` ou `can_write_escola()`. Qualquer
tabela nova (inclusive as futuras de notas fiscais, `financial_invoices`) nasce com
"só a Gestão" e, portanto, bloqueada.

### 4.3 Mapa de acesso por área

Legenda: **Sim** = acessa · **Não** = bloqueado no banco e sem item no menu ·
**Leitura** = vê, não altera.

| Área / tela | Gestão | Gestão Pedagógica | Observação |
|---|---|---|---|
| Início | Sim | Sim | sem os cartões de valores do mês e sem atalhos financeiros |
| Pendências | Sim | Sim | só áreas Cadastros, Secretaria e Presença (sem Financeiro, Contratos, LGPD) |
| Secretaria · Alunos | Sim | Sim | sem a aba Financeiro do perfil e sem "cobrança em atraso" nos motivos de atenção |
| Secretaria · Matrículas | Sim | Sim | criar, editar, aprovar, pedir ajuste, recusar |
| Secretaria · Doc. Pendentes | Sim | Sim | enviar e excluir documentos |
| Secretaria · Mudar de turma / Transferir para outra escola | Sim | Sim | transferência para outra escola gera Pendência para a Gestão cancelar o contrato |
| Contratos (todos) | Sim | **Não** | |
| Financeiro (todos, inclusive Visão Financeira e Despesas) | Sim | **Não** | |
| Notas fiscais (futuro) | Sim | **Não** | nascem fechadas pelo princípio 4.2 |
| Presença do Dia | Sim | Leitura | sem valores |
| Correções de presença | Sim | Sim, com limite | ver 4.4 |
| Horas Extras | Sim | **Não** | aprovação e relatório de hora extra são da Gestão |
| Cadastros · Usuários (famílias) | Sim | Sim | criar, editar, aprovar contas pendentes; **excluir continua só Gestão** |
| Cadastros · Novo Cadastro | Sim | Sim | famílias e professoras; nunca Equipe nem Gestão |
| Cadastros · Funcionários | Sim | **Não** | criação de acessos da equipe continua só da Gestão |
| Cadastros · Turmas | Sim | Sim | criar e renomear turmas |
| Cadastros · Fornecedores | Sim | **Não** | |
| Cadastros · Pedidos de exclusão, Limpeza de biometria, Unificar responsáveis | Sim | **Não** | LGPD e dados sensíveis |
| Acadêmico · Ano Letivo | Sim | Leitura | abrir o ano novo continua só Gestão |
| Acadêmico · Frequência, Pedagógico, Ocorrências, Calendário | Sim | Sim | |
| Operação pedagógica que hoje está na Recepção (Relatórios de Mitigação, Cardápio, Diário, Matérias, Mural) | Não tem hoje | Sim | entram no menu Acadêmico e Comunicação do perfil novo |
| Comunicação · Comunicados e Mural | Sim | Sim | enviar comunicado às famílias |
| Chat do setor | (Recepção) | Sim | mesmas regras de setor de hoje |
| Relatórios · Acadêmico | Sim | Sim | |
| Relatórios · Operacional | Sim | Sim, sem valores | conferir na Fase 0 se há valor de hora extra |
| Relatórios · Gestão e Financeiro | Sim | **Não** | trazem receita, atraso e despesas |
| Configurações (todas), Perfis e Permissões, Auditoria, Integrações | Sim | **Não** | |
| Responsável financeiro do aluno (escolher quem paga) | Sim | Leitura | é decisão de cobrança |

### 4.4 Correções de presença (decisão 2)

* O perfil novo pode **solicitar correção** e **lançar presença manual** (hoje o
  lançamento manual é só da Recepção; passa a valer também para o perfil novo).
* O servidor continua decidindo sozinho:
  * **não aumenta a cobrança** (não gera hora extra): aplica na hora;
  * **aumenta a cobrança** (gera hora extra): fica **pendente para a Gestão**.
* O perfil novo **nunca aprova** correção pendente (`approve_attendance_correction`
  continua só da Gestão). Na tela, as pendentes aparecem como "Aguardando a Gestão",
  sem botão de aprovar e **sem valores em reais**.
* Alternativa mais restrita, se preferir: bloquear já na solicitação qualquer correção
  que gere hora extra ("Essa correção gera hora extra; peça à Gestão"). A recomendação é
  manter a solicitação pendente, porque a Coordenação muitas vezes é quem sabe do
  atraso real, e a Gestão só confirma.

### 4.5 Cadastros (decisão 3)

* **Pode:** criar e editar famílias, alunos e 2º responsável; aprovar contas pendentes de
  família; aprovar, pedir ajuste e recusar matrículas, rematrículas e atualizações
  cadastrais; criar acesso de professora.
* **Não pode:** criar, editar ou excluir contas de Equipe, Gestão Pedagógica ou Gestão;
  excluir qualquer conta (é irreversível, continua com a Gestão); escolher o responsável
  financeiro (mostra quem é, sem alterar).
* **Proteção contra promoção indevida:** o gatilho que protege colunas de privilégio
  (`protect_admin_privilege_columns`) passa a cobrir o perfil novo: ele não consegue
  mudar o próprio tipo de conta, nem o de ninguém, nem o status de contas da equipe.

### 4.6 Chat, Mitigação e notificações

* **Chat:** as regras de setor que hoje exigem `admin` passam a aceitar também o perfil
  novo, com a mesma lógica (vê o setor do próprio departamento, ou todos se tiver
  "visualiza todos"). O Portal da Gestão ganha o botão de chat para esse perfil.
* **Mitigação:** a regra "Coordenação e Direção editam, publicam e excluem" passa a olhar
  o departamento também no perfil novo. A professora continua sendo quem cria.
* **Notificações:** o perfil novo recebe as de cadastro pendente, matrícula, atualização
  cadastral e correção de presença; **não** recebe as financeiras (pagamento, falha de
  cobrança, contrato) nem as de LGPD.

### 4.7 Telas com dinheiro misturado

Mesmo com o banco devolvendo vazio, a tela precisa esconder a parte financeira para não
mostrar "R$ 0,00" ou "Em dia" enganoso:

* Início da Gestão: cartões de receita do mês e atalhos financeiros.
* Pendências: áreas Financeiro, Contratos e LGPD.
* Secretaria · Alunos: motivo "cobrança em atraso" e o número de atenção que depende dele.
* Perfil do aluno: aba Financeiro e botão "Tornar responsável financeiro".
* Cadastro (Adicionar Aluno): campo "Responsável financeiro" em modo leitura.
* Correções de presença: valores de cobrança.
* Relatórios: abas Gestão e Financeiro.

Fonte única de verdade na tela: um arquivo `src/lib/perfisGestao.js` com a lista de
abas e trechos liberados por perfil, testado. O portal consulta esse arquivo para montar
o menu e para barrar link direto, atalho ou notificação que aponte para aba proibida
(volta ao Início).

## 5. Fases

| Fase | O que entrega | Esforço |
|---|---|---|
| **0 · Inventário com a Coordenação** | Lista do que a Coordenação usa hoje no portal da Recepção, conferência do Relatório Operacional, confirmação das pendências da seção 8 | 0,5 dia |
| **1 · Banco** | Tipo novo; as 4 funções de acesso; troca das regras das áreas liberadas; fechamento da leitura financeira da Recepção; chat, Mitigação, correções e cadastro estendidos; proteção contra promoção | 1,5 dia |
| **2 · Funções do servidor** | `create-admin-user` cria o perfil novo (só Gestão e Dev); `create-family-user`, `notify-families` e `update-user-email` aceitam o perfil novo; `delete-user` e todas as financeiras continuam só Gestão; notificações por tipo | 0,5 dia |
| **3 · Portal** | Rota do perfil novo para o Portal da Gestão; `perfisGestao.js`; menu filtrado; telas pedagógicas vindas da Recepção; chat; telas com dinheiro tratadas (4.7) | 1 dia |
| **4 · Cadastro e migração** | "Criar acesso" para Coordenadora e Diretora com o tipo novo; ação supervisionada "Mudar para Gestão Pedagógica" em Funcionários para migrar a Coordenação atual | 0,5 dia |
| **5 · Testes e validação** | Testes da seção 6; validação manual com a checklist da seção 10 numa conta de teste | 0,5 a 1 dia |
| **6 · Implantação** | Migrações no local, testes, produção; conta de teste validada; migração da Coordenação real com o aval da escola; registro em Atualizações | 0,5 dia |

## 6. Testes (a garantia de "100% funcional")

1. **Teste de ataque, área por área:** entra como Gestão Pedagógica e tenta **ler e
   alterar** cada área sensível: cobranças, contratos financeiros, contratos
   jurídicos e modelos, descontos, conta de pagamento, eventos de pagamento, despesas,
   fornecedores, anexos de despesas, horas extras, aprovação de correção, permissões,
   pedidos de exclusão, limpeza de biometria, unificação, configurações da escola,
   abertura do ano letivo, auditoria. **Todas precisam falhar ou vir vazias.**
2. **Teste de promoção:** o perfil novo tenta mudar o próprio tipo para Gestão, criar uma
   conta de Equipe ou Gestão, alterar status de alguém da equipe e excluir contas.
   Tudo precisa falhar.
3. **Teste de "nasce fechado":** um teste lê do banco todas as regras de segurança que
   deixam o perfil novo passar e compara com a lista aprovada neste plano. Se alguém
   liberar uma tabela nova sem atualizar a lista (de propósito ou sem querer), o teste
   quebra. Outro teste garante que nenhuma tabela financeira usa as funções do dia a dia.
4. **Teste positivo, área por área:** o perfil novo consegue fazer tudo que foi
   liberado: aprovar matrícula, cadastrar família, mudar de turma, enviar documento,
   corrigir presença que não gera hora extra (aplicada na hora) e que gera (fica
   pendente), editar Mitigação, usar o chat do setor, enviar comunicado.
5. **Brecha da Recepção:** a Recepção deixa de ler cobranças e contratos pelo banco,
   exceto com a permissão financeira dada pela Gestão.
6. **Tela:** testes de `perfisGestao.js` (menu, link direto e notificação para aba
   proibida voltam ao Início).
7. Suíte completa e build, como sempre.

## 7. Estimativa e por que subiu

A estimativa inicial (2 a 3 dias) supunha só "menu reduzido + regras". A investigação
acrescentou: a brecha de leitura financeira da Recepção (3.2), o chat e a Mitigação
presos ao tipo Equipe (3.3), a operação pedagógica que hoje mora no portal da Recepção
(3.4) e o lançamento manual de presença que só a Recepção tem. Total: **4 a 5 dias
úteis**, com testes.

## 8. Pendências de decisão (confirmar na Fase 0)

1. **Portaria:** a Coordenação usa hoje o totem, o monitor ou as carteirinhas QR? Se
   sim, esses itens continuam só na Recepção (recomendação) ou entram no perfil novo?
2. **Configurações · Acadêmico** (alerta de faltas): liberar para o perfil novo?
   Recomendação: sim, é pedagógico e não tem dinheiro.
3. **Auditoria:** o perfil novo vê o histórico do aluno (edições, documentos, mudança de
   turma) no perfil do aluno? Recomendação: sim, só ações não financeiras.
4. **Brecha da Recepção (3.2):** confirmar que a Recepção só lê cobranças com a
   permissão financeira dada pela Gestão.

## 9. Sugestões de diferença entre Coordenação e Direção (para decidir depois)

A arquitetura já permite diferenciar os dois pelo departamento, sem tipo de conta novo.
Ideias, da mais simples para a mais completa:

1. **Direção vê indicadores gerenciais sem valores:** ocupação por turma, matrículas e
   saídas no ano, frequência média, pendências por área. É o Relatório Gestão sem a
   coluna de dinheiro.
2. **Direção publica os relatórios finais:** a Coordenação revisa e a Direção aprova a
   versão que vai para a família (Semestral e Mitigação), com registro de quem aprovou.
3. **Coordenação cuida das professoras:** criar acesso de professora, definir turmas de
   cada uma, acompanhar frequência lançada e ocorrências.
4. **Direção recebe um resumo semanal** (notificação ou email) com matrículas, saídas,
   pendências e alertas de faltas.
5. **Permissões ajustáveis pela Gestão:** estender a tela Perfis e Permissões para o
   perfil novo, por departamento, para a escola ligar e desligar itens sem precisar de
   programação. Só para itens não sensíveis; os sensíveis nunca aparecem ali.

## 10. Checklist de validação manual (conta de teste)

* [ ] Menu mostra só as áreas liberadas; Financeiro, Contratos, Horas Extras,
  Configurações e LGPD não aparecem.
* [ ] Link direto para uma aba proibida volta ao Início.
* [ ] Início e Pendências sem nenhum valor em reais.
* [ ] Perfil do aluno sem aba Financeiro.
* [ ] Aprovar uma matrícula de teste e uma conta de família pendente.
* [ ] Cadastrar família, aluno e 2º responsável; mudar aluno de turma.
* [ ] Corrigir uma saída sem gerar hora extra: aplicada na hora.
* [ ] Corrigir uma saída gerando hora extra: fica "Aguardando a Gestão", sem valor.
* [ ] Editar e publicar um relatório de Mitigação.
* [ ] Conversar no chat do setor.
* [ ] Enviar um comunicado de teste.
* [ ] Na conta de Gestão, aprovar a correção pendente criada acima.
