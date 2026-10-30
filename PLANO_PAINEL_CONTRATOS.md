# Plano inicial: menu "Painel de contratos" (Portal do Dev)

Objetivo: estruturar a cobrança do Zela para as escolas, junto com contrato e NFS-e, em um menu do Portal do Dev.

## O que existe hoje
- A contratação da escola com o Zela (plano, ciclo, extras e desconto) está em `school_contratacoes`, no menu Planos (`src/components/DeveloperLayout.jsx`).
- Os valores são só registro. Não há cobrança, boleto nem nota do Zela para a escola.
- Asaas e NFS-e (Edge Functions `create-payment`, `payment-webhook` e `enable-contract-nfse`) hoje servem à escola cobrando as famílias, cada escola com a própria chave.
- Os pontos de integração abaixo são hipóteses: o fluxo do Asaas não foi lido a fundo.

## Itens do plano
1. **Decisão de base, antes de código.** O Zela precisa de uma conta Asaas própria, separada das contas das escolas, e de um emissor próprio de NFS-e (CNPJ, município e serviço do Zela). Cobrança de plano nunca pode usar a chave de uma escola.
2. **Menu "Painel de contratos"** como nova aba do Portal do Dev, ao lado de Planos. Só o role `developer` acessa.
3. **Visão geral:** lista de escolas com plano, ciclo, mensalidade cheia e com desconto, vencimento da contratação, situação (Ativo, Inativo ou Vencido) e status de pagamento (em dia, a vencer ou atrasado). Filtros por situação, plano e vencimento.
4. **Ficha da contratação:**
   - Dados: escola, plano, ciclo, início, fim e forma de pagamento.
   - Itens: o plano e os extras avulsos.
   - Desconto: valor e até quando vale.
   - Abas Faturamento, Histórico e Reajustes. A aba Crédito fica para depois.
5. **Faturamento:** nova tabela de cobranças do Zela por escola (competência, vencimento, valor, desconto aplicado, status, id da cobrança no Asaas, id da nota). Gerada a partir da contratação, com o desconto por período entrando mês a mês. RLS só developer, gravação só por função no servidor e sempre com `school_id`.
6. **Contrato:** gerar o contrato de prestação de serviço a partir de um modelo com as variáveis da contratação, com status Enviado, Assinado ou Pendente. O arquivo fica em Storage privado.
7. **NFS-e:** emitir a nota depois da confirmação do pagamento, ou na emissão da cobrança (a decidir).
8. **Ações do painel:** Ativar contrato, Alterar vencimento, Cancelar e Gerar segunda via. Todas registram quem fez e quando.
9. **Reaproveitamento:** os dados vêm de `school_contratacoes` (via `usePlanosZela`), sem duplicar. Os cálculos de valor ficam em `src/lib/planosZela.js`; o painel só lê o que o servidor gravou.
10. **Fases:**
    - Fase 1: lista e ficha somente leitura, sem cobrança. Entrega valor logo e não tem risco.
    - Fase 2: faturamento e cobrança pelo Asaas do Zela.
    - Fase 3: NFS-e e contrato.
    - Fase 4: reajuste, crédito e régua de atraso.

## Segurança e multi-tenant
- A chave Asaas do Zela fica só em segredo de Edge Function.
- Nenhum dado de uma escola aparece em outra.
- Cobrança, NFS-e e webhook exigem análise de segurança antes de implementar.

## Perguntas em aberto
- O Zela já tem conta Asaas e emissor de NFS-e próprios? Se não, é o primeiro bloqueio.
- A nota sai no pagamento ou na emissão da cobrança?
- A cobrança é mensal para todos os ciclos, ou o semestral e o anual geram uma cobrança única do ciclo?
- O contrato é assinado dentro do Zela ou fora, com upload do PDF?
