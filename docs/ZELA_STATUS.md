# ZELA — STATUS ATUAL (atualizar em poucas linhas a cada mudança significativa)

Última atualização: 2026-10-05 (menu Planos do Dev).

## Comandos
- Dev: npm run dev · Build: npm run build · Lint: npm run lint (oxlint)
- Testes: npx vitest run <arquivo> (suíte completa: npm test)

## Estrutura
- src/ (App.jsx, components/, hooks/, lib/, utils/, test/) · supabase/ (migrations, functions, cron_jobs_producao.sql) · Sentry no frontend.
- Arquivos grandes (não ler inteiros): src/App.jsx, src/components/AdminFaceScanner.jsx, src/components/AdminPortal.jsx.

## Entregue recentemente (do mais novo para o mais antigo, via git)
- Menu Planos do Dev (05/10, não commitado, PLANO_MENU_PLANOS_DEV.md, fases 1 a 5 escritas): migration 20261005150000_planos_zela.sql aplicada só no banco LOCAL e testada (20 testes RLS/RPC ok); NÃO aplicada em produção; telas em DeveloperPlanos*.jsx, Meu plano em GestaoMeuPlano.jsx. Testes: planosZela.test.js (ok), src/test/planosZelaRls.test.js (precisa de Supabase local).
- Mapa de Habilidades (05/10, não commitado): migration 20261005130000 (mapa_habilidades, mapa_habilidades_registros, RLS), telas Professor/Recepção/Gestão/Família, catálogo com Adicionar e importação CSV. Segue o módulo relatorios_pedagogicos. Migration aplicada no banco local e em produção (05/10). Regras em src/lib/mapaHabilidades.js.
- Alunos: idade em anos e meses (ex.: "0 anos e 6 meses") na lista da Gestão, no perfil (Dados pessoais) e na lista da Recepção; formato único via formatIdade em src/lib/sugestaoTurma.js (commit d306fc5). Família não mostra. Falta conferir se Financeiro/Coordenação/Direção abrem secretaria-alunos.
- Financeiro: planos de mensalidade por ciclo e turno, bolsista, ajuste de cobrança, reajuste.
- Biometria: qualidade lista todas as pessoas e se atualiza sozinha; análise de qualidade por pessoa/grupo; Biometrias na Gestão (qualidade, limpeza, unificar); captura em resolução máxima com conferência de qualidade.
- Totem: autoatendimento se atualiza sozinho; cadastro de biometria mais exigente.
- Matrícula: documentos do responsável na seção 8, obrigatórios na rematrícula.
- Logs/sessão: correções de falsos erros no totem, sair só do aparelho, recuperar sessão.
- Planos: Financeiro e Contratos no plano base; Gestão segue o plano em tempo real.

## Em andamento
- Reorganização da documentação e das regras de economia de tokens: CLAUDE.md reescrito (+101/−65, ainda não commitado) e pasta docs/ nova, ainda não versionada.

## Decisões e cuidados vigentes
- Multi-tenant por school_id; RLS sempre ativo; Realtime filtrado no frontend (filtro de coluna no canal já causou perda de eventos, ver CHANGELOG 1.2.3).
- Roadmap de 40 itens em Proximas_Atualizações.md (revisado em 24/09; 5 feitos, 7 parciais, 28 pendentes). Consultar só a seção necessária.

## Pendências conhecidas
- Mapa de Habilidades: cadastrar o catálogo real, definir a 4ª opção de situação (adiada) e testar no navegador logado (Professor, Coordenação, Família).
- Perfil Gestão Pedagógica: publicado em produção (confirmado 05/10: migration, policies, 1 usuário no perfil). Checklist da seção 10 validado pelo usuário; seção 9 adiada. Plano concluído (PLANO_PERFIL_GESTAO_PEDAGOGICA.md).
- Apagar registro de entrada/saída (07/10): código pronto (migration 20261007120000, botões no AttendanceEditTodayModal, só gestao e gestao_pedagogica, remoção lógica). Falta aplicar a migration em produção e validar logado: apagar, conferir que some da família e dos relatórios, e a linha em Correções.
- Tela preta no cadastro de biometria do totem (iPhone, 08/10): código pronto, NÃO publicado nem testado em aparelho. FaceCameraCapture agora pede 1920x1080 (era 4096x2160), faz play(), vigia quadros (reinicia 2x, depois botão "Tentar de novo") e registra em error_logs categorias cadastro_* (camera_erro, camera_travada, camera_sem_resposta, track_mudo, play_recusado, modelos_erro). Validar no iPhone e checar o resumo de erros após alguns dias. too_close/too_far/below_threshold/ambiguous_match agora têm uma linha por faixa (mensagem com a faixa); match_lost traz filhos_vinculados/filhos_marcados. Limiar e teto 0,50 NÃO alterados: decidir só com esses números.
- Revisar e commitar CLAUDE.md e docs/. Decidir se .scratch/ e .stitch/ (não versionados) entram no .gitignore.

## Documentos de apoio (ler só se necessário)
DOCUMENTATION.md, CHANGELOG.md, LGPD_RETENCAO.md, OBSERVABILIDADE.md, METODO_PEDAGOGICO.md, PLANO_*.md.
