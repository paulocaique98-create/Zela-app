// Conteúdo da Central de Ajuda: perfil Professor.
export const AJUDA_PROFESSOR = [
  {
    id: 'inicio',
    titulo: 'Início e Monitor',
    itens: [
      {
        id: 'inicio-home',
        titulo: 'Início',
        serve: 'Tela de abertura com os atalhos dos menus que você mais usa.',
        faz: ['Toque em um card para abrir o menu. Os mais usados sobem para o começo.'],
      },
      {
        id: 'monitor',
        titulo: 'Monitor',
        serve: 'Mostra os alunos da sua turma que estão chegando ou saindo, em tempo real.',
        faz: ['Acompanhe a fila. A confirmação da entrada e da saída é feita pela Recepção.'],
        dica: 'O número no menu mostra quantas solicitações estão aguardando.',
      },
    ],
  },
  {
    id: 'turma',
    titulo: 'Rotina da turma',
    itens: [
      {
        id: 'frequencia',
        titulo: 'Frequência',
        serve: 'Registro de presença e falta dos alunos da sua turma.',
        faz: ['Escolha a turma e a data.', 'Marque presença ou falta de cada aluno e salve.'],
      },
      {
        id: 'notas',
        metodos: ['tradicional', 'personalizado'],
        titulo: 'Notas',
        serve: 'Lançamento das notas dos seus alunos. Aparece quando a escola usa o método tradicional.',
        faz: ['Escolha a turma e a avaliação.', 'Digite a nota de cada aluno e salve.'],
      },
      {
        id: 'diario-classe',
        metodos: ['tradicional', 'personalizado'],
        titulo: 'Diário de classe',
        serve: 'Registro das aulas dadas e da frequência por disciplina. Aparece quando a escola usa o método tradicional.',
        faz: ['Escolha a turma e a disciplina.', 'Registre o conteúdo da aula e a frequência.'],
      },
      {
        id: 'tarefas',
        metodos: ['tradicional', 'personalizado'],
        titulo: 'Tarefas',
        serve: 'Criação das tarefas de casa e acompanhamento do que foi entregue. As famílias veem as tarefas no app.',
        faz: ['Crie a tarefa com título, descrição e prazo.', 'Escolha a turma que vai recebê-la.'],
      },
      {
        id: 'saidas-pendentes',
        titulo: 'Saídas Pendentes',
        serve: 'Saídas que ainda não foram concluídas, para acompanhar.',
        faz: ['Abra a lista e acompanhe cada saída.'],
      },
    ],
  },
  {
    id: 'academico',
    titulo: 'Acadêmico',
    itens: [
      {
        id: 'diario',
        titulo: 'Diário',
        serve: 'Registro do dia a dia da criança (alimentação, sono e atividades) que a família acompanha pelo app.',
        faz: ['Escolha o aluno e registre o que aconteceu no dia.'],
        dica: 'Escreva de forma simples e acolhedora. A família lê.',
      },
      {
        id: 'cardapio',
        titulo: 'Cardápio',
        serve: 'Consulta do cardápio da semana, o mesmo que as famílias veem.',
        faz: ['Consulte as refeições do dia antes de atividades com alimentos.'],
      },
      {
        id: 'mural-fotos',
        titulo: 'Mural de Fotos',
        serve: 'Fotos das atividades da turma, compartilhadas com as famílias.',
        faz: ['Envie as fotos e escolha a turma.', 'Confira se todas as crianças da foto têm autorização da família.'],
      },
    ],
  },
  {
    id: 'relatorios',
    titulo: 'Relatórios',
    itens: [
      {
        id: 'relatorios-professor',
        metodos: ['montessori', 'personalizado'],
        titulo: 'Relatórios pedagógicos',
        serve: 'Relatórios que as professoras preenchem sobre cada aluno, como a Mitigação e o Mapa de Habilidades. A coordenação e a direção apenas editam. A família vê só o Semestral e a Mitigação.',
        faz: ['Escolha o relatório e o aluno.', 'Preencha e salve. Você pode voltar e continuar depois.'],
      },
    ],
  },
  {
    id: 'configuracoes',
    titulo: 'Configurações',
    itens: [
      {
        id: 'config',
        titulo: 'Configurações',
        serve: 'Preferências da sua conta, como senha e notificações.',
        faz: ['Ative as notificações para saber das novidades na hora.', 'Altere sua senha quando precisar.'],
      },
    ],
  },
];
