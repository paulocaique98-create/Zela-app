# ORDEM DE EXECUÇÃO (criada em 15/10/2026)

Uma sessão por bloco, /clear entre eles. Marcar [x] ao concluir e anotar a data.
Contexto detalhado de cada item: docs/ZELA_STATUS.md (seção Pendências conhecidas).

## Bloco A. Hora extra e base de dados
- [x] 1. Hora extra (item 5, 15/10/2026): faixas preenchidas (30/60/90/120, tolerância 30); histórico do Lucas (ZL001) conferido na Recepção; SQL conferido com dados reais (25 linhas batem). Família sem excedente validada só por código (FamilyHistory.jsx:139-141), sem teste em tela. Ressalva: nenhum dia real passou da tolerância, então as faixas com excesso ainda não foram exercitadas.
- [x] 2. Migrations (15/10/2026): homologação conferida; 8 registradas por migration repair. Resta sem registro e sem aplicar a 20261012120000 (chat por setor, mexe em RLS, precisa de análise de segurança). Nunca db push.

## Bloco B. Preços (item 6)
- [x] 3. Preços (15/10/2026): produção mantida. Mínimos 290/490/690 conferidos (histórico de 14/10 mostra um único usuário, migration 20261014120000 registrada). Implantação 600 a 1.200 vale (banco); TABELA_PRECOS_ZELA.xlsx e SIMULACAO_PRECOS_ZELA.xlsx (Premissas B17/B18) estavam em 800 a 1.500 e foram alinhados. Ressalva: a simulação foi salva sem recalcular, abrir no Excel para atualizar os valores.

## Bloco C. Biometria e erros
- [ ] 4. iPhone, câmera preta do cadastro (item 4): publicar e testar no aparelho depois das 19h.
- [ ] 5. /resumo-erros: comparar com a linha de base; marcar "Token inválido" como resolvido só se parou de crescer.
- [ ] 6. Decidir authorized_persons no tempo real (usar os números do passo 5). Motor Human segue desligado.

## Bloco D. Produto
- [x] 7. Mapa de Habilidades (15/10/2026): validado logado pelo usuário nos 3 perfis (Professora, Coordenação, Família); PRs #17 e #18. Catálogo de exemplo Montessori em docs/mapa_habilidades_montessori.csv (a revisar por professora). 4ª opção de situação segue adiada.
- [x] 8. Idade em anos e meses (15/10/2026): Coordenação e Direção abrem secretaria-alunos (perfisGestao.js:33); Financeiro entra como gestao (Gestão completa), então também abre. Conferido só por código, sem teste em tela.
- [x] 9. Menu Planos do Dev (15/10/2026): já estava commitado (6db00a3, 201fac1) e ligado em DeveloperLayout.jsx:128.

## Bloco E. Mobile e integrações
- [x] 10. Asaas (15/10/2026): webhook "TESTDE LTDA" (apontava para a produção) removido pelo usuário no painel do Asaas.
- [~] 11. Fase 6 (15/10/2026), homologação OK: ASAAS_API_KEY (sandbox) e VAPID presentes; cobrança avulsa gerada pelo app, vista pela Família e paga no sandbox com webhook atualizando para Pago; send-test-push respondeu {"success":true}. Pendente: segredos Asaas/VAPID na produção (com aprovação), confirmar se o push apareceu na tela, iOS em aparelho real. Perfil `financeiro` abre tela em branco (sem rota no app).
## Bloco F. Organização e docs
- [ ] 12. Revisar e commitar CLAUDE.md e docs/; decidir .scratch/ e .stitch/ no .gitignore.
- [ ] 13. Loja e SLA: capturas de tela; SLA com jurídico e WhatsApp.

## Por último
- [ ] iOS em aparelho real (Sideloadly).
- [ ] Itens 8 a 16 da ordem original de 15/10: detalhar com o usuário e encaixar.
