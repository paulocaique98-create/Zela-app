# Teste manual: escola Tradicional (Fases 0 a 5C)

Use uma escola de TESTE nova. Não use as 4 escolas tradicionais reais de produção, porque os testes criam e apagam dados. Marque cada passo ao concluir e anote o que falhar (tela, perfil, mensagem de erro).

## 0. Preparação (Portal do Dev)
1. Criar a escola de teste com método pedagógico Tradicional (o método é obrigatório na criação).
2. Em Módulos da escola, ligar o módulo Pedagógico Tradicional (pedagogico_tradicional) com as chaves: estrutura_academica_tradicional, avaliacao_tradicional, diario_classe_tradicional. Deixe tarefas_tradicional DESLIGADA por enquanto (liga no passo 7).
3. Criar os usuários de teste: 1 Gestão, 1 Coordenação (perfil Gestão Pedagógica), 2 professores, 1 família com 2 alunos na mesma turma.
4. Conferir: o menu da Gestão NÃO mostra Relatórios de Mitigação nem Mapa de Habilidades (são só do Montessori).

## 1. Estrutura acadêmica (Gestão › Acadêmico › Estrutura acadêmica)
1. Criar ano letivo, segmento Fundamental I e as séries 1º a 5º ano.
2. Criar 2 turmas (ex.: 3º A e 3º B) e 3 disciplinas (Português, Matemática, Ciências).
3. Montar a grade curricular da série e atribuir um professor a cada disciplina e turma.
4. Montar o quadro de horários. Tentar colocar o mesmo professor em duas turmas no mesmo horário: deve avisar ou bloquear.
5. Vincular os alunos às turmas.
Esperado: tudo salva e reaparece após recarregar a página.

## 2. Avaliação (Gestão › Acadêmico › Avaliação)
1. Configurar bimestre (ou trimestre), média mínima 7,0 e pesos.
2. Salvar, recarregar e conferir que a configuração permanece.
3. Entrar como professor, abrir o lançamento de notas, lançar notas para alunos da turma dele.
Esperado: a média calcula certo conforme os pesos. O professor 2 NÃO vê as turmas do professor 1.

## 3. Diário de classe (Professor) e frequência (Gestão › Frequência por disciplina)
1. Como professor, registrar uma aula (data e quantidade de aulas do dia) e a frequência por aluno.
2. Marcar uma falta justificada e conferir que ela conta como presença.
3. Lançar faltas suficientes em um aluno para passar do limite e abrir Frequência por disciplina como Gestão.
Esperado: o alerta de frequência aparece para o aluno.

## 4. Boletim e resultado final (Gestão › Boletim e resultado)
1. Como Coordenação, escolher a turma, ver o resultado calculado e fechar.
2. Testar 3 casos: aluno aprovado, aluno em recuperação, aluno reprovado.
3. Como Gestão (sem perfil pedagógico), tentar fechar: o esperado é só ver, sem escrever.
4. Como família, abrir a aba Boletim: ver só o resultado FECHADO do próprio filho, nunca o do colega, e nada de resultado ainda aberto.

## 5. Ata e histórico (Gestão › Ata do conselho)
1. Como Coordenação, criar a ata de uma turma e período (pauta, deliberações, encaminhamentos). Só uma por turma e período.
2. Como Gestão e como professor, tentar editar a ata: deve ser bloqueado.
3. Como família, abrir o histórico escolar na aba Boletim e imprimir.

## 6. Promoção de série (Gestão › Promoção de série)
1. Com resultados fechados, abrir a tela como Coordenação.
2. Esperado: aprovado sobe de série, reprovado repete, em recuperação final fica pendente, aluno da última série vira concluinte.
3. Confirmar a promoção. Conferir que só a turma do aluno mudou e que boletim e histórico do ano anterior continuam intactos.
4. Como Gestão ou professor, tentar promover: deve ser bloqueado.

## 7. Tarefas e BNCC (só depois de aplicar a correção de textos da BNCC)
1. No Portal do Dev, ligar tarefas_tradicional na escola de teste.
2. Como professor, publicar uma tarefa (título, orientações, data de entrega) para uma turma e disciplina dele. Marcar até 10 habilidades BNCC; o filtro deve respeitar o ano da série e o componente.
3. Tentar publicar para turma ou disciplina que não é dele: deve ser bloqueado.
4. Como Coordenação, ver e corrigir a tarefa na aba Tarefas.
5. Como família, ver a tarefa só da turma do filho, com os códigos BNCC em chips.

## 8. Isolamento entre escolas (o mais importante)
1. Logado na escola de teste, confirmar que NÃO aparece aluno, turma, nota, tarefa ou ata de outra escola.
2. Com a família da escola de teste, tentar abrir dados de um aluno que não é filho dela: deve negar.
3. Se possível, repetir 1 e 2 com uma segunda escola de teste.

## 9. Montessori não pode mudar
Entrar em uma escola Montessori de teste (não a real, se possível) e conferir que o menu continua igual: Mitigação e Mapa de Habilidades presentes, e nenhuma aba da lista Tradicional (Estrutura, Avaliação, Frequência por disciplina, Boletim e resultado, Ata, Promoção, Tarefas).

## 10. Ao terminar
Anote quais passos falharam. Passos 1 a 9 ok significa que "falta testar no navegador" pode ser riscado no PLANO_METODO_TRADICIONAL.md.
