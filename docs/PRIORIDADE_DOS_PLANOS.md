# Prioridade dos planos (05/10/2026)

Ordem de cima para baixo. Critério: o app precisa ser lançado em janeiro de 2027, e o CNPJ ainda está em abertura. Por isso vêm primeiro as coisas que destravam as lojas e a estabilidade, e o que depende do CNPJ aparece com a marca "espera CNPJ". Cada plano tem a lista PENDENTE e CONCLUÍDO dentro do próprio arquivo.

## O que o CNPJ destrava
- Conta Apple e Google Play de organização (exige D-U-N-S): `PLANO_APPS_MOBILE.md`, Fase 0.
- Chave Asaas de produção, teste de R$ 1,00 e nota fiscal: `PLANO_NFSE_ASAAS.md` e P0.4 do `RELATORIO_MESTRE_ESTADO_ATUAL_ZELA.md`.
- Política de privacidade com razão social e endereço: `POLITICA_PRIVACIDADE_BASE.md`.

## Concluído
- `PLANO_PERFIL_GESTAO_PEDAGOGICA.md`: publicado e confirmado em produção em 05/10/2026, checklist de 12 itens testado. Saiu da fila.

## Ordem

| # | Arquivo | Por que nesta posição |
|---|---|---|
| 1 | `PLANO_APPS_MOBILE.md` | É o objetivo do lançamento. Começar já a base Capacitor, sessão e push, que não precisam de CNPJ. Fase 0 (contas e D-U-N-S) espera CNPJ e é o gargalo de prazo. |
| 2 | `LGPD_RETENCAO.md` | As lojas exigem política de privacidade e exclusão de conta; biometria de crianças pede prazos de retenção decididos. Parte depende do advogado. |
| 3 | `PLANO_LOGGING_ERROS_PORTAL_DEV.md` | Sem logs confiáveis o piloto do app vira cego. Faltam validação de carga, retenção e Sentry. |
| 4 | `PLANO_TELA_DE_ORIGEM_NOS_LOGS.md` | Pequeno (Fase B, uma prop em `AdminPortal.jsx`) e melhora o diagnóstico dos erros do app. |
| 5 | `PLANO_MIGRACAO_BIBLIOTECA_RECONHECIMENTO_FACIAL.md` | O app usa a câmera e o reconhecimento. Terminar a migração antes de embarcar o modelo, evitando migrar duas vezes. Cutover exige cuidado. |
| 6 | `OBSERVABILIDADE.md` | Painel de saúde e alerta de cron e edge function. Importante antes de mais escolas, não bloqueia o app. |
| 7 | `PLANO_IA_RESUMO_ERROS.md` | Conveniência. Só calibrar o prompt e confirmar o provedor. |
| 8 | `PLANO_PORTAL_GESTAO.md` | Funcional em grande parte. Pendências (contratos versionados, permissões, dividir `AdminFinanceiro.jsx`) podem esperar o lançamento. |
| 9 | `Proximas_Atualizações.md` | Roadmap geral. Dentro dele, subir 2FA (#23) e backup/PITR (#39) antes do lançamento por serem segurança. |
| 10 | `PLANO_NFSE_ASAAS.md` | Espera CNPJ e decisões de negócio. Fase 0 (sandbox) pode ser feita assim que houver CNPJ. |
| 11 | `melhorias_futuras.md` | Sugestões de médio e baixo impacto. |
| 12 | `METODO_PEDAGOGICO.md` | Nada urgente: normalização de turmas só entra se boletim ou rematrícula forem priorizados. |
| 13 | `RELATORIO_MESTRE_ESTADO_ATUAL_ZELA.md` | Foto histórica de 31/08. Consultar, não executar. Os itens vivos (P0.4, push de ponta a ponta) já estão repetidos acima. |

## Primeiros passos sugeridos
1. Começar a base Capacitor sem conta de loja (#1), enquanto o CNPJ sai.
2. Quando o CNPJ sair: pedir o D-U-N-S no mesmo dia, pois é o que mais demora.
3. Decidir os prazos de retenção e levar a política de privacidade ao advogado (#2).

## Não são planos, ficam fora da ordem
`ZELA_STATUS.md`, `ROTINA_MANUAL.md`, `ONBOARDING_FINANCEIRO_ESCOLA.md`, `CHANGELOG.md`, `DOCUMENTATION.md`, `POLITICA_PRIVACIDADE_BASE.md` (referência para o item 3).
