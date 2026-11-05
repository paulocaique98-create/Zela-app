# PLANO UNIFICADO ZELA

Criado em 05/11/2026. Reúne só o que falta para cada plano chegar a 100%, incluindo ressalvas. Ordenado por prioridade (segurança, integridade, isolamento entre escolas, segurança escolar, correção funcional, confiabilidade, manutenção). Os dois últimos blocos (chave do sandbox e CNPJ) ficam no final por pedido.

Origem: planos que estavam em docs/ (agora excluídos, recuperáveis pelo git) e planos da raiz (PLANO_EXPANSAO_GESTAO, PLANO_FATURAMENTO_ZELA, PLANO_METODO_TRADICIONAL, PLANO_PAINEL_CONTRATOS), mais ORDEM_EXECUCAO, roadmaps e docs de mobile. Status cruzado com ZELA_STATUS.md; não foi conferido código nem banco.

Legenda: [ ] pendente.

## 1. Facial e segurança escolar (origem: PLANO_MIGRACAO_BIBLIOTECA_RECONHECIMENTO_FACIAL, ORDEM_EXECUCAO)

| # | Pendência | Detalhe |
|---|---|---|
| 1.1 | [ ] Fase B | Recadastrar 8 de 138 pessoas sem face_descriptor_v2 |
| 1.2 | [ ] Fase C | Validação cruzada face-api x Human |
| 1.3 | [ ] Fase D | Recalibrar o threshold |
| 1.4 | [ ] Fase F | Shadow mode segue em produção; analisar a concordância |
| 1.5 | [ ] Fase G | Corte definitivo: ligar face_engine_human e remover face-api.js |
| 1.6 | [ ] ORDEM item 4 | iPhone com câmera preta, testar à noite |
| 1.7 | [ ] ORDEM item 6 | Decidir o destino de authorized_persons |

## 2. Faturamento do Zela, em produção desde 04/11 (origem: PLANO_FATURAMENTO_ZELA, PLANO_PAINEL_CONTRATOS)

| # | Pendência | Detalhe |
|---|---|---|
| 2.1 | [ ] Teste em navegador | Fluxo completo em produção |
| 2.2 | [ ] Cancelamento | Testar com Asaas em produção (depende do item 21.2) |
| 2.3 | [ ] Renovação do Anual | Definir IPCA e geração do contrato novo (12.13 e 12.15) |
| 2.4 | [ ] Tipagem | Corrigir 160 erros antigos em outras funções (deno check) |
| 2.5 | [ ] Contrato de prestação de serviço | Gerar a partir de modelo (PAINEL_CONTRATOS item 6) |
| 2.6 | [ ] Ajustes 9B e bloqueio por inadimplência | Fases 2 a 4 do bloqueio e validação em navegador, conforme ZELA_STATUS |

## 3. Expansão da Gestão (origem: PLANO_EXPANSAO_GESTAO)

| # | Pendência | Detalhe |
|---|---|---|
| 3.1 | [ ] Migration 20261127120000 | Renomeia os planos para Básico, Padrão e Avançado. Não aplicada em produção; exige análise antes |
| 3.2 | [ ] Régua de cobrança | Resend com domínio próprio e "lembretes enviados" na tela de Cobranças; conferir cron e função do WhatsApp |
| 3.3 | [ ] Testes em navegador | Itens 1 a 14 ainda sem teste completo |
| 3.4 | [ ] Decisões D1 a D12 | Registrar as respostas no plano |
| 3.5 | [ ] Checklist final | Marcar a seção final |

## 4. Método Tradicional (origem: PLANO_METODO_TRADICIONAL, TESTE_MANUAL_TRADICIONAL)

| # | Pendência | Detalhe |
|---|---|---|
| 4.1 | [ ] Carga BNCC | Revisar contra a oficial antes de ligar tarefas_tradicional |
| 4.2 | [ ] Roteiro de testes | Executar os passos 0 a 9 com escola de teste, incluindo RLS |
| 4.3 | [ ] Fase 5A | Promoção: exige escola com ano letivo e turmas de destino |
| 4.4 | [ ] Decisões da seção 5 | Registrar |

## 5. Portal de Gestão (origem: PLANO_PORTAL_GESTAO)

| # | Pendência | Detalhe |
|---|---|---|
| 5.1 | [ ] G12 | 2FA, sessões e política de senha |
| 5.2 | [ ] G11 | Permissões do professor e migração das policies restantes (análise de RLS) |
| 5.3 | [ ] G7 | Versionamento de contratos (contract_versions) |
| 5.4 | [ ] G8 | Assinatura eletrônica com validade jurídica (escolher provedor) |
| 5.5 | [ ] G3 | Dividir AdminFinanceiro.jsx (~1.480 linhas) |
| 5.6 | [ ] Menu do Admin | Remover duplicidade Usuários/Funcionários |
| 5.7 | [ ] Validação | Os 5 passos da seção 7 com a conta da Carolina |

## 6. Logs, erros e observabilidade (origem: PLANO_LOGGING_ERROS_PORTAL_DEV, OBSERVABILIDADE)

| # | Pendência | Detalhe |
|---|---|---|
| 6.1 | [ ] Fase C | Validar o fingerprint em produção (e se precisa de school_id) |
| 6.2 | [ ] Fase F | cron_job_logs espelhar falhas em error_logs |
| 6.3 | [ ] Fase G | Cron de retenção de error_logs resolvidos |
| 6.4 | [ ] B3 | logAppError em AdminFinanceiro e matrícula pública |
| 6.5 | [ ] Fase E | Confirmar VITE_SENTRY_DSN em produção |
| 6.6 | [ ] Painel de saúde | Realtime, banda e falhas de cron |
| 6.7 | [ ] Alertas | Falha de cron e de edge function |
| 6.8 | [ ] ORDEM item 5 | Comparar /resumo-erros com a linha de base |

## 7. IA de resumo de erros e tela de origem (origem: PLANO_IA_RESUMO_ERROS, PLANO_TELA_DE_ORIGEM_NOS_LOGS)

| # | Pendência | Detalhe |
|---|---|---|
| 7.1 | [ ] Calibrar prompt | explain-error-log com explicações reais de error_logs.ai_summary |
| 7.2 | [ ] Aval do provedor | Gemini ou Grok |
| 7.3 | [ ] Tela de origem, Fase B | isKioskMode={adminTab==='kiosk'} em AdminPortal.jsx:779, ou decidir que não precisa |
| 7.4 | [ ] Tela de origem, Fase E | Conferir se SCREEN_LABELS cobre as abas novas |

## 8. Sincronizar marcadores desatualizados (housekeeping)

| # | Pendência | Detalhe |
|---|---|---|
| 8.1 | [ ] Menu Planos Dev | O cabeçalho dizia "nada implementado", mas o menu está no ar. Atualizar a documentação |
| 8.2 | [ ] Valorização | O cabeçalho dizia "nada implementado", mas a Fase 1.1 foi entregue em 16/10 |
| 8.3 | [ ] Faturamento itens 1 a 9 e 9C | Riscar no plano conforme ZELA_STATUS |
| 8.4 | [ ] PRIORIDADE_DOS_PLANOS.md | Desatualizada (05/10); este documento a substitui |
| 8.5 | [ ] CHECKLIST_TESTES_APARELHO | Refletir o que já foi testado no S23 (push Android e exclusão de conta) |

## 9. Planos comerciais e valorização (origem: PLANO_MENU_PLANOS_DEV, PLANO_VALORIZACAO_ZELA)

| # | Pendência | Detalhe |
|---|---|---|
| 9.1 | [ ] Valores de implantação | Por plano (você iria informar) |
| 9.2 | [ ] Descontos por ciclo | Você iria informar |
| 9.3 | [ ] Cobrança por alunos ativos | Recontagem mensal ainda não existe |
| 9.4 | [ ] Valorização 1.2 | Migração assistida (RPC em transação) |
| 9.5 | [ ] Valorização 1.3 | Demo |
| 9.6 | [ ] Demais fases | Cada uma precisa de plano próprio |

## 10. NFS-e (origem: PLANO_NFSE_ASAAS, item 15 do PLANO_EXPANSAO_GESTAO)

Fases 0 a 6 prontas, módulo em produção desligado.

| # | Pendência | Detalhe |
|---|---|---|
| 10.1 | [ ] Cobertura | Confirmar com o Asaas municípios atendidos e certificado A1 |
| 10.2 | [ ] INVOICE_ERROR | Reproduzir um erro real (sandbox sem cadastro fiscal de PJ; ver 21.2) |
| 10.3 | [ ] Fase 7 | Piloto em 1 escola (depende de CNPJ, ver 21.2) |

## 11. LGPD e jurídico (origem: LGPD_RETENCAO, BRIEFING_JURIDICO_SLA, RASCUNHO_PRIVACIDADE_PERMISSOES)

| # | Pendência | Detalhe |
|---|---|---|
| 11.1 | [ ] Prazos de retenção | Confirmar a seção 2 com quem decide a política de dados |
| 11.2 | [ ] Crons de expurgo | Conferir item a item |
| 11.3 | [ ] SLA | Revisão jurídica; WhatsApp comercial e e-mail do domínio; decidir página de status pública; anexar ao contrato e publicar |
| 11.4 | [ ] Privacidade e permissões | Revisão jurídica (LGPD, crianças, biometria) |

## 12. Mobile (origem: docs/mobile, ORDEM_EXECUCAO itens 11 e 13)

| # | Pendência | Detalhe |
|---|---|---|
| 12.1 | [ ] Fase 5 | Concluir (em andamento) |
| 12.2 | [ ] Fases 6 e 7 | Concluir (iniciadas) |
| 12.3 | [ ] Android | Teste em aparelho (push e APK de produção, piloto por App Distribution) |
| 12.4 | [ ] CHECKLIST_TESTES_APARELHO | 24 itens abertos |
| 12.5 | [ ] iOS | CHECKLIST_IOS (23 itens), aparelho real via Sideloadly, conta Apple e TestFlight |
| 12.6 | [ ] Lojas | Capturas de tela, itens [CONFIRMAR] de PREPARACAO_LOJAS, secrets do ios-release |
| 12.7 | [ ] Fase 8 | Teste interno e fechado |
| 12.8 | [ ] Fase 9 | Produção, prazo 31/01/2027 (depende de 21.2) |

## 13. Roadmaps e ideias futuras (origem: Proximas_Atualizações, melhorias_futuras, ORDEM_EXECUCAO)

| # | Pendência | Detalhe |
|---|---|---|
| 13.1 | [ ] Modo Offline do Totem | Não existe |
| 13.2 | [ ] Multi polos e unidades | Não existe |
| 13.3 | [ ] Push avançado e push nativo | App registrar token FCM |
| 13.4 | [ ] Justificativa de faltas via app | Pendente |
| 13.5 | [ ] Health Dashboard de infraestrutura | Ver 6.6 |
| 13.6 | [ ] Demais itens | 18 marcadores abertos em Proximas_Atualizações, de média e baixa prioridade |
| 13.7 | [ ] ORDEM itens 8 a 16 | Detalhar a ordem original |
| 13.8 | [ ] Assistente de mudança de turma | Ferramenta futura (relatórios e idade) |
| 13.9 | [ ] Reordenar menu da Gestão | Cadastros no topo, separar Cadastros de Gerenciamento |

## 14. Escopo opcional adiado (origem: PLANO_PERFIL_GESTAO_PEDAGOGICA)

| # | Pendência | Detalhe |
|---|---|---|
| 14.1 | [ ] Seção 9 | Diferenças Coordenação x Direção, adiada de propósito (ressalva do plano concluído) |

## 15. Opção futura de onboarding financeiro (origem: ONBOARDING_FINANCEIRO_ESCOLA)

| # | Pendência | Detalhe |
|---|---|---|
| 15.1 | [ ] Opção B | Conta mãe e subcontas, ainda não iniciada |

---

## 20. Segurança: chave do sandbox do Asaas

| # | Pendência | Detalhe |
|---|---|---|
| 20.1 | [ ] Rotacionar a chave | A chave do sandbox foi colada no chat. É a pendência de segurança mais urgente; fazer antes de qualquer outro teste com Asaas |
| 20.2 | [ ] Atualizar o secret | Guardar a nova chave no secret das Edge Functions, nunca no frontend |

## 21. Maior bloqueio: CNPJ

O CNPJ trava os itens abaixo. Quando estiver disponível, desbloquear nesta ordem:

| # | Desbloqueia | Detalhe |
|---|---|---|
| 21.1 | Conta Asaas oficial | Substitui o sandbox (ver 2.2, 2.3) |
| 21.2 | NFS-e piloto | Cadastro fiscal de PJ, INVOICE_ERROR real e Fase 7 (10.2, 10.3) |
| 21.3 | Lojas de aplicativo | D-U-N-S, Apple Developer e Google Play Console (12.5, 12.6) |
| 21.4 | Fase 9 do mobile | Produção, prazo 31/01/2027 (12.8) |
