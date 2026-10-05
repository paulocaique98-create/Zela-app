ZELA — CONTEXTO PERMANENTE (modo economia de tokens)
Plataforma SaaS multi-tenant de Gestão e Segurança Escolar, com dados reais. Stack: React 19, Vite 8, Tailwind v4, JavaScript/JSX (sem TypeScript), Supabase (Postgres, Auth, Storage, Realtime, Edge Functions/Deno), Vitest. Fica na raiz do projeto ativo (junto de package.json, src/, supabase/). Detalhes ficam em docs/. Meta: este arquivo abaixo de ~3K tokens.

1. REGRAS DE ECONOMIA DE TOKENS (prioridade operacional)
Evidência (logs 20/08–05/10): 10.262 turnos numa sessão só, 86% dos turnos acima de 200K de contexto, média ~495K, pico 967K; App.jsx lido 54x, AdminFaceScanner.jsx 45x, AdminPortal.jsx 34x. O custo vem do contexto que cresce, não do preload.

1.1 Arquivos grandes: nunca ler inteiros
src/App.jsx (~83KB), src/components/AdminFaceScanner.jsx (~74KB), src/components/AdminPortal.jsx (~53KB): Grep para achar a região e Read com offset/limit (trechos de ~80–150 linhas).
Não reler arquivo já lido na sessão, salvo se mudou por terceiros. Após um Edit bem-sucedido não reler "para conferir".
Não ler: .scratch/, node_modules/, dist/, package-lock.json, *.sql de backfill, logs e saídas persistidas em AppData\Local\Temp\claude\.
Docs em docs/ (PLANO_*.md, METODO_PEDAGOGICO.md, Proximas_Atualizações.md) só com pedido explícito, e só a seção relevante.
1.2 Buscar antes de ler; limitar saídas
Ordem: Glob/Grep (files_with_matches ou count primeiro, head_limit) → Read parcial → Edit. Varredura ampla: delegar a subagente Explore.
Comandos sempre limitados: | head -n 40, | tail -n 60, --silent.
Testes: npx vitest run <arquivo>, nunca a suíte inteira sem necessidade.
Build/lint: só erros (2>&1 | grep -E "error|Error" | head -n 30).
Git: git diff --stat, git log --oneline -n 10, git status -s; diff completo só por arquivo.
SQL/Supabase: sempre LIMIT e colunas explícitas, nunca select *.
1.3 Edição e respostas curtas
Edit pontual; agrupar mudanças do mesmo arquivo. Não reescrever arquivo inteiro (Write) para mudar poucas linhas. Sem refatorações não solicitadas.
Responder só o necessário: sem repetir o pedido, sem recapitular, sem reimprimir código já mostrado (citar arquivo:linha). Resposta final com ~15 linhas no máximo.
1.4 Contexto e sessão
Uma tarefa por sessão. Concluída: parar e sugerir /clear.
Acima de ~150K de contexto: avisar e sugerir /compact com instruções (seção 3). Acima de ~200K: recomendar sessão nova.
Trocar de modelo no meio da sessão invalida o cache: evitar. Opus só em sessão própria de planejamento.
Não usar skills, MCPs ou plugins que a tarefa não precisa (Stitch, Gmail, Chrome, Docs só quando pedidos).
2. HÁBITOS DO USUÁRIO (do maior para o menor impacto)
Uma tarefa = uma sessão. Terminou, /clear. Motivo: contexto médio de ~495K e 5,1B de cache read vieram de uma única sessão de 46 dias.
/compact cedo, entre 150K e 200K, nunca perto de 1M. Motivo: 32 marcadores de compactação com contexto até 967K, cada um relendo ~1M.
Peça localização antes de leitura. Diga "ache a função X em App.jsx e mostre só ela", não "leia App.jsx". Motivo: 133 leituras inteiras de 3 arquivos.
Opus só para planejar, Sonnet para executar, sem trocar de modelo no meio. Motivo: Opus teve 19% dos turnos e 31% do output (2,3M de 7,6M), com preço por token maior; cada troca reescreve o cache.
Peça saídas filtradas ("rode o teste e mostre só as falhas") e cole só as últimas ~30 linhas de um erro, nunca o log inteiro.
Dê o escopo exato (arquivo, função, comportamento). Pedido vago gera exploração, que gera leitura, que gera contexto.
Mantenha docs/ZELA_STATUS.md atualizado: sessão nova começa lendo 1 arquivo curto, não o projeto todo.
3. COMANDOS PARA ENVIAR NA SESSÃO
3.1 Comandos nativos (digitar no prompt)
Comando	Quando usar
/clear	Ao concluir uma tarefa ou mudar de assunto. Zera o contexto.
/compact <instruções>	Contexto entre 150K e 200K e a tarefa não acabou.
/context	Ver o que ocupa a janela (a cada ~50 turnos).
/cost	Conferir consumo da sessão (conforme o plano).
/model	Escolher o modelo no início da sessão, não no meio.
/mcp	Ver e desativar MCPs que a tarefa não usa.
/resume	Retomar sessão curta e específica, nunca uma gigante.
/rewind	Desfazer um passo ruim em vez de pedir correção longa.
/memory	Conferir quais CLAUDE.md estão carregados.
3.2 Modelos de prompt (copiar e colar)
Compactar com foco:

/compact Manter: objetivo, arquivos alterados (caminho e motivo), decisões de
segurança/RLS, testes pendentes. Descartar: saídas de comandos, código já
aplicado, tentativas descartadas.
Início de sessão enxuto:

Leia só CLAUDE.md e docs/ZELA_STATUS.md. Tarefa: <1–2 frases>. Escopo:
<arquivo(s)/função>. Não leia outros arquivos sem me avisar. Responda curto.
Localizar sem ler tudo:

Use Grep para localizar <símbolo/texto> em src/. Mostre só arquivo:linha.
Não abra arquivos ainda.
Ler trecho:

Leia apenas as linhas <N>–<M> de <arquivo> e explique <ponto>. Não leia mais.
Edição cirúrgica:

Em <arquivo>, na função <nome>, faça <mudança>. Edit pontual, sem refatorar,
sem reler o arquivo depois. Confirme em 1 linha.
Teste filtrado:

Rode `npx vitest run <arquivo>` e mostre só as falhas (últimas 60 linhas).
Fechar tarefa:

Tarefa concluída. Atualize docs/ZELA_STATUS.md em até 5 linhas, resuma em até 10
linhas e diga se devo rodar /clear.
Handoff para sessão nova:

Resuma em até 15 linhas: objetivo, o que foi feito, arquivos alterados, o que
falta. Vou colar isso em uma sessão nova depois de /clear.
Plano barato:

Plano em no máximo 10 itens, sem código, citando só arquivos a alterar.
Aguarde meu OK antes de editar.
4. PROJETO — REGRAS PERMANENTES
Multi-tenant: cada escola é um tenant. Considerar school_id em dados, APIs, consultas, Realtime e Storage. Nunca permitir acesso ou eventos entre escolas.
RLS é fundamental: nunca desabilitar, nunca policies permissivas demais, nunca confiar só no frontend, nunca credencial administrativa no frontend, nunca tornar Storage privado público. Mudanças em RLS, policies, Auth, Storage, Realtime, migrations ou Edge Functions exigem análise de segurança antes.
Roles: admin (exibido como Recepção/Administração), family, teacher, developer, financeiro (separado de admin). Analisar dependências antes de alterar roles/policies.
Banco: migrations controladas, sem alterações destrutivas, considerando dados e policies existentes. Sem select('*'). Realtime: filtros, school_id, permissões, reconexão e isolamento.
Check-in/out: Responsável → Tablet/Totem → Solicitação → Monitor da Recepção → Recepção confirma → Concluído (rosto, PIN, QR Code, autorizados, Realtime). Preservar segurança, rastreabilidade e integridade do histórico.
Facial: evitar operações no loop de detecção e uploads repetidos; considerar egress e Storage privado; biometria exige tratamento de segurança. Analisar o fluxo existente antes de substituí-lo.
Preservação: evoluir em vez de substituir; antes de remover, verificar finalidade e dependências.
Honestidade: não afirmar que algo existe, foi feito ou testado sem evidência. Nunca declarar teste não executado. Persistindo a dúvida, informar.
5. FLUXO DE TRABALHO ENXUTO
ENTENDER → LOCALIZAR (Grep) → LER TRECHO → VERIFICAR SEGURANÇA → PLANEJAR → EDITAR → TESTAR (filtrado) → ATUALIZAR STATUS.

Dúvida relevante (dados, permissões, impacto): perguntar antes de agir.
Tarefa não trivial: plano curto e aguardar OK. Só o escopo pedido.
Mudança significativa: atualizar docs/ZELA_STATUS.md em poucas linhas.
Sessão nova: ler este arquivo e docs/ZELA_STATUS.md; outros docs (ZELA_ARCHITECTURE, ZELA_CHECKIN, ZELA_BIOMETRIA, ZELA_SEGURANCA, ZELA_ROADMAP, ZELA_CHANGELOG) só se necessários. Não analisar o projeto todo.
6. FORMATO DE RESPOSTA (curto)
RESUMO (1–2 linhas) · ALTERAÇÕES (arquivo:linha) · VALIDAÇÃO (só o que foi executado) · RESULTADO (concluído/parcial/bloqueado) · PENDÊNCIAS e PRÓXIMOS PASSOS (só se existirem). Em segurança, banco, RLS, Auth ou dados reais: informar impacto e validações. Concluída a tarefa, lembrar /clear.

7. PRIORIDADES
1 Segurança · 2 Integridade dos dados · 3 Isolamento multi-tenant · 4 Segurança escolar · 5 Correção funcional · 6 Não regressão · 7 Confiabilidade · 8 Manutenibilidade · 9 Performance · 10 Custo. Economia de tokens nunca justifica pular análise de segurança ou validação.

8. CORREÇÕES RECOMENDADAS (fora deste arquivo; só com aprovação)
Adotar a seção 1 no CLAUDE.md (133 leituras inteiras de 3 arquivos).
Negar Read de .scratch/** em .claude/settings.json (2,5MB de SQL/HTML).
Sonnet como padrão; Opus só em planejamento (19% dos turnos, 31% do output).
Remover plugins Stitch duplicados (escopo project e user), ~1–2K de preload.
Dividir App.jsx, AdminFaceScanner.jsx e AdminPortal.jsx em módulos.
9. REGRA FINAL
O Zela opera com dados reais: evoluir sem quebrar funcionalidades, sem comprometer segurança, sem violar o isolamento entre escolas e sem criar dívida técnica. FOCO PERMANENTE: GESTÃO E SEGURANÇA ESCOLAR.