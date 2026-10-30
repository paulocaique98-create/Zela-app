# Plano: Faturamento do Zela Edu para as escolas

Detalha a Fase 2 do [PLANO_PAINEL_CONTRATOS.md](PLANO_PAINEL_CONTRATOS.md): cobrança do Zela Edu para a escola contratante, pela conta Asaas oficial do Zela Edu.

Não confundir com a cobrança da escola para as famílias. Aquela usa a chave Asaas de cada escola e as funções `create-payment` e `payment-webhook`, que este plano não altera.

Legenda: ✅ decidido · ❓ falta decidir · ⚠️ risco ou brecha identificada no código

---

## 1. Nomes (para não confundir)

| Termo | O que é | Valores |
|---|---|---|
| **Período** | Quanto tempo dura o contrato antes de renovar. No código e no banco, chama `ciclo`. | Mensal e Anual ✅ (Semestral e Bianual saem do projeto) |
| **Pagamento** | Como a escola paga o período. | À vista ou Parcelado |
| **Condição de pagamento** | A combinação de período e pagamento. É ela que define quantos links saem e o desconto. | Tabela da seção 2 |
| **Cobrança** | Cada link de pagamento gerado no Asaas (1 boleto ou Pix). | Parcela 1, 2, 3... |
| **Implantação** | Taxa única de entrada, que já existe no contrato (R$ 600 a R$ 1.200). | Seção 3 |

Na tela, aparece **Período** e **Pagamento**. O termo "ciclo" fica só no código.

## 2. Condições de pagamento

✅ **Lugar único:** período, pagamento, parcelas e desconto são definidos só no modal "Contratar". Nenhum outro lugar do sistema define desconto ou parcelamento.

| Período | Pagamento | Links | Desconto | Status |
|---|---|---|---|---|
| Mensal | Mês a mês | 1 por mês, enquanto o contrato durar | 0% | ✅ |
| Anual | À vista | 1 | 15% | ✅ |
| Anual | 6x | 6, uma a cada 2 meses, cobrindo os 12 meses | 10% | ✅ |
| Anual | 12x | 12 | 5% | ✅ |

Regras:
- ✅ **O desconto da condição substitui o desconto do ciclo de hoje.** Hoje `zela_plano_ciclos.desconto_percent` define Semestral 5%, Anual 10% e Bianual 15% por plano, na tela de Planos. Esse campo deixa de valer: o servidor passa a ignorá-lo, a tela de Planos deixa de mostrá-lo, e a coluna fica no banco com 0, sem ser apagada. Os percentuais da tabela acima ficam numa tabela de configuração editável pelo developer, não fixos no código.
- ✅ **Sem desconto em cascata.** O desconto negociado na mensalidade (hoje com teto de 10%, escolhido no modal) não soma mais por cima do desconto da condição. Os percentuais de desconto da mensalidade passam a ser definidos na tela de Configurações (seção 7A) e aplicados contrato a contrato no Painel de contratos (seção 7B).
- ✅ **O valor do contrato é congelado no momento da contratação.** Já existe o `snapshot` em `school_contratacoes`. Mudar o preço depois não altera contratos já assinados.
- **Arredondamento:** total dividido pelo nº de parcelas, com os centavos que sobrarem somados na última parcela. A soma das parcelas tem que bater exatamente com o total.
- **Vencimentos:** a 1ª vence em 3 dias por padrão (editável) ✅. As demais vencem no mesmo dia dos meses seguintes (12x e Mensal) ou a cada 2 meses (6x). Se o mês não tiver esse dia (29, 30 ou 31), vale o último dia do mês.

## 3. Implantação

⚠️ Hoje o contrato grava `implantacao_final`, mas nada cobra esse valor.

✅ **No modal "Contratar" você define o valor e o desconto da implantação.** O valor fica dentro da faixa da Configuração (hoje R$ 600 a R$ 1.200), e o desconto dentro do teto, podendo chegar a 100% (isenta).

✅ **A implantação segue sempre a forma de pagamento do sistema, sem exceção:**
- **Anual à vista:** implantação inteira somada ao link único.
- **Anual 6x:** implantação dividida em 6 e somada a cada uma das 6 parcelas.
- **Anual 12x:** implantação dividida em 12 e somada a cada uma das 12 parcelas.
- **Mensal:** implantação inteira somada ao 1º mês ✅. Do 2º mês em diante, só a mensalidade.
- Não existe pagar só a implantação, nem link separado para ela.

✅ **Liberação:** como a implantação está dentro do mesmo link, pagar a 1ª parcela já paga a parte da implantação, e o acesso é liberado.

Cada cobrança guarda separadamente quanto é sistema e quanto é implantação. Isso serve para o extrato, a NFS-e e um eventual cancelamento.

## 4. Fluxo completo

1. A escola aprova a proposta (fora do Zela).
2. A escola já está em Gestão de Escolas, com login criado e acesso bloqueado.
3. Em Planos, você clica em "Revisar e contratar" e escolhe período, pagamento e vencimento da 1ª parcela. A tela mostra total, desconto, valor de cada parcela e implantação.
4. Ao confirmar, o servidor faz, nesta ordem:
   1. grava o contrato como `aguardando_pagamento` (e não mais `ativa`, como acontece hoje);
   2. cria ou reaproveita o cliente no Asaas pelo CNPJ;
   3. cria as cobranças no Asaas;
   4. grava cada cobrança em `zela_cobrancas`, com o link.
5. A tela mostra o botão **Copiar mensagem para WhatsApp**. O envio é manual ✅.
6. O webhook confirma o pagamento da 1ª parcela, e o contrato e a escola passam para `ativa` automaticamente ✅. Os módulos contratados são liberados.
7. As parcelas seguintes ficam no portal da escola, em Assinatura.
8. Em atraso, a régua da seção 7 se aplica. Você pode suspender ou reativar a qualquer momento ✅.

## 5. Modelo da mensagem do WhatsApp ✅

```
Segue abaixo o link para realizar o pagamento do pedido:

Parcela 1: {invoiceUrl}
Vencimento: {dd/mm/aaaa}

Informações referente ao pedido:
Codigo Negocio: {schools.school_code}
Empresa: {schools.name}
CPF_CNPJ: {schools.cnpj formatado}
```
- A mensagem leva só a 1ª parcela ✅.
- ✅ À vista: a linha vira "Parcela única: {invoiceUrl}".
- A implantação já está dentro do link, então a mensagem não ganha linha extra.
- O botão fica bloqueado se faltar CNPJ ou se a cobrança ainda não tiver link.

## 6. Estados

**Contrato** (`school_contratacoes.status`, hoje `rascunho`, `ativa`, `encerrada` ou `cancelada`):
- Novos estados: `aguardando_pagamento` e `suspensa`.
- ⚠️ O índice único de contrato ativo por escola e a função que a escola usa para ler o próprio contrato filtram `status = 'ativa'`. Os dois precisam ser revistos, para não abrir dois contratos nem esconder o contrato pendente.
- ⚠️ Hoje um contrato novo encerra o anterior na hora. Com pagamento pendente, o anterior só pode ser encerrado quando o novo for pago. Isso vale para troca de plano em escola já ativa.

**Cobrança** (`zela_cobrancas.status`): `pendente`, `paga`, `vencida`, `cancelada`, `estornada`.

**Acesso da escola:**
- ⚠️ Antes de criar qualquer coisa, ler como `schools.is_active` é usado no login e nas policies.
- O bloqueio tem que valer no servidor, não só esconder a tela.
- ⚠️ **Escolas que já estão em uso (ex.: Montessori) não podem ser bloqueadas pela migration.** Elas entram como `ativa`, sem cobrança gerada.

## 7. Atraso, suspensão e segurança escolar

- ✅ **Inadimplência bloqueia o sistema inteiro da escola.** A escola fica fora do ar até pagar, para todos os perfis: Recepção, Gestão, professores, famílias, tablet e totem.
- ✅ **Carência de 15 dias**, editável na tela de Configurações. Aviso no portal desde o 1º dia de atraso, com contagem regressiva, e bloqueio no 15º.
- ⚠️ **Impacto que a escola precisa saber, no contrato e nos avisos:** com o bloqueio, check-in/out, autorizados para retirada e reconhecimento facial param. A escola precisa voltar ao controle manual de retirada. Por isso:
  - o aviso prévio é obrigatório: no portal da Gestão desde o 1º dia de atraso, e depois por e-mail e WhatsApp;
  - a cláusula de bloqueio precisa estar no contrato de prestação de serviço (Fase 3).
- **Como o bloqueio funciona:**
  - no servidor, não só na tela;
  - tela de bloqueio no login com a mensagem "Acesso suspenso por pendência financeira" e o link da cobrança em aberto, para a Gestão poder pagar;
  - o Realtime da escola é cortado;
  - as Edge Functions da escola recusam chamadas.
  - ⚠️ É a parte mais sensível do plano, porque toca Auth e RLS de todas as tabelas. A recomendação é uma função única no banco (`escola_liberada(school_id)`), checada no login e nas funções principais, em vez de mexer em todas as policies. Precisa de análise de segurança própria antes.
- **Nada é apagado.** Dados, histórico e biometria ficam intactos.
- **Desbloqueio automático:** o webhook libera o acesso assim que o pagamento é confirmado.
- **Seu controle:** você pode bloquear ou liberar manualmente a qualquer momento, por exemplo para dar mais prazo após um acordo.
- ✅ **Multa e juros:** valor inicial de 2% de multa e 1% de juros ao mês, proporcional aos dias, enviados em cada cobrança ao Asaas. São o padrão de mercado no Brasil e o teto que o Código de Defesa do Consumidor aceita para multa. Entre empresas não há esse limite, mas valores acima disso costumam gerar contestação. Ficam editáveis na Configuração, para revisar depois. Para um valor de R$ 1.000 com 15 dias de atraso, dá R$ 20 de multa e R$ 5 de juros.
- ✅ **Aviso de atraso no portal da Gestão:** um aviso próprio, fixo no topo do portal da Gestão da escola, visível a partir do 1º dia de atraso. Mostra a parcela vencida, o valor, os dias de atraso, a data do bloqueio e o link para pagar. Some sozinho quando o pagamento é confirmado. Na Recepção, nos professores e nas famílias, ❓ aparece só um aviso curto ou nada até o bloqueio?
- **E-mail e WhatsApp:** ficam para uma etapa posterior. O WhatsApp depende de o sistema ter WhatsApp integrado, o que ainda não existe.
- Toda suspensão e reativação grava quem fez, quando e o motivo.

## 7A. Tela de Configurações do faturamento ✅

Uma tela no Portal do Dev, só para developer, para mudar as regras sem mexer em código. Toda alteração grava quem mudou, quando, o valor anterior e o novo.

| Configuração | Valor inicial |
|---|---|
| Desconto de cada condição de pagamento | Mensal 0%, Anual à vista 15%, 6x 10%, 12x 5% |
| Condições ativas (ligar ou desligar cada uma) | As 4 ligadas |
| Percentuais de desconto da mensalidade (seção 7B) | Lista fixa editável: 5% e 10% ✅ |
| Faixa de valor da implantação | R$ 600 a R$ 1.200 (já existe) |
| Teto de desconto da implantação | O que já existe hoje |
| Vencimento padrão da 1ª parcela | 3 dias |
| Carência até o bloqueio | 15 dias |
| Multa e juros por atraso | 2% de multa e 1% de juros ao mês, proporcional aos dias ✅ (valor inicial, a revisar) |

Regras:
- **Configuração mudou, contrato antigo não muda.** Cada contrato guarda as regras do dia em que foi fechado.
- **Exceção:** a carência e os juros valem para todos a partir da mudança.
- **Consolidação:** a configuração comercial que já existe (`zela_config` ou equivalente, a confirmar na leitura) é reaproveitada e ampliada, e não duplicada.

## 7B. Ajustes no Painel de contratos ✅

Na ficha de cada contrato, só developer, com motivo obrigatório e registro de quem fez e quando:
- **Alterar datas de vencimento** das parcelas ainda não pagas.
- **Refazer o parcelamento** do saldo em aberto. Por exemplo, juntar 2 parcelas atrasadas em uma ou dividir o saldo em mais vezes.
- **Aplicar desconto na mensalidade** a partir de uma parcela escolhida, usando os percentuais da Configuração. Vale só para parcelas futuras não pagas.

Regras:
- Parcela já paga nunca é alterada.
- Cada ajuste atualiza ou recria a cobrança no Asaas. O link antigo é cancelado e o novo pode ser copiado de novo para o WhatsApp.
- O histórico mostra o antes e o depois de cada ajuste.

## 8. Casos que precisam de regra

| Caso | Proposta |
|---|---|
| 1ª parcela venceu sem pagamento | Contrato fica `aguardando_pagamento`. Botão "Gerar novo vencimento" atualiza a cobrança no Asaas e copia a mensagem de novo. ❓ Cancelar sozinho após N dias? |
| Clique duplo em Contratar | Restrição única por contrato e parcela no banco, mais uma chave de idempotência na função. |
| Asaas fora do ar no meio | Contrato fica "pendente de cobrança", com botão para tentar de novo, que cria só o que faltou. |
| Pagamento por fora (Pix direto, transferência) | "Marcar como paga" manual, com registro de quem fez e do comprovante. Cancela a cobrança no Asaas. |
| Escola sem CNPJ ou e-mail | Contratação bloqueada, com aviso do que falta. |
| Cancelamento do contrato | Cancela no Asaas as parcelas futuras não pagas. ❓ Multa de fidelidade? ❓ Devolução proporcional no à vista? |
| Estorno ou chargeback | Webhook marca como `estornada`. Se for a 1ª parcela, o contrato volta para `aguardando_pagamento`. |
| Mais alunos que a faixa contratada | Fora deste plano. Fica para a Fase 4 (reajuste e upgrade). Por enquanto, só aviso no painel. |
| Fim do período | ❓ Renova sozinho, gerando as novas cobranças com X dias de antecedência, ou só avisa você? |
| Semestral e Bianual | Saem do projeto ✅. ⚠️ Antes, conferir se algum contrato usa um deles. Se usar, ele segue até o fim. No banco, os ciclos são desativados (`ativo = false`), não apagados. A tela e a prévia em `src/lib/planosZela.js` passam a listar só Mensal e Anual. |
| Meio de pagamento | ❓ Boleto e Pix (a escola escolhe no link), ou também cartão? |

## 9. Asaas: como gerar

- **À vista:** 1 cobrança avulsa.
- **6x ou 12x:** recomendo criar cada parcela como cobrança avulsa do Zela, e não usar o "parcelamento" do Asaas. Assim, cada uma tem id, link e status próprios em `zela_cobrancas`, e reemitir ou cancelar uma não mexe nas outras.
- **Mensal:** ❓ assinatura do Asaas (gera sozinha todo mês) ou função agendada do Zela que gera a do mês seguinte? A recomendação é a função agendada: o valor muda com reajuste e faixa, e o controle fica num lugar só.
- **Ambientes:** chave do sandbox e chave de produção em segredos separados (`ZELA_ASAAS_API_KEY`, `ZELA_ASAAS_ENV`). As chaves nunca passam pelo chat nem pelo frontend.
- **Webhook:** função própria, `zela-billing-webhook`, com token próprio, e não o `payment-webhook` das escolas. Assim não há risco de misturar cobrança de família com cobrança do Zela, nem de quebrar o fluxo que já funciona. Eventos tratados: recebido, confirmado, vencido, removido, estornado.
- **Idempotência do webhook:** guardar o id de cada evento recebido. Evento repetido é ignorado.

## 10. Itens de implementação

1. **Análise de segurança e migration de configuração:** tabela `zela_condicoes_pagamento` (período, pagamento, nº de parcelas, desconto, ativo), já com as 4 condições da seção 2. RLS só developer. Semestral e Bianual desativados, e `desconto_percent` dos ciclos zerado e ignorado.
2. **Migration de cobranças:** tabela `zela_cobrancas`, com `school_id`, contrato, tipo (parcela ou implantação), nº da parcela, competência, vencimento, valor, status, ids do Asaas, `invoice_url`, quem marcou como paga e quando.
   - Restrição única por contrato, tipo e parcela.
   - Tabela de eventos do webhook, para a idempotência.
   - RLS: developer lê tudo; a escola lê só as próprias linhas; gravação só pelo servidor.
3. **Estados do contrato e da escola e bloqueio por inadimplência:** novos status, revisão do índice único e da função de leitura da escola, e escolas atuais mantidas como `ativa`. Inclui a função `escola_liberada`, a tela de bloqueio e o corte de Realtime e Edge Functions. Antes, ler o uso de `is_active` e fazer a análise de segurança própria (Auth e RLS).
4. **RPC `contratar_plano_escola`:** recebe a condição de pagamento, aplica o desconto da condição no lugar do desconto do ciclo, grava como `aguardando_pagamento` e calcula as parcelas. A prévia em `src/lib/planosZela.js` usa a mesma regra, com teste.
5. **Gerador da mensagem:** `src/lib/mensagemCobrancaZela.js`, com teste (parcela 1, parcela única, implantação, falta de CNPJ).
6. **Edge Function `create-zela-charge`:** só developer, com role validado pelo JWT. Cria o cliente e as cobranças, grava e devolve os links. Também serve para "tentar de novo" e "novo vencimento".
7. **Edge Function `zela-billing-webhook`:** valida o token, é idempotente, atualiza a cobrança e ativa ou suspende o contrato.
8. **Modal "Contratar":** `src/components/GestaoPlanos.jsx` e `src/hooks/usePlanosZela.js`. É o único lugar onde se escolhe Período (Mensal ou Anual), Pagamento (à vista, 6x, 12x, só no Anual), desconto e vencimento da 1ª parcela (hoje + 3 dias). Mostra o resumo de valores e o botão de copiar a mensagem. Na tela de Planos sai o campo de desconto por ciclo.
9. **Faturamento no Portal do Dev:** cobranças por escola, com filtros por status e vencimento. Ações: copiar mensagem, novo vencimento, marcar como paga, cancelar, suspender e reativar. Resumo no card da escola em Planos. Menu em `src/components/DeveloperLayout.jsx`.
9C. **Aviso de atraso no portal da Gestão** (seção 7): aviso fixo no topo, lido do servidor e filtrado pelo `school_id` da escola.
9A. **Tela de Configurações do faturamento** (seção 7A), com histórico de alterações.
9B. **Ajustes na ficha do contrato** (seção 7B): datas, reparcelamento e desconto, com sincronização no Asaas.
10. **Assinatura no portal da escola** (segunda etapa): só leitura, com todas as parcelas e seus links.
11. **Função agendada:** marca cobranças vencidas, aplica a carência e a suspensão, e gera a cobrança do Mensal e da renovação.
12. **Validação:**
    - testes novos com `npx vitest run <arquivo>`;
    - fluxo inteiro no sandbox do Asaas: contratar, pagar, atrasar, estornar e cancelar;
    - RLS conferido como escola A, escola B e developer;
    - atualizar `docs/ZELA_STATUS.md`.

## 11. Ordem de execução

| Etapa | Itens | Depende de |
|---|---|---|
| A | 1, 2, 3, 4, 5 | Respostas desta lista |
| B | 8, 9 (sem a chamada real) | A |
| C | 6, 7 e teste ponta a ponta | Chave do sandbox do Asaas |
| D | 11 | C |
| E | Produção | Seu pedido explícito (migration e funções) |
| F | 10 | E |

## 12. Respostas que faltam (resumo)

1. ~~Anual em 6x: parcelas nos 6 primeiros meses ou a cada 2 meses?~~ ✅ A cada 2 meses, cobrindo os 12.
2. ~~O desconto da condição substitui o desconto do ciclo atual?~~ ✅ Substitui.
3. ~~O desconto negociado na mensalidade continua por cima?~~ ✅ Não. Ajuste no Painel de contratos, com lista fixa de 5% e 10%.
4. ~~Implantação~~ ✅ Acompanha o parcelamento do sistema, no mesmo link. No Mensal, inteira no 1º mês.
5. ~~"Parcela única" no à vista?~~ ✅ Sim.
6. ✅ Bloqueio total com 15 dias de carência, editável. Aviso no portal da Gestão. E-mail e WhatsApp depois. ❓ Recepção, professores e famílias veem algum aviso antes do bloqueio?
7. ~~Multa e juros~~ ✅ 2% e 1% ao mês, editáveis.
8. Boleto e Pix, ou também cartão?
9. Mensal: função agendada do Zela ou assinatura do Asaas?
10. Renovação no fim do período: automática ou só aviso?
11. Cancelamento: multa de fidelidade e devolução no à vista?
12. 1ª parcela não paga: cancelar sozinho após quantos dias?

## Bloqueios
- A conta oficial do Zela Edu no Asaas ainda vai ser criada. Pedir também a chave do sandbox.
- A NFS-e do Zela continua na Fase 3 do plano de contratos.
