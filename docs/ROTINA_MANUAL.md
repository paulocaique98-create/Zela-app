ROTINA MANUAL — ECONOMIA DE TOKENS NO ZELA
Guia para o dono do projeto. Lista só o que o Claude não consegue fazer sozinho. Não é lido pelo Claude (não é citado no CLAUDE.md), então não gasta tokens. Sugestão de local: docs/ROTINA_MANUAL.md.

Por que isso importa
Nos logs de 20/08 a 05/10, uma única sessão rodou 10.262 turnos, 86% deles com mais de 200K de contexto (média ~495K, pico 967K). Cada turno relê todo o contexto acumulado. O custo vem de sessões longas, não do tamanho do CLAUDE.md. Início saudável de sessão: ~48K (5% da janela de 1M).

Como funciona
O CLAUDE.md guia o Claude enquanto ele trabalha (buscar antes de ler, limitar saídas, responder curto, atualizar o status). Isso é automático.
O Claude só age quando você manda uma mensagem. Ele não decide sozinho encerrar, limpar ou trocar de sessão, e não digita comandos de barra (/clear, /compact...).

Por isso o ciclo abaixo é seu.

Resumo do ciclo
Quando	O que você faz	Comando
Terminou a tarefa	Testar, pedir fechamento, revisar status	prompt do passo 2
Tarefa fechada	Commitar	prompt do passo 4
Mudou de assunto	Zerar o contexto	/clear
Sessão nova	Iniciar com escopo exato	prompt do 

passo 6
A cada ~50 turnos	Ver o contexto	/context
150K–200K	Compactar	/compact (passo 8)
Mais de 200K	Fechar e abrir outra sessão	passos 2 a 5

1. Testar a tela de verdade
Por quê: o Claude não sabe se a tela ficou como você quer. Teste automatizado não substitui olhar o navegador.
O que fazer: abra a tela e use o fluxo que você alterou. Depois peça só as falhas dos testes:
Rode `npx vitest run <arquivo relacionado>` e mostre só as falhas (últimas 60 linhas).
Para quê: só fechar algo que está de fato validado.

2. Pedir o fechamento da tarefa
Por quê: o docs/ZELA_STATUS.md é o que a próxima sessão lê. Se ele não for atualizado, a sessão seguinte explora o projeto inteiro e gasta tokens.
Comando:

Tarefa concluída. Atualize docs/ZELA_STATUS.md em até 5 linhas, resuma em até 10 linhas e diga se devo rodar /clear.

Para quê: deixar o estado atual registrado em poucas linhas.

3. Revisar o docs/ZELA_STATUS.md
Por quê: o Claude pode registrar algo errado, e depois ele confia no arquivo.

O que fazer: abra o arquivo, confira "Em andamento" e "Pendências conhecidas" e corrija. Não coloque senhas, chaves nem dados reais de alunos.
Para quê: garantir que a próxima sessão parta de informação correta.

4. Commitar
Por quê: o git log guarda o histórico e o estado da entrega. Assim a próxima sessão não depende do contexto da anterior.

Comando (peça ao Claude e aprove):
Faça o commit das alterações desta tarefa com uma mensagem curta no padrão do projeto (feat/fix). Mostre só `git status -s` antes.

Para quê: fechar a tarefa com um ponto de retorno.

5. Zerar o contexto
Por quê: nos logs, a falta disso explica o maior custo (5,1B de tokens relidos do cache numa sessão de 46 dias).

Comando:
/clear

Para quê: começar o próximo assunto com ~48K em vez de centenas de milhares.

Se for continuar a mesma frente de trabalho, antes do /clear peça e copie o resumo:

Resuma em até 15 linhas: objetivo, o que foi feito, arquivos alterados, o que falta. Vou colar isso em uma sessão nova depois de /clear.

Se for outra tarefa, pule o resumo. O ZELA_STATUS.md já basta.

6. Iniciar a sessão nova com escopo exato
Por quê: pedido vago gera exploração, que gera leitura, que gera contexto.
Comando:

Leia só CLAUDE.md e docs/ZELA_STATUS.md. Tarefa: <1–2 frases>. Escopo: <arquivo(s)/função>. Não leia outros arquivos sem me avisar. Responda curto.

Para quê: o Claude lê só o necessário e já sabe onde agir.

Tarefa grande? Peça o plano antes de editar:
Plano em no máximo 10 itens, sem código, citando só arquivos a alterar. Aguarde meu OK antes de editar.

7. Escolher o modelo no início
Por quê: Opus teve 19% dos turnos e 31% do output nos seus logs, com preço por token maior. Trocar de modelo no meio da sessão reescreve o cache inteiro.

Comando: /model (só no início da sessão).
Regra: Sonnet para executar; Opus só em sessão própria de planejamento.

8. Acompanhar e compactar o contexto
Por quê: o Claude não mede o contexto com precisão. O compactar automático só dispara perto do limite (os logs mostram picos de 967K).

Ver o tamanho (a cada ~50 turnos ou quando a sessão ficar lenta):
/context

Compactar entre 150K e 200K, se a tarefa ainda não acabou:
/compact Manter: objetivo, arquivos alterados (caminho e motivo), decisões de segurança/RLS, testes pendentes. Descartar: saídas de comandos, código já aplicado, tentativas descartadas.

Acima de 200K: feche a tarefa (passos 2 a 5) e abra uma sessão nova.

Esses números (150K e 200K) são referências baseadas nos seus logs, não limites do sistema.

9. Desfazer um passo ruim
Por quê: uma correção longa por mensagens adiciona contexto. Voltar atrás não.
Comando: /rewind

Para quê: descartar o último passo e tentar de novo com um pedido melhor.

10. Pedir trechos, não arquivos inteiros
Por quê: App.jsx foi lido 54 vezes, AdminFaceScanner.jsx 45 e AdminPortal.jsx 34 (~2,6M tokens injetados).

Como pedir:
Use Grep para localizar <símbolo/texto> em src/. Mostre só arquivo:linha. Não abra arquivos ainda.
Leia apenas as linhas <N>–<M> de <arquivo> e explique <ponto>. Não leia mais.

Para quê: o Claude lê 3–5K tokens em vez de ~20K por leitura.

Observações
Alguns comandos (/cost, /rewind, /resume) variam com a versão e o plano. Se um não existir na sua extensão, ignore a linha.
/resume: use só para retomar uma sessão curta e específica, nunca uma gigante.
Se o Claude responder de forma genérica sobre as regras de economia, abra uma sessão nova: o CLAUDE.md é lido no início da sessão.

Para achar um comando depois, sem gastar tokens, rode no terminal do Zela:
grep -n "/compact" docs/ROTINA_MANUAL.md

Contar_turnos.js para contar os turnos em uma pasta

Rodar no terminal do Zela:
node docs/contar_turnos.cjs