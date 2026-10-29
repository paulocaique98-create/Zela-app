// Conteúdo da Central de Ajuda: perfil Recepção (admin).
// item: { id, titulo, serve, faz: [passos], campos?: [[nome, explicação]], dica? }
export const AJUDA_ADMIN = [
  {
    id: 'inicio',
    titulo: 'Início',
    itens: [
      {
        id: 'inicio-home',
        titulo: 'Início',
        serve: 'Tela de abertura da Recepção. Reúne os atalhos dos menus que você mais usa e os avisos que pedem atenção.',
        faz: [
          'Use os cards de atalho para abrir um menu direto. Eles se reordenam sozinhos conforme o seu uso.',
          'Toque no aviso de cadastros pendentes para ir direto à lista de usuários aguardando aprovação.',
        ],
        dica: 'Os atalhos aprendem com os seus cliques: o menu mais usado sobe para o primeiro lugar.',
      },
    ],
  },
  {
    id: 'gerenciamento',
    titulo: 'Gerenciamento',
    itens: [
      {
        id: 'usuarios',
        titulo: 'Usuários',
        serve: 'Consulta das contas da escola e dos cadastros que aguardam aprovação. A Recepção só consulta: a aprovação e a edição são da Gestão, da Coordenação e da Direção.',
        faz: [
          'Abra a aba Pendentes para ver quem aguarda aprovação.',
          'Use a aba Ativos para consultar quem já tem acesso.',
        ],
        dica: 'Se um cadastro precisa de correção, avise a Gestão.',
      },
      {
        id: 'alunos',
        titulo: 'Alunos',
        serve: 'Consulta dos alunos da escola, com turma, responsáveis e situação. Sem o aluno cadastrado, ele não aparece no Monitor.',
        faz: [
          'Busque o aluno pelo nome.',
          'Abra o aluno para ver os dados, os responsáveis e as pessoas autorizadas a buscá-lo.',
        ],
      },
    ],
  },
  {
    id: 'formularios',
    titulo: 'Formulários',
    itens: [
      {
        id: 'ficha-medica',
        titulo: 'Ficha Médica',
        serve: 'Consulta das fichas médicas preenchidas pelas famílias: alergias, medicamentos e contatos de emergência. Disponível quando a escola tem o módulo Formulários.',
        faz: [
          'Escolha o aluno para abrir a ficha.',
          'Consulte alergias e restrições antes de passeios e refeições.',
        ],
        dica: 'A ficha é preenchida pela família. A Recepção consulta e confere.',
      },
    ],
  },
  {
    id: 'checkin',
    titulo: 'Check-in/out',
    itens: [
      {
        id: 'monitor',
        titulo: 'Monitor',
        serve: 'Mostra em tempo real os alunos com entrada ou saída aguardando confirmação. É o centro do fluxo: o responsável pede, a Recepção confirma.',
        faz: [
          'Quando um aluno aparece, confira quem está buscando ou deixando a criança.',
          'Confirme a solicitação para concluir a entrada ou a saída.',
          'Use Aprovar todas para confirmar a fila de uma vez, na ordem em que aparecem.',
          'Cancele uma solicitação feita por engano. O sistema pede confirmação e registra quem cancelou na Auditoria.',
        ],
        dica: 'O número no menu mostra quantas solicitações estão na fila agora.',
      },
      {
        id: 'autoatendimento',
        titulo: 'Autoatendimento',
        serve: 'Tela cheia para o tablet ou totem na entrada da escola. O responsável se identifica por rosto, PIN ou QR Code e gera a solicitação sozinho.',
        faz: [
          'Abra a tela no tablet e deixe-a na entrada.',
          'Para sair da tela, use a engrenagem. O sistema pede a senha da Recepção, para ninguém sair do totem sem autorização.',
          'Pela engrenagem você também abre Cadastrar biometria.',
        ],
        dica: 'A tela se atualiza sozinha quando há versão nova do Zela e ninguém está usando o totem.',
      },
      {
        id: 'carteirinhas-qr',
        titulo: 'Carteirinhas QR',
        serve: 'Gera a carteirinha com QR Code das pessoas autorizadas, para identificação na entrada e na saída. Aparece quando a escola tem o módulo QR Check-in.',
        faz: ['Escolha a pessoa e gere ou reimprima a carteirinha.'],
      },
      {
        id: 'presenca-diaria',
        titulo: 'Presença Diária',
        serve: 'Quem está na escola hoje e quem ainda não chegou, com os horários de entrada e saída registrados.',
        faz: ['Consulte a lista do dia e filtre por turma quando precisar.'],
      },
      {
        id: 'saidas-pendentes',
        titulo: 'Saídas Pendentes',
        serve: 'Saídas que ainda não foram concluídas, para a Recepção acompanhar e resolver.',
        faz: ['Abra a lista e acompanhe cada saída até a conclusão.'],
        dica: 'O número no menu mostra quantas saídas aguardam.',
      },
      {
        id: 'historico-geral',
        titulo: 'Histórico Geral',
        serve: 'Registro de todas as entradas e saídas da escola. Garante rastreabilidade: cada movimento fica guardado e não é apagado.',
        faz: ['Filtre por aluno ou por data e consulte quem fez a retirada e quem confirmou.'],
      },
    ],
  },
  {
    id: 'gestao',
    titulo: 'Gestão (quando liberada)',
    itens: [
      {
        id: 'gestao-liberada',
        titulo: 'Contratos, Despesas, Fornecedores e Financeiro',
        serve: 'O grupo Gestão só aparece quando a Gestão libera esses módulos para a Recepção em Perfis e Permissões. Você vê apenas o que foi liberado.',
        faz: [
          'Contratos e Modelos de Contrato: consulta e, se liberado, gerenciamento dos contratos.',
          'Inadimplência: cobranças vencidas e não pagas. Registre aqui o que foi pago por fora.',
          'Despesas: contas a pagar da escola.',
          'Fornecedores: empresas e pessoas de quem a escola compra ou contrata serviços.',
          'Relatório Financeiro: visão dos números do financeiro.',
        ],
        dica: 'Não está vendo um item? Peça à Gestão para liberar em Perfis e Permissões.',
      },
      {
        id: 'biblioteca',
        titulo: 'Biblioteca',
        serve: 'Acervo da biblioteca, empréstimos e devoluções. A Recepção tem acesso completo quando a escola contrata o módulo Biblioteca.',
        faz: [
          'Acervo: cadastre livros e exemplares (cada um com seu tombo) ou importe a planilha do acervo.',
          'Empréstimos: digite o tombo, use o leitor de código ou a câmera, escolha o aluno ou funcionário e a data de devolução.',
          'Devolução: informe o tombo e toque em Devolver este exemplar.',
          'Atrasados: veja quem está com o livro além do prazo.',
        ],
        dica: 'A família recebe um aviso um dia antes do prazo e outro quando atrasa. A Gestão pode retirar este acesso em Perfis e Permissões.',
      },
    ],
  },
  {
    id: 'sistema',
    titulo: 'Sistema',
    itens: [
      {
        id: 'atualizacoes',
        titulo: 'Atualizações',
        serve: 'Novidades do Zela. Um ponto no menu indica que há novidade ainda não lida.',
        faz: ['Abra a lista para ler o que mudou.'],
      },
      {
        id: 'duplicidade-facial',
        titulo: 'Duplicidade Facial',
        serve: 'Aponta rostos que parecem estar cadastrados em mais de uma pessoa, para a Recepção revisar e evitar identificação errada.',
        faz: ['Abra o caso, compare as pessoas e corrija o cadastro quando for o mesmo rosto.'],
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
        serve: 'Preferências da sua conta e da escola que a Recepção pode ajustar, como senha e notificações.',
        faz: [
          'Ative as notificações para receber aviso na hora, por exemplo quando um responsável se cadastrar.',
          'Altere sua senha sempre que achar necessário.',
        ],
      },
    ],
  },
];
