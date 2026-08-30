# Fase 11 — Tela Financeiro (Admin + Portal da Família)

*Relatório escrito retroativamente na Fase 17 (Auditoria Final) — a implementação foi feita e testada normalmente, mas o relatório formal não tinha sido escrito na hora.*

## 1. Objetivo

Dar ao Admin uma tela de verdade pra gerenciar contratos, cobranças e configuração do gateway (até então só existia via `curl`), e ao responsável financeiro uma tela pra ver suas próprias cobranças — fechando o que o escopo mestre previa como "Fase 11 — Portal da Família", ampliado a pedido do usuário pra incluir a parte Admin.

## 2. Diagnóstico Inicial

SPA de abas (`AdminPortal.jsx`/`FamilyPortal.jsx`, sem react-router), menu condicional via `features_enabled` da escola (banco) + preferência local. Nenhum componente de tabela/formulário genérico reutilizável — cada tela implementa a própria lista. Edge Functions do financeiro já existiam (Fases 5-9), só nunca tinham UI.

## 3. Arquivos Auditados

`AdminPortal.jsx`, `AdminSettings.jsx`, `FamilyPortal.jsx`, `SidebarNav.jsx`, `ConfirmModal.jsx`, `AdminStudentList.jsx` (padrão de lista), Edge Functions financeiras já existentes.

## 4. Arquivos Modificados/Criados

- **Novo** `src/components/AdminFinanceiro.jsx` — 3 sub-abas: Contratos (listar/criar/cancelar), Cobranças (listar/reprocessar pendências), Configuração (chave Asaas, token de webhook, desconto por responsável).
- **Novo** `src/components/FamilyFinanceiro.jsx` — leitura de contratos/cobranças próprias, com PIX Copia e Cola, boleto e link de pagamento.
- `AdminSettings.jsx`/`AdminPortal.jsx`/`FamilyPortal.jsx` — módulo `financeiro` adicionado ao sistema de menu condicional.
- `DeveloperPanel.jsx` — "Financeiro" adicionado em Módulos Contratados (desligado por padrão, opt-in por escola).

## 5. Banco

Ajuste posterior (mesmo dia): `financial_billing_discounts` deixou de ser por escola e passou a ser por **responsável financeiro específico** (`guardian_id` obrigatório, `UNIQUE(school_id, guardian_id, billing_cycle)`, RLS reforçada com `WITH CHECK` validando que o `guardian_id` pertence à mesma escola) — correção pedida pelo usuário após a primeira versão (desconto único pra escola inteira).

## 6. Segurança

Menu Financeiro da família só aparece quando `features_enabled.financeiro === true` **e** `is_financial_guardian()` retorna `true` para aquele usuário — testado com 2 responsáveis do mesmo aluno (um financeiro, um não), RLS bloqueando o não-financeiro mesmo tentando ler direto pela API.

## 7. Multi-Tenant

Testado com escola nova do zero (sem alunos) — todas as queries corretamente vazias antes do primeiro cadastro.

## 8. Gateway

Cadastro de chave/token pela tela testado com chave real do Asaas sandbox — validação (`ping()`) confirmada na hora do save.

## 9. Webhooks

Sem alteração nesta fase — reaproveita a Fase 8 sem tocar.

## 10. Recorrência

Formulário "Novo contrato" chama `create-financial-contract` sem alteração de lógica — só UI nova em cima da function já existente.

## 11. PIX Copia e Cola

Tela da família exibe botão de copiar PIX quando `pix_copy_paste` está preenchido (ainda não preenchido pra cobranças de recorrência nessa fase — lacuna documentada e fechada depois, na Fase 16).

## 12. Build

`npm run build` sem erros.

## 13. Lint

`npm run lint` sem erros novos (1 warning pré-existente não relacionado).

## 14. Testes

| Teste | Resultado |
|---|---|
| Escola nova, sem alunos — todas as listas vazias corretas | ✅ |
| Criar contrato pela tela (payload idêntico ao curl já validado) | ✅ |
| Cancelar contrato — família bloqueada por RLS, admin funciona | ✅ |
| Desconto por responsável aplicado só ao responsável certo (outro sem desconto configurado paga cheio) | ✅ |
| Ataque: gravar desconto com `guardian_id` de outra escola | ✅ Bloqueado (403, RLS `WITH CHECK`) |
| Menu família só aparece pro responsável financeiro de verdade | ✅ |

## 15. QA Sênior

QA real em escolas de teste descartáveis (criadas e limpas ao final de cada rodada), incluindo teste negativo de segurança (guardian de outra escola) e verificação de zero-resíduo por contagem direta após cada limpeza.

## 16. Problemas Encontrados

Modelo inicial de desconto (por escola) não atendia o caso de uso real — corrigido no mesmo dia após feedback do usuário, sem impacto em produção (tabela estava vazia).

## 17. Riscos Restantes

`pix_copy_paste` não preenchido pra cobranças de recorrência (só cobrança avulsa, adicionada depois, na Fase 16, tem isso desde o início) — famílias com cobrança recorrente PIX só tinham o link genérico até a Fase 16.

## 18. Git

Nenhum commit feito.

## 19. Regra de Parada

Nenhuma acionada.

## 20. Próxima Fase

Fase 12 (Admin Financeiro) foi absorvida por esta fase — próxima autorizada foi Fase 13 (Notificações Financeiras).
