// Conteúdo da Central de Ajuda: perfil Família.
export const AJUDA_FAMILIA = [
  {
    id: 'inicio',
    titulo: 'Início',
    itens: [
      {
        id: 'inicio-home',
        titulo: 'Início',
        serve: 'Tela de abertura com atalhos e avisos do seu filho e da escola.',
        faz: ['Toque em um card para abrir o menu. Os mais usados sobem para o começo.'],
      },
    ],
  },
  {
    id: 'formularios',
    titulo: 'Formulários',
    itens: [
      {
        id: 'matriculas',
        titulo: 'Matrículas',
        serve: 'Acompanhe e preencha a matrícula ou a rematrícula do seu filho.',
        faz: ['Abra a matrícula e preencha o que estiver pendente.', 'Envie para a escola analisar.'],
      },
      {
        id: 'ficha-medica',
        titulo: 'Ficha Médica',
        serve: 'Informações de saúde do seu filho: alergias, medicamentos e contatos de emergência. A escola usa para cuidar dele com segurança.',
        faz: ['Escolha o aluno e preencha a ficha.', 'Atualize sempre que algo mudar.'],
      },
    ],
  },
  {
    id: 'gerenciamento',
    titulo: 'Gerenciamento',
    itens: [
      {
        id: 'responsaveis',
        titulo: 'Responsáveis',
        serve: 'Gerencia quem é responsável pelo aluno e tem acesso ao app.',
        faz: ['Consulte os responsáveis cadastrados.', 'Peça à escola para ajustar quando houver mudança.'],
      },
      {
        id: 'dados-cadastrais',
        titulo: 'Dados Cadastrais',
        serve: 'Seus dados pessoais e de contato. A escola usa para falar com você.',
        faz: ['Confira telefone e e-mail.', 'Atualize quando mudarem.'],
      },
    ],
  },
  {
    id: 'checkin',
    titulo: 'Check-in/out',
    itens: [
      {
        id: 'acompanhamento',
        titulo: 'Acompanhamento',
        serve: 'Mostra se seu filho está na escola, a caminho ou já saiu, em tempo real. Daqui você também avisa quando ele vai faltar.',
        faz: ['Consulte a situação do dia.', 'Se seu filho não for à aula, avise a escola por aqui.'],
      },
      {
        id: 'autorizados',
        titulo: 'Autorizados',
        serve: 'Pessoas que podem buscar seu filho. Cada uma é identificada por rosto, PIN ou QR Code na saída. A foto é guardada com segurança e só é usada para essa identificação.',
        faz: [
          'Cadastre a pessoa com nome e foto do rosto.',
          'Registre o consentimento para o uso da imagem, como pede a lei de proteção de dados.',
          'Remova quem não deve mais buscar a criança.',
        ],
        dica: 'Cadastre todas as pessoas antes de elas aparecerem na escola. Quem não está na lista não consegue retirar o aluno.',
      },
      {
        id: 'historico',
        titulo: 'Histórico Geral',
        serve: 'Registro de todas as entradas e saídas do seu filho, com data, hora e quem retirou.',
        faz: ['Filtre por data para conferir um dia específico.'],
      },
    ],
  },
  {
    id: 'academico',
    titulo: 'Acadêmico',
    itens: [
      {
        id: 'calendario',
        titulo: 'Calendário Escolar',
        serve: 'Datas importantes da escola: feriados, reuniões e eventos.',
        faz: ['Consulte o mês e toque em um evento para ver os detalhes.'],
      },
      {
        id: 'comunicados',
        titulo: 'Comunicados',
        serve: 'Avisos que a escola envia para as famílias.',
        faz: ['Leia os avisos novos. O sino indica o que ainda não foi lido.'],
      },
      {
        id: 'mural-fotos',
        titulo: 'Mural de Fotos',
        serve: 'Fotos das atividades da turma do seu filho.',
        faz: ['Abra o mural e veja as fotos mais recentes.'],
      },
      {
        id: 'biblioteca',
        titulo: 'Biblioteca',
        serve: 'Livros da biblioteca que seu filho levou e a data de devolução.',
        faz: ['Veja o que está com seu filho e até quando devolver.', 'Você recebe um aviso um dia antes do prazo e outro se atrasar.'],
      },
      {
        id: 'cardapio',
        titulo: 'Cardápio',
        serve: 'O que será servido na escola durante a semana.',
        faz: ['Consulte o cardápio do dia ou da semana.'],
      },
      {
        id: 'diario',
        titulo: 'Diário',
        serve: 'Relato do dia a dia do seu filho, escrito pela professora: alimentação, sono e atividades.',
        faz: ['Escolha o aluno e a data para ler o registro.'],
      },
      {
        id: 'pesquisas',
        titulo: 'Pesquisas',
        serve: 'Pesquisas de satisfação da escola, para você dar sua opinião.',
        faz: ['Quando houver uma pesquisa aberta, ela aparece na Início.', 'Responda uma vez. Se for anônima, a escola não vê quem respondeu.'],
      },
      {
        id: 'ocorrencias',
        titulo: 'Ocorrências',
        serve: 'Registros da escola sobre o seu filho que a escola decidiu compartilhar.',
        faz: ['Leia a ocorrência.', 'Quando pedir ciência, toque em Li e estou ciente.'],
      },
      {
        id: 'boletim',
        metodos: ['tradicional'],
        titulo: 'Boletim',
        serve: 'Notas e resultado do seu filho. Aparece quando a escola usa o método tradicional.',
        faz: ['Escolha o aluno e o período.'],
      },
      {
        id: 'tarefas',
        metodos: ['tradicional'],
        titulo: 'Tarefas',
        serve: 'Tarefas de casa enviadas pelas professoras, com prazo. Aparece quando a escola usa o método tradicional.',
        faz: ['Consulte as tarefas e o prazo de cada uma.'],
      },
    ],
  },
  {
    id: 'relatorios',
    titulo: 'Relatórios',
    itens: [
      {
        id: 'relatorios-familia',
        metodos: ['montessori', 'personalizado'],
        titulo: 'Relatórios',
        serve: 'Relatórios sobre o desenvolvimento do seu filho. A família vê o Semestral e a Mitigação.',
        faz: ['Escolha o relatório e leia.', 'Procure a professora se tiver dúvida.'],
      },
    ],
  },
  {
    id: 'financeiro',
    titulo: 'Financeiro',
    itens: [
      {
        id: 'financeiro',
        titulo: 'Financeiro',
        serve: 'Mensalidades e pagamentos do seu filho. Aparece quando a escola usa o módulo financeiro.',
        faz: ['Consulte as mensalidades em aberto e as pagas.'],
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
        serve: 'Suas preferências, como senha, notificações e documentos como contratos.',
        faz: ['Ative as notificações para saber na hora quando seu filho chegar ou sair.', 'Consulte os contratos da escola.'],
      },
    ],
  },
];
