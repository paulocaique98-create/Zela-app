# Plano · Portal da Gestão (Administrativo e Financeiro)

**Data:** 27/09/2026
**Base da análise:** código atual do Zela (92 componentes, 26 Edge Functions, linha de base do banco com 60 tabelas e 142 policies), portais Admin, Gestão, Professor, Família e Suporte, planos existentes (`PLANO_NFSE_ASAAS.md`, `Proximas_Atualizações.md`) e a hierarquia de contas decidida em 27/09/2026.

---

## 1. Resumo executivo

* **O que já existe e pode ser reaproveitado já cobre cerca de 45% do menu proposto:** Alunos, Matrículas e Rematrículas, Documentos (por aluno), Contratos financeiros, Cobranças, Correções de Presença, Horas Extras, Usuários, Funcionários, Turmas, Calendário, Comunicados, Mural, Auditoria e as Configurações da escola.
* **Cerca de 30% é construção nova de verdade:** Despesas, Fornecedores, Conciliação, Notas Fiscais, Modelos de contrato, Assinaturas, Aditivos, Ano Letivo, Perfis e Permissões, e os painéis (Visão Financeira, Pendências, Relatórios).
* **Cerca de 25% dos submenus propostos é redundante** com outro submenu do próprio menu ou com uma aba que já existe. Isso está detalhado na seção 3 com a recomendação de onde cada um deve ficar.
* **Três lacunas de arquitetura precisam ser resolvidas antes de o portal virar um ERP** (seção 5): o sistema não tem o conceito de **ano letivo**, os **contratos financeiros não têm versão** (aditivos) e as **permissões são fixas por papel**.

---

## 2. Estado atual (27/09/2026)

### 2.1 Portal da Gestão hoje

| Menu | Tela | Situação |
|---|---|---|
| Início | `GestaoInicio.jsx` | Cartões de acesso rápido, com badges de pendências |
| Secretaria · Alunos | `GestaoAlunos.jsx` + `GestaoAlunoPerfil.jsx` | Completo: perfil, edição, transferência externa, documentos, histórico |
| Secretaria · Matrículas | `AdminMatriculas.jsx` (reaproveitado) | Completo: matrícula, rematrícula, atualização cadastral, "solicitar alteração" |
| Cadastros · Usuários | `AdminUserManagement.jsx` (reaproveitado) | **Novo hoje:** fila de aprovação de cadastros pendentes |
| Cadastros · Novo Cadastro | `AdminUserRegistration.jsx` (reaproveitado) | **Novo hoje:** Gestão cria admin, professor e responsável |
| Cadastros · Funcionários | `AdminFuncionarios.jsx` (reaproveitado) | **Novo hoje:** cria acesso de admins, aprova professores |
| Cadastros · Turmas | `TurmasSection` (de `AdminSettings.jsx`) | **Novo hoje** |
| Financeiro | `AdminFinanceiro.jsx` (reaproveitado) | Contratos, Cobranças e Configuração do gateway (Asaas) |
| Horas Extras | `AdminRelatorioHorasExtras.jsx` | Completo |
| Correções de Presença | `AdminAttendanceCorrections.jsx` | Completo, com o cálculo de cobrança no servidor |
| Configurações | `AdminSettings.jsx` (reaproveitado) | **Novo hoje:** dados da escola, turmas, imagem de login, cobrança de hora extra, faltas |

### 2.2 Hierarquia de contas (decisão de 27/09/2026)

| Conta | Quem cria | Observação |
|---|---|---|
| Gestão | Só o suporte, na adesão da escola | Topo da escola; assume todos os antigos poderes do "admin principal" |
| Admin (Recepção, Coordenação, Direção) | Só a Gestão | O admin edita cadastros, mas não aprova nem exclui contas |
| Professor e Responsável | Admin ou Gestão | Criado pelo admin, nasce **pendente** até a Gestão aprovar |

Situação da implementação:
* **Fase 1 (servidor):** publicada e no git.
* **Fases 2 e 3 e telas da Gestão:** prontas e testadas no ambiente local (326 testes). Aguardam só a publicação conjunta de banco, funções e telas (seção 7).

---

## 3. Análise do menu proposto, item a item

Legenda: ✅ existe e só precisa ser ligado · 🟡 existe parcialmente · 🆕 construção nova · ⚠️ redundante (recomendação ao lado)

### 🏠 Início
* 🟡 Hoje são só atalhos. **Recomendação:** virar um painel com números do dia: cadastros pendentes, matrículas pendentes, correções pendentes, cobranças vencidas e recebido no mês. Os atalhos atuais continuam abaixo.

### 📂 Secretaria
* **Alunos** ✅ completo.
* **Matrículas + Rematrículas** ✅ já é uma tela só, com o tipo de cada solicitação. Juntar as duas no nome está certo.
* **Documentos** ⚠️ Os documentos já ficam **dentro do perfil de cada aluno** (aba Documentos). Uma tela global só faz sentido como "documentos faltando por aluno", ou seja, um checklist de RG, certidão e cartão de vacina pendentes. **Recomendação:** trocar por "Documentos pendentes", um relatório que abre o perfil do aluno, e não por um segundo lugar para enviar arquivos.

### 📝 Contratos
* **Contratos** ⚠️ O que existe hoje (`financial_contracts`) é o **contrato de cobrança** (assinatura mensal no Asaas), não o documento jurídico. Ter "Contratos" aqui e dentro do Financeiro confunde. **Recomendação:** este grupo cuida do **documento** (modelo, geração, assinatura, aditivo), e o contrato de cobrança fica no Financeiro, com um vínculo entre os dois.
* **Modelos** 🆕 Modelo de contrato com campos automáticos (aluno, responsável financeiro, valor, período, turno).
* **Assinaturas** 🆕 Hoje só existe o consentimento biométrico. Assinatura com validade jurídica exige um provedor (Clicksign, ZapSign, D4Sign ou gov.br), com evidências de IP, horário e hash, para ter o valor de assinatura eletrônica avançada (Lei 14.063/2020).
* **Aditivos** 🆕 Depende de versionar o contrato (lacuna 5.2): mudança de turno, horas, valor ou desconto no meio do ano.

### 💰 Financeiro
* **Visão Financeira** 🆕 Painel: previsto × recebido no mês, inadimplência, próximos vencimentos e descontos concedidos. Os dados já existem (`financial_charges`, `financial_billing_discounts`).
* **Cobranças** ✅ aba atual do `AdminFinanceiro.jsx`.
* **Inadimplência** ⚠️ É a mesma lista de Cobranças com o filtro "vencidas". **Recomendação:** manter como submenu só se abrir Cobranças já filtrada e com as ações de cobrança (lembrete, renegociação); não criar uma segunda lista.
* **Recebimentos** ⚠️ Também é Cobranças filtrada ("pagas"). **Recomendação:** juntar com Conciliação (item abaixo), que é onde o recebimento é conferido.
* **Despesas** 🆕 Não existe nada (contas a pagar). Depende de **Fornecedores**.
* **Conciliação** 🆕 Pelo Asaas, a baixa já é automática e agora confirmada direto com o Asaas. Conciliação manual só é necessária para o que entra por fora (dinheiro, PIX direto na conta da escola) e para conferir o extrato bancário. **Recomendação:** começar pela "baixa manual" com comprovante e registro em auditoria; importação de extrato (OFX) depois.
* **Notas Fiscais** 🆕 Já existe um plano detalhado (`PLANO_NFSE_ASAAS.md`) esperando decisões de negócio sobre a periodicidade da nota. Emitir pela conta Asaas da escola é o caminho.
* **Relatórios** ⚠️ Duplica "Relatórios · Financeiro". **Recomendação:** um lugar só (o grupo Relatórios).

### ⏱️ Presença e Horas
* **Correções de Presença** ✅
* **Horas Extras** ✅ (já é um relatório)
* **Relatórios** ⚠️ Duplica "Relatórios · Operacional" e o próprio Horas Extras. **Recomendação:** remover daqui.
* Sugestão de item novo: **Presença do Dia (consulta)**, reaproveitando `AdminDailyPresence.jsx` em modo leitura, para a Gestão acompanhar sem operar o check-in, que continua exclusivo do autoatendimento.

### 👥 Cadastros
* **Usuários** ✅ (ligado hoje)
* **Funcionários** ✅ (ligado hoje)
* **Responsáveis** ⚠️ A tela "Usuários" (`AdminUserManagement.jsx`) **já é** a lista de responsáveis, agrupados por aluno. **Recomendação:** remover "Responsáveis" ou renomear "Usuários" para "Responsáveis" e deixar professores e admins em Funcionários, que já mostra os acessos da equipe.
* **Turmas** ✅ (ligado hoje) ⚠️ aparece de novo em "Acadêmico · Turmas". **Recomendação:** cadastro da turma (nome, lista) aqui; "Acadêmico · Turmas" vira a composição (alunos e professores por turma) ou sai.
* **Fornecedores** 🆕 Necessário para Despesas.

### 📚 Acadêmico
Ponto de atenção: hoje o pedagógico é operado pela **Coordenação**, que é um admin com departamento "coordenação". Levar a operação acadêmica para a Gestão duplicaria o trabalho. **Recomendação:** na Gestão, o Acadêmico é **consulta e indicadores**; a operação continua no portal da Coordenação.
* **Ano Letivo** 🆕 Lacuna estrutural (seção 5.1). É o item mais importante deste grupo.
* **Turmas** ⚠️ ver Cadastros.
* **Frequência** 🟡 `class_attendance` e `AdminFrequencia.jsx` existem (frequência de sala, lançada pelo professor). Na Gestão: consulta.
* **Notas** 🆕 ⚠️ Não existe. A escola atual é de **educação infantil (Montessori)**, que avalia por relatório descritivo, não por nota. **Recomendação:** só construir quando houver escola de ensino fundamental; até lá, não exibir.
* **Boletins** 🟡 A estrutura de relatórios pedagógicos existe (`report_templates`, `reports`), mas "Semestral" e "Mapa de Habilidades" ainda são placeholders (`AdminRelatorioPlaceholder.jsx`). "Boletim" e "Relatório Semestral" são a mesma coisa neste contexto.
* **Ocorrências** 🟡 Hoje existem os relatórios de Mitigação (`mitigacao_reports`), a Observação Diária do professor (`pedagogical_records`) e o Diário. **Recomendação:** "Ocorrências" pode ser uma visão unificada desses três, sem tabela nova.

### 📅 Calendário
* ✅ `AdminCalendario.jsx` (inclui importação por IA). Reaproveitar.

### 📢 Comunicação
* **Comunicados** ✅ `AdminComunicados.jsx`
* **Mural** ✅ `AdminMuralFotos.jsx`
* **Histórico** ⚠️ O histórico de comunicados (quem leu, `comunicado_reads`) já faz parte da tela de Comunicados. **Recomendação:** remover.
* Sugestão: o **Chat** (`AdminChat.jsx`) é comunicação e não está no menu proposto. Definir se a Gestão participa (setor financeiro do chat).

### 📊 Relatórios
* **Gestão, Financeiro, Acadêmico, Operacional** 🟡/🆕 Hoje existem Horas Extras, Histórico Geral de presença, Auditoria e a impressão em PDF (histórico, horas extras, mitigação). **Recomendação:** este passa a ser o **único** lugar de relatórios, e os "Relatórios" de dentro do Financeiro e da Presença saem.

### 🔔 Pendências
* 🆕 Ótima ideia: uma caixa única com tudo que depende da Gestão, ou seja, cadastros pendentes, matrículas pendentes, correções de presença, documentos faltando e cobranças vencidas. Os dados já existem; é só uma tela que junta tudo. ⚠️ Sobrepõe o Início; **recomendação:** o Início mostra os números e Pendências mostra a lista completa.

### 👤 Usuários e Permissões
* **Usuários** ⚠️ Duplica "Cadastros · Usuários". **Recomendação:** remover de um dos dois lugares.
* **Perfis** e **Permissões** 🆕 Hoje os papéis são fixos (suporte, gestão, admin, professor, família), com as regras escritas em cerca de 140 policies e dentro das funções. Tela de permissões configuráveis exige antes a lacuna 5.3.
* **Auditoria** ✅ `AdminAuditLog.jsx`, já com leitura para a Gestão.

### ⚙️ Configurações
* **Escola** ✅ (ligado hoje)
* **Acadêmico** 🟡 Turmas (ligado) e faltas (ligado). Método pedagógico e módulos contratados são exclusivos do suporte, de propósito (plano contratado).
* **Financeiro** ⚠️ A configuração de cobrança de hora extra está em Configurações, e a chave do Asaas está na aba "Configuração" do Financeiro. **Recomendação:** juntar as duas aqui.
* **Comunicação** 🆕 Não há configurações de comunicação hoje (ex.: modelos de notificação, horários de envio).
* **Segurança** 🟡 A troca obrigatória de senha e a política de 8 caracteres já existem. Sessões, 2FA e política de senha configurável seriam novos, via Supabase Auth.

### 🔗 Integrações
* 🟡 Hoje: Asaas (cobrança, webhook e sandbox), push, IA (Gemini, para cardápio e calendário) e Sentry. **Recomendação:** uma tela de status das integrações (conectado, última sincronização, erro), incluindo a chave do Asaas, que hoje está no Financeiro. Futuras: NFSe, assinatura eletrônica, WhatsApp.

---

## 4. Menu recomendado (com as redundâncias resolvidas)

```
🏠 Início                      (painel com números do dia)
🔔 Pendências                  (caixa única)
📂 Secretaria
   ├── Alunos
   ├── Matrículas e Rematrículas
   └── Documentos pendentes
📝 Contratos                   (documento jurídico)
   ├── Contratos
   ├── Modelos
   ├── Assinaturas
   └── Aditivos
💰 Financeiro
   ├── Visão Financeira
   ├── Cobranças                (com filtro Inadimplência)
   ├── Recebimentos e Conciliação
   ├── Despesas
   └── Notas Fiscais
⏱️ Presença e Horas
   ├── Presença do Dia (consulta)
   ├── Correções de Presença
   └── Horas Extras
👥 Cadastros
   ├── Responsáveis             (atual "Usuários")
   ├── Funcionários e Acessos
   ├── Turmas
   └── Fornecedores
📚 Acadêmico                   (consulta)
   ├── Ano Letivo
   ├── Frequência
   ├── Relatórios Pedagógicos   (Boletins)
   └── Ocorrências
📅 Calendário
📢 Comunicação
   ├── Comunicados
   └── Mural
📊 Relatórios
   ├── Gestão
   ├── Financeiro
   ├── Acadêmico
   └── Operacional
👤 Permissões
   ├── Perfis e Permissões
   └── Auditoria
⚙️ Configurações
   ├── Escola
   ├── Acadêmico
   ├── Financeiro               (hora extra + Asaas)
   ├── Comunicação
   └── Segurança
🔗 Integrações
```

---

## 5. Lacunas de arquitetura (resolver antes de escalar)

### 5.1 Não existe "ano letivo" (crítica para ERP)
* **Problema:** turma, turno, horas contratadas e matrícula ficam gravados **direto no aluno**. A rematrícula **sobrescreve** o ano anterior, e não sobra histórico de "em 2026 esteve no Nido, em 2027 no Kids I" além das transferências de turma. Relatórios por ano, contratos por ano e o fechamento do ano ficam impossíveis.
* **Correção:** criar `school_years` (ano, datas, situação aberto ou fechado) e `enrollments` (aluno × ano letivo × turma × turno × horas × contrato), migrando o estado atual como a matrícula do ano corrente. As telas passam a ler a matrícula do ano selecionado. É a mudança de maior impacto do plano e deve ser a primeira da parte acadêmica e contratual.

### 5.2 Contrato sem versão
* **Problema:** `financial_contracts` guarda um único valor e ciclo. Mudar de turno no meio do ano altera o contrato sem deixar rastro do que valia antes, e não existe documento assinado.
* **Correção:** `contract_versions` (cada versão com valor, vigência e o documento gerado), e aditivo como uma nova versão ligada à anterior. A cobrança passa a usar a versão vigente na data.

### 5.3 Permissões fixas por papel
* **Problema:** "quem pode o quê" está escrito como texto (`'admin'`, `'gestao'`) em cerca de 140 policies e dentro de dezenas de funções. Nesta sessão, essa dispersão causou bugs repetidos: funções que esqueceram um papel e travas duplicadas.
* **Correção:** tabela de capacidades por papel (`role_permissions`: papel × capacidade, ex. `financeiro.cobrar`) e uma função única `has_permission('financeiro.cobrar')` usada pelas policies. Migrar módulo a módulo, com o mesmo método de fases. Só depois disso a tela "Perfis e Permissões" é possível sem risco.

---

## 6. Plano de implementação em fases

Cada fase segue o método que já funcionou neste projeto: testes que provam a regra, aplicação primeiro no Supabase local, suíte completa, publicação e registro em "Sistema > Atualizações" quando houver mudança visível.

| Fase | Entrega | Base existente | Construção nova | Risco |
|---|---|---|---|---|
| **G1** | Reorganizar o menu da Gestão conforme a seção 4, com tudo que já existe; Presença do Dia (consulta), Calendário, Comunicados, Mural e Auditoria reaproveitados | Telas atuais | Só o menu | Baixo |
| **G2** | Início como painel + Pendências | Consultas às tabelas atuais | 2 telas | Baixo |
| **G3** | Financeiro: Visão Financeira, filtro de Inadimplência, Recebimentos com baixa manual e comprovante, Configurações financeiras unificadas | `financial_charges`, `AdminFinanceiro.jsx` (dividir o arquivo de 1.122 linhas em telas menores) | Baixa manual (RPC com auditoria) | Médio (dinheiro) |
| **G4** | Relatórios consolidados (Gestão, Financeiro, Acadêmico, Operacional) com exportação em PDF e planilha | Funções de impressão e relatórios atuais | Consultas agregadas | Baixo |
| **G5** | Fornecedores + Despesas (contas a pagar), com anexo de nota e categoria | Padrão de Storage do `student_documents` | 2 tabelas, 2 telas | Médio |
| **G6** | Ano letivo e matrícula por ano (lacuna 5.1) | Matrículas, transferências | `school_years`, `enrollments`, migração de dados | **Alto**: mexe no dado central |
| **G7** | Contratos: Modelos, geração a partir da matrícula aprovada, versões e aditivos (lacuna 5.2) | `financial_contracts` | `contract_templates`, `contract_versions` | Alto |
| **G8** | Assinatura eletrônica (provedor externo) | Fluxo de consentimento biométrico como referência | Integração nova e webhook | Médio |
| **G9** | Notas Fiscais (NFSe pelo Asaas) | `PLANO_NFSE_ASAAS.md` | Depende das decisões de negócio pendentes | Médio |
| **G10** | Conciliação bancária (extrato OFX) | Baixa manual da G3 | Importação e casamento de lançamentos | Médio |
| **G11** | Permissões configuráveis (lacuna 5.3) e a tela Perfis e Permissões | Hierarquia atual | `role_permissions`, `has_permission()` | **Alto**: toca todas as policies |
| **G12** | Integrações (tela de status) e Configurações de Comunicação e Segurança | Asaas, push, IA | Tela de status | Baixo |

Ordem recomendada: G1 → G2 → G3 → G4 (valor rápido, baixo risco) e depois G6 antes de G7, porque contrato por ano depende do ano letivo. G11 pode correr em paralelo a partir da G6.

---

## 7. O que foi aplicado nesta rodada (27/09/2026)

Pronto e testado no ambiente local (326 testes, lint e build), aguardando publicação conjunta:

1. **Telas da Gestão:** Cadastros (Usuários com fila de aprovação e contador de pendentes, Novo Cadastro, Funcionários, Turmas) e Configurações.
2. **Fase 2:** professor e responsável criados pelo admin nascem pendentes. As telas avisam "Aguardando aprovação da Gestão".
3. **Fase 3:**
   * o admin não aprova, não exclui e não cria admin;
   * o "admin principal" deixa de ter poderes;
   * a Gestão configura turmas, cobrança, imagem de login, faltas e a visibilidade do chat;
   * o cadastro de escola nova pelo suporte cria a conta da Gestão, com troca de senha obrigatória.
4. **Exclusão de escola pelo suporte** não trava mais com registros de erro ou de webhook.

### Problemas encontrados durante o desenvolvimento

| Problema | Impacto | Situação |
|---|---|---|
| A função que salva a lista de turmas rodava com a permissão de quem chama; para a Gestão, que não lê o mural, uma turma **em uso** parecia livre e era removida | Referências órfãs de turma | **Corrigido** (roda com permissão própria) e coberto por teste |
| O cadastro de escola nova pedia "admin principal", mas a função do servidor descartava esse campo | Escolas novas nasciam sem admin principal | **Resolvido** pela nova regra (a escola nasce com a Gestão) |
| As abas da Gestão não tinham nome no cabeçalho (aparecia "secretaria-alunos") | Visual | **Corrigido** |
| Aprovação de matrícula com 2º responsável falhava na Gestão | Bloqueava a aprovação | **Corrigido** (Fase 1, já publicada) |
| As funções do Financeiro aceitavam só admin | A Gestão não conseguia cobrar | **Corrigido** e publicado |
| Menu do Admin com "Usuários" e "Funcionários" duplicados | Confusão | **Recomendação:** limpar na G1 do lado do Admin |
| `AdminFinanceiro.jsx` com 1.122 linhas numa tela só | Difícil de evoluir para os submenus novos | **Recomendação:** dividir na G3 |
| Os testes rodavam no banco real | Risco a dados de escolas | **Corrigido** hoje (Supabase local) |

### Como validar com a conta da Carolina (depois da publicação)
1. Em Cadastros · Funcionários, criar o acesso de uma Recepcionista e confirmar que ela entra no Portal do Admin.
2. Entrar como essa Recepcionista e cadastrar um professor de teste: a tela deve avisar "Aguardando aprovação da Gestão".
3. Voltar à Carolina, em Cadastros · Usuários ou Funcionários, e aprovar.
4. Em Cadastros · Turmas, criar uma turma de teste e depois removê-la.
5. Confirmar que a Recepcionista não vê mais os botões de excluir e aprovar.
