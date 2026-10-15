# ORDEM DE EXECUÇÃO (criada em 15/10/2026)

Uma sessão por bloco, /clear entre eles. Marcar [x] ao concluir e anotar a data.
Contexto detalhado de cada item: docs/ZELA_STATUS.md (seção Pendências conhecidas).

## Bloco A. Hora extra e base de dados
- [ ] 1. Hora extra (item 5): conferir no navegador o histórico do ZL001 no modo geral (PR #15); preencher as faixas; testar o ramo SQL de attendance_charge_cents com dados reais.
- [x] 2. Migrations (15/10/2026): homologação conferida; 8 registradas por migration repair. Resta sem registro e sem aplicar a 20261012120000 (chat por setor, mexe em RLS, precisa de análise de segurança). Nunca db push.

## Bloco B. Preços (item 6)
- [ ] 3. Decidir sobre a produção (mínimos 290/490/690 já estão lá, origem a esclarecer) e definir a planilha de implantação 600 a 1.200 (.xlsx não localizado).

## Bloco C. Biometria e erros
- [ ] 4. iPhone, câmera preta do cadastro (item 4): publicar e testar no aparelho depois das 19h.
- [ ] 5. /resumo-erros: comparar com a linha de base; marcar "Token inválido" como resolvido só se parou de crescer.
- [ ] 6. Decidir authorized_persons no tempo real (usar os números do passo 5). Motor Human segue desligado.

## Bloco D. Produto
- [ ] 7. Mapa de Habilidades: cadastrar catálogo real e testar logado (Professor, Coordenação, Família). 4ª opção de situação segue adiada.
- [ ] 8. Idade em anos e meses: conferir se Financeiro, Coordenação e Direção abrem secretaria-alunos.
- [ ] 9. Menu Planos do Dev: verificar se está commitado; se não, revisar e commitar.

## Bloco E. Mobile e integrações
- [ ] 10. Asaas: decidir sobre o webhook "TESTDE LTDA" (aponta para a produção).
- [ ] 11. Fase 6: testar Edge Function pelo app; configurar segredos Asaas e VAPID.

## Bloco F. Organização e docs
- [ ] 12. Revisar e commitar CLAUDE.md e docs/; decidir .scratch/ e .stitch/ no .gitignore.
- [ ] 13. Loja e SLA: capturas de tela; SLA com jurídico e WhatsApp.

## Por último
- [ ] iOS em aparelho real (Sideloadly).
- [ ] Itens 8 a 16 da ordem original de 15/10: detalhar com o usuário e encaixar.
