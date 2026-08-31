# Fase 18 — Deploy Controlado (checklist para produção real)

## 1. Objetivo

Fechar as 18 fases do escopo mestre do módulo financeiro com um checklist prático do que falta — e do que nunca pode ser esquecido — antes de uma escola real processar a **primeira cobrança com dinheiro de verdade** (chave `$aact_prod_...`, não mais `$aact_hmlg_...` sandbox).

## 2. Estado atual (o que já está pronto)

- Todas as Edge Functions do financeiro deployadas e funcionando (confirmado com ZL002, pagamento real processado de ponta a ponta em sandbox hoje).
- RLS multi-tenant testada e corrigida (Fase 17), inclusive achados fora do financeiro que foram corrigidos no mesmo dia.
- 91 testes automatizados passando (unitários + integração + isolamento multi-tenant, incluindo o financeiro).
- 3 commits prontos, aguardando só o `git push` (bloqueado pro Claude Code por ser ação de saída — só você consegue rodar).

## 3. Checklist antes de cadastrar a primeira chave de produção

### 3.1 — Conta Asaas
- [ ] Confirmar que a conta Asaas da escola é a de **produção** (`asaas.com`, não `sandbox.asaas.com`) e que passou pela verificação de identidade/documentos do próprio Asaas (pode levar dias — não é algo que o Zela controla).
- [ ] Confirmar que os dados bancários de saque estão corretos na conta Asaas da escola — é pra lá que o dinheiro cai, não existe conta intermediária do Zela (Opção A, decisão da Fase 3).
- [ ] Chave PIX cadastrada na conta de produção (sem isso, PIX falha — já vimos esse erro específico em sandbox).

### 3.2 — Cadastro no Zela
- [ ] Cadastrar a chave de produção via **Financeiro → Configuração** (nunca `curl`/painel do Dev com a chave em texto puro no terminal, exceto se realmente necessário — e nesse caso, tratar como senha de banco, nunca colar em canal não seguro).
- [ ] Cadastrar o token de webhook (pode ser o mesmo token usado em sandbox ou um novo — recomendo um novo, específico de produção).
- [ ] Registrar o webhook no painel do Asaas de **produção** (é uma conta separada da sandbox — configurar de novo, não herda) apontando pra mesma URL (`.../functions/v1/payment-webhook`).
- [ ] Confirmar que a fila de webhook não está pausada (mesmo problema que já vimos em sandbox — conferir logo após cadastrar).

### 3.3 — Teste de fumaça com dinheiro real (valor simbólico)
- [ ] Criar 1 cobrança avulsa de valor baixo (ex.: R$ 1,00) — nunca a mensalidade cheia — pra confirmar que webhook, sincronização e notificação funcionam com a conta de produção de verdade.
- [ ] Confirmar que o valor realmente caiu na conta bancária da escola (fora do Zela, no extrato do Asaas/banco).
- [ ] Só depois desse teste passar, criar os contratos reais de mensalidade.

### 3.4 — Monitoramento pós-lançamento
- [ ] Nos primeiros dias, checar `Financeiro → Cobranças` com frequência (ou consultar `payment_webhook_events` com `processed_at IS NULL` — deveria ser sempre próximo de zero).
- [ ] Se algum evento ficar pendente por mais que alguns minutos, usar o botão "Reprocessar pendências" antes de investigar mais a fundo — cobre a maioria dos casos de falha transitória.

## 4. O que NUNCA fazer (regras absolutas, reforçando o escopo mestre)

- Nunca colar uma chave `$aact_prod_...` em nenhum lugar fora do campo da tela Financeiro → Configuração (nunca em chat, print, log, commit).
- Nunca reaproveitar a chave de sandbox pra produção nem vice-versa — são contas Asaas completamente diferentes.
- Nunca pular o teste de fumaça (3.3) — é a única forma de confirmar que o dinheiro cai na conta certa antes de expor famílias reais a isso.

## 5. Pendências conhecidas que não bloqueiam produção, mas valem revisitar

- `pix_copy_paste` não preenchido pra cobranças de recorrência (só cobrança avulsa tem desde a Fase 16) — família com mensalidade PIX só vê o link genérico, não o código copia-e-cola direto.
- `_fase8_backup_photo_url` — tabela de resíduo, bloqueada mas não apagada (decisão sua, pendente).
- CI ainda não configurado — os 91 testes existem mas não rodam automaticamente em nenhum pipeline.

## 6. Regra de Parada

Nenhuma condição de parada ativa — esta fase é só documentação/checklist, sem alteração de código ou banco.

## 7. Próximo passo

Aguardando você decidir quando a primeira escola vai realmente trocar sandbox por produção — a essa altura, isso deixa de ser trabalho técnico e passa a depender do relacionamento comercial/administrativo com a escola (conta Asaas aprovada, dados bancários, etc.), fora do meu alcance.
